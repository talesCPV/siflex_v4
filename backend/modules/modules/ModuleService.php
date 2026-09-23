<?php
declare(strict_types=1);

final class ModuleService
{
    public function __construct(private PDO $pdo) {}

    public function list(string $search, string $status): array
    {
        $where = [];
        $params = [];
        if ($search !== '') {
            $where[] = '(m.code LIKE ? OR m.name LIKE ? OR m.description LIKE ? OR m.route LIKE ?)';
            $term = '%' . $search . '%';
            array_push($params, $term, $term, $term, $term);
        }
        if (in_array($status, ['active', 'inactive'], true)) {
            $where[] = 'm.status = ?';
            $params[] = $status;
        }
        $sql = 'SELECT m.id, m.code, m.name, m.menu_label, m.description, m.icon, m.route,
                       m.parent_id, m.sort_order, m.status, m.created_at, m.updated_at,
                       p.name AS parent_name,
                       GROUP_CONCAT(DISTINCT mp.permission_id ORDER BY mp.permission_id SEPARATOR \',\') AS permission_ids
                FROM modules m LEFT JOIN modules p ON p.id = m.parent_id
                LEFT JOIN module_permissions mp ON mp.module_id = m.id';
        if ($where) $sql .= ' WHERE ' . implode(' AND ', $where);
        $sql .= ' GROUP BY m.id, m.code, m.name, m.menu_label, m.description, m.icon, m.route, m.parent_id, m.sort_order, m.status, m.created_at, m.updated_at, p.name';
        $sql .= ' ORDER BY COALESCE(p.sort_order, m.sort_order), p.name, m.sort_order, m.name, m.code';
        $stmt = $this->pdo->prepare($sql);
        $stmt->execute($params);
        return array_map(function(array $row): array {
            $row['permission_ids'] = $row['permission_ids'] !== null && $row['permission_ids'] !== ''
                ? array_map('intval', explode(',', (string)$row['permission_ids'])) : [];
            return $row;
        }, $stmt->fetchAll());
    }

    public function get(int $id): ?array
    {
        $stmt = $this->pdo->prepare('SELECT m.id, m.code, m.name, m.menu_label, m.description, m.icon, m.route, m.parent_id, m.sort_order, m.status, m.created_at, m.updated_at,
                   GROUP_CONCAT(DISTINCT mp.permission_id ORDER BY mp.permission_id SEPARATOR \',\') AS permission_ids
            FROM modules m LEFT JOIN module_permissions mp ON mp.module_id = m.id
            WHERE m.id = ?
            GROUP BY m.id, m.code, m.name, m.menu_label, m.description, m.icon, m.route, m.parent_id, m.sort_order, m.status, m.created_at, m.updated_at
            LIMIT 1');
        $stmt->execute([$id]);
        $module = $stmt->fetch();
        if (!$module) return null;
        $module['permission_ids'] = $module['permission_ids'] !== null && $module['permission_ids'] !== ''
            ? array_map('intval', explode(',', (string)$module['permission_ids'])) : [];
        return $module;
    }

    public function parents(?int $excludeId = null): array
    {
        $sql = 'SELECT id, code, name, parent_id, sort_order, status FROM modules';
        $params = [];
        if ($excludeId !== null) { $sql .= ' WHERE id <> ?'; $params[] = $excludeId; }
        $sql .= ' ORDER BY sort_order, name, code';
        $stmt = $this->pdo->prepare($sql);
        $stmt->execute($params);
        return $stmt->fetchAll();
    }

    public function create(array $data, int $actorId): array
    {
        $this->assertUnique($data['code'], null);
        $this->assertParent($data['parent_id'], null);
        $this->assertPermissions($data['permission_ids']);
        $this->pdo->beginTransaction();
        try {
            $stmt = $this->pdo->prepare('INSERT INTO modules (code, name, menu_label, description, icon, route, parent_id, sort_order, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
            $stmt->execute([$data['code'], $data['name'], $data['menu_label'], $data['description'], $data['icon'], $data['route'], $data['parent_id'], $data['sort_order'], $data['status']]);
            $id = (int)$this->pdo->lastInsertId();
            $this->replacePermissions($id, $data['permission_ids']);
            $created = $this->get($id);
            $this->audit($actorId, 'create', $id, null, $created);
            $this->pdo->commit();
            return $created;
        } catch (Throwable $e) {
            if ($this->pdo->inTransaction()) $this->pdo->rollBack();
            throw $e;
        }
    }

    public function update(int $id, array $data, int $actorId): array
    {
        $old = $this->get($id);
        if (!$old) throw new InvalidArgumentException('Módulo não encontrado.', 404);
        $this->assertUnique($data['code'], $id);
        $this->assertParent($data['parent_id'], $id);
        $this->assertPermissions($data['permission_ids']);
        $this->pdo->beginTransaction();
        try {
            $stmt = $this->pdo->prepare('UPDATE modules SET code = ?, name = ?, menu_label = ?, description = ?, icon = ?, route = ?, parent_id = ?, sort_order = ?, status = ? WHERE id = ?');
            $stmt->execute([$data['code'], $data['name'], $data['menu_label'], $data['description'], $data['icon'], $data['route'], $data['parent_id'], $data['sort_order'], $data['status'], $id]);
            $this->replacePermissions($id, $data['permission_ids']);
            $updated = $this->get($id);
            $this->audit($actorId, 'update', $id, $old, $updated);
            $this->pdo->commit();
            return $updated;
        } catch (Throwable $e) {
            if ($this->pdo->inTransaction()) $this->pdo->rollBack();
            throw $e;
        }
    }

    public function inactivate(int $id, int $actorId): array
    {
        $old = $this->get($id);
        if (!$old) throw new InvalidArgumentException('Módulo não encontrado.', 404);
        $stmt = $this->pdo->prepare("UPDATE modules SET status = 'inactive' WHERE id = ?");
        $stmt->execute([$id]);
        $updated = $this->get($id);
        $this->audit($actorId, 'inactivate', $id, $old, $updated);
        return $updated;
    }

    private function assertPermissions(array $permissionIds): void
    {
        if (!$permissionIds) throw new InvalidArgumentException('Selecione pelo menos uma permissão para o módulo.', 422);
        $ids = array_values(array_unique(array_map('intval', $permissionIds)));
        $placeholders = implode(',', array_fill(0, count($ids), '?'));
        $stmt = $this->pdo->prepare("SELECT COUNT(*) FROM permissions WHERE id IN ($placeholders)");
        $stmt->execute($ids);
        if ((int)$stmt->fetchColumn() !== count($ids)) throw new InvalidArgumentException('Uma ou mais permissões selecionadas não existem.', 422);
    }

    private function replacePermissions(int $moduleId, array $permissionIds): void
    {
        $this->pdo->prepare('DELETE FROM module_permissions WHERE module_id = ?')->execute([$moduleId]);
        $stmt = $this->pdo->prepare('INSERT INTO module_permissions (module_id, permission_id) VALUES (?, ?)');
        foreach (array_values(array_unique(array_map('intval', $permissionIds))) as $permissionId) {
            $stmt->execute([$moduleId, $permissionId]);
        }
    }

    private function assertUnique(string $code, ?int $exceptId): void
    {
        $sql = 'SELECT id FROM modules WHERE code = ?' . ($exceptId ? ' AND id <> ?' : '') . ' LIMIT 1';
        $stmt = $this->pdo->prepare($sql);
        $stmt->execute($exceptId ? [$code, $exceptId] : [$code]);
        if ($stmt->fetchColumn()) throw new InvalidArgumentException('Este código de módulo já existe.', 409);
    }

    private function assertParent(?int $parentId, ?int $moduleId): void
    {
        if ($parentId === null) return;
        if ($moduleId !== null && $parentId === $moduleId) throw new InvalidArgumentException('Um módulo não pode ser pai de si mesmo.', 422);
        $stmt = $this->pdo->prepare('SELECT id FROM modules WHERE id = ? LIMIT 1');
        $stmt->execute([$parentId]);
        if (!$stmt->fetchColumn()) throw new InvalidArgumentException('O módulo pai selecionado não existe.', 422);
        $current = $parentId;
        $visited = [];
        while ($current !== null) {
            if (isset($visited[$current])) throw new InvalidArgumentException('A hierarquia atual de módulos contém um ciclo.', 422);
            $visited[$current] = true;
            if ($moduleId !== null && $current === $moduleId) throw new InvalidArgumentException('O módulo pai escolhido criaria um ciclo na hierarquia.', 422);
            $stmt = $this->pdo->prepare('SELECT parent_id FROM modules WHERE id = ? LIMIT 1');
            $stmt->execute([$current]);
            $value = $stmt->fetchColumn();
            $current = ($value === false || $value === null) ? null : (int)$value;
        }
    }

    private function audit(int $actorId, string $action, int $entityId, ?array $oldData, ?array $newData): void
    {
        $stmt = $this->pdo->prepare('INSERT INTO audit_logs (user_id, module_code, action, entity_type, entity_id, old_data, new_data, ip_address) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
        $stmt->execute([$actorId, 'modules', $action, 'module', (string)$entityId,
            $oldData !== null ? json_encode($oldData, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) : null,
            $newData !== null ? json_encode($newData, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) : null,
            $_SERVER['REMOTE_ADDR'] ?? null]);
    }
}
