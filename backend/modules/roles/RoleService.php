<?php
declare(strict_types=1);

final class RoleService
{
    public function __construct(private PDO $pdo) {}

    public function list(string $search, string $status): array
    {
        $where = [];
        $params = [];
        if ($search !== '') {
            $where[] = '(r.code LIKE ? OR r.name LIKE ? OR r.description LIKE ?)';
            $term = '%' . $search . '%';
            array_push($params, $term, $term, $term);
        }
        if (in_array($status, ['active', 'inactive'], true)) {
            $where[] = 'r.status = ?';
            $params[] = $status;
        }
        $sql = 'SELECT r.id, r.code, r.name, r.description, r.status, r.created_at, r.updated_at,
                       COUNT(DISTINCT ur.user_id) AS user_count,
                       COUNT(DISTINCT rp.permission_id) AS permission_count
                FROM roles r
                LEFT JOIN user_roles ur ON ur.role_id = r.id
                LEFT JOIN role_permissions rp ON rp.role_id = r.id';
        if ($where) $sql .= ' WHERE ' . implode(' AND ', $where);
        $sql .= ' GROUP BY r.id ORDER BY r.name, r.code';
        $stmt = $this->pdo->prepare($sql);
        $stmt->execute($params);
        return $stmt->fetchAll();
    }

    public function permissions(): array
    {
        return $this->pdo->query(
            'SELECT id, code, name FROM permissions ORDER BY code'
        )->fetchAll();
    }

    public function get(int $id): ?array
    {
        $stmt = $this->pdo->prepare('SELECT id, code, name, description, status, created_at, updated_at FROM roles WHERE id = ? LIMIT 1');
        $stmt->execute([$id]);
        $role = $stmt->fetch();
        if (!$role) return null;
        $stmt = $this->pdo->prepare('SELECT permission_id FROM role_permissions WHERE role_id = ? ORDER BY permission_id');
        $stmt->execute([$id]);
        $role['permission_ids'] = array_map('intval', array_column($stmt->fetchAll(), 'permission_id'));
        return $role;
    }

    public function create(array $data, array $permissionIds, int $actorId): array
    {
        $this->assertUnique($data['code'], null);
        $this->assertPermissions($permissionIds);
        $this->pdo->beginTransaction();
        try {
            $stmt = $this->pdo->prepare('INSERT INTO roles (code, name, description, status) VALUES (?, ?, ?, ?)');
            $stmt->execute([$data['code'], $data['name'], $data['description'], $data['status']]);
            $id = (int)$this->pdo->lastInsertId();
            $this->replacePermissions($id, $permissionIds);
            $created = $this->get($id);
            $this->audit($actorId, 'create', $id, null, $created);
            $this->pdo->commit();
            return $created;
        } catch (Throwable $e) {
            if ($this->pdo->inTransaction()) $this->pdo->rollBack();
            throw $e;
        }
    }

    public function update(int $id, array $data, array $permissionIds, int $actorId): array
    {
        $old = $this->get($id);
        if (!$old) throw new InvalidArgumentException('Perfil não encontrado.', 404);
        if ($old['code'] === 'ROOT' && $data['status'] !== 'active') {
            throw new InvalidArgumentException('O perfil ROOT não pode ser inativado.', 422);
        }
        $this->assertUnique($data['code'], $id);
        $this->assertPermissions($permissionIds);
        $this->pdo->beginTransaction();
        try {
            $stmt = $this->pdo->prepare('UPDATE roles SET code = ?, name = ?, description = ?, status = ? WHERE id = ?');
            $stmt->execute([$data['code'], $data['name'], $data['description'], $data['status'], $id]);
            $this->replacePermissions($id, $permissionIds);
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
        if (!$old) throw new InvalidArgumentException('Perfil não encontrado.', 404);
        if ($old['code'] === 'ROOT') throw new InvalidArgumentException('O perfil ROOT não pode ser inativado.', 422);
        $stmt = $this->pdo->prepare("UPDATE roles SET status = 'inactive' WHERE id = ?");
        $stmt->execute([$id]);
        $updated = $this->get($id);
        $this->audit($actorId, 'inactivate', $id, $old, $updated);
        return $updated;
    }

    private function assertUnique(string $code, ?int $exceptId): void
    {
        $sql = 'SELECT id FROM roles WHERE code = ?' . ($exceptId ? ' AND id <> ?' : '') . ' LIMIT 1';
        $params = $exceptId ? [$code, $exceptId] : [$code];
        $stmt = $this->pdo->prepare($sql);
        $stmt->execute($params);
        if ($stmt->fetchColumn()) throw new InvalidArgumentException('Este código de perfil já existe.', 409);
    }

    private function assertPermissions(array $ids): void
    {
        if (!$ids) return;
        $ph = implode(',', array_fill(0, count($ids), '?'));
        $stmt = $this->pdo->prepare("SELECT id FROM permissions WHERE id IN ($ph)");
        $stmt->execute($ids);
        $found = array_map('intval', array_column($stmt->fetchAll(), 'id'));
        if (count($found) !== count($ids)) throw new InvalidArgumentException('Uma das permissões selecionadas não existe.', 422);
    }

    private function replacePermissions(int $roleId, array $ids): void
    {
        $this->pdo->prepare('DELETE FROM role_permissions WHERE role_id = ?')->execute([$roleId]);
        if (!$ids) return;
        $stmt = $this->pdo->prepare('INSERT INTO role_permissions (role_id, permission_id) VALUES (?, ?)');
        foreach ($ids as $id) $stmt->execute([$roleId, $id]);
    }

    private function audit(int $actorId, string $action, int $entityId, ?array $oldData, ?array $newData): void
    {
        $stmt = $this->pdo->prepare(
            'INSERT INTO audit_logs (user_id, module_code, action, entity_type, entity_id, old_data, new_data, ip_address)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
        );
        $stmt->execute([
            $actorId, 'roles', $action, 'role', (string)$entityId,
            $oldData !== null ? json_encode($oldData, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) : null,
            $newData !== null ? json_encode($newData, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) : null,
            $_SERVER['REMOTE_ADDR'] ?? null,
        ]);
    }
}
