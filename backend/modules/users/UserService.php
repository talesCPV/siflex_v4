<?php
declare(strict_types=1);

final class UserService
{
    public function __construct(private PDO $pdo) {}

    public function list(string $search, string $status, int $page, int $perPage): array
    {
        $where = [];
        $params = [];
        if ($search !== '') {
            $where[] = '(username LIKE ? OR display_name LIKE ? OR email LIKE ?)';
            $term = '%' . $search . '%';
            array_push($params, $term, $term, $term);
        }
        if (in_array($status, ['active', 'blocked', 'inactive'], true)) {
            $where[] = 'status = ?';
            $params[] = $status;
        }
        $whereSql = $where ? ' WHERE ' . implode(' AND ', $where) : '';

        $count = $this->pdo->prepare('SELECT COUNT(*) FROM users' . $whereSql);
        $count->execute($params);
        $total = (int)$count->fetchColumn();
        $offset = ($page - 1) * $perPage;

        $sql = 'SELECT id, username, email, display_name, status, last_login_at, created_at, updated_at
                FROM users' . $whereSql . ' ORDER BY display_name, username LIMIT ' . $perPage . ' OFFSET ' . $offset;
        $stmt = $this->pdo->prepare($sql);
        $stmt->execute($params);
        $users = $stmt->fetchAll();

        if ($users) {
            $ids = array_map('intval', array_column($users, 'id'));
            $ph = implode(',', array_fill(0, count($ids), '?'));
            $roleStmt = $this->pdo->prepare(
                'SELECT ur.user_id, r.id, r.code, r.name
                 FROM user_roles ur INNER JOIN roles r ON r.id = ur.role_id
                 WHERE ur.user_id IN (' . $ph . ') ORDER BY r.name'
            );
            $roleStmt->execute($ids);
            $byUser = [];
            foreach ($roleStmt->fetchAll() as $role) {
                $byUser[(int)$role['user_id']][] = [
                    'id' => (int)$role['id'], 'code' => $role['code'], 'name' => $role['name']
                ];
            }
            foreach ($users as &$user) $user['roles'] = $byUser[(int)$user['id']] ?? [];
            unset($user);
        }

        return [
            'items' => $users,
            'pagination' => [
                'page' => $page, 'per_page' => $perPage, 'total' => $total,
                'pages' => max(1, (int)ceil($total / $perPage)),
            ],
        ];
    }

    public function roles(): array
    {
        return $this->pdo->query(
            'SELECT id, code, name, description FROM roles WHERE status = \'active\' ORDER BY name'
        )->fetchAll();
    }

    public function get(int $id): ?array { return $this->snapshot($id); }

    public function create(array $data, array $roleIds, int $actorId): array
    {
        $this->assertUnique($data['username'], $data['email'], null);
        $this->assertRoles($roleIds);

        $this->pdo->beginTransaction();
        try {
            $stmt = $this->pdo->prepare(
                'INSERT INTO users (username, email, password_hash, display_name, status)
                 VALUES (?, ?, ?, ?, ?)'
            );
            $stmt->execute([
                $data['username'], $data['email'], password_hash($data['password'], PASSWORD_DEFAULT),
                $data['display_name'], $data['status']
            ]);
            $id = (int)$this->pdo->lastInsertId();
            $this->replaceRoles($id, $roleIds);
            $created = $this->snapshot($id);
            $this->audit($actorId, 'create', $id, null, $created);
            $this->pdo->commit();
            return $created;
        } catch (Throwable $e) {
            if ($this->pdo->inTransaction()) $this->pdo->rollBack();
            throw $e;
        }
    }

    public function update(int $id, array $data, array $roleIds, int $actorId): array
    {
        $old = $this->snapshot($id);
        if (!$old) throw new InvalidArgumentException('Usuário não encontrado.', 404);
        $this->assertUnique($data['username'], $data['email'], $id);
        $this->assertRoles($roleIds);

        $this->pdo->beginTransaction();
        try {
            $stmt = $this->pdo->prepare(
                'UPDATE users SET username = ?, email = ?, display_name = ?, status = ? WHERE id = ?'
            );
            $stmt->execute([$data['username'], $data['email'], $data['display_name'], $data['status'], $id]);
            $this->replaceRoles($id, $roleIds);
            $updated = $this->snapshot($id);
            $this->audit($actorId, 'update', $id, $old, $updated);
            $this->pdo->commit();
            return $updated;
        } catch (Throwable $e) {
            if ($this->pdo->inTransaction()) $this->pdo->rollBack();
            throw $e;
        }
    }

    public function resetPassword(int $id, string $password, int $actorId): void
    {
        if (!$this->snapshot($id)) throw new InvalidArgumentException('Usuário não encontrado.', 404);
        $stmt = $this->pdo->prepare('UPDATE users SET password_hash = ? WHERE id = ?');
        $stmt->execute([password_hash($password, PASSWORD_DEFAULT), $id]);
        $this->audit($actorId, 'reset_password', $id, null, ['password_reset' => true]);
    }

    public function inactivate(int $id, int $actorId): array
    {
        $old = $this->snapshot($id);
        if (!$old) throw new InvalidArgumentException('Usuário não encontrado.', 404);
        $stmt = $this->pdo->prepare("UPDATE users SET status = 'inactive' WHERE id = ?");
        $stmt->execute([$id]);
        $updated = $this->snapshot($id);
        $this->audit($actorId, 'delete', $id, $old, $updated);
        return $updated;
    }

    private function snapshot(int $id): ?array
    {
        $stmt = $this->pdo->prepare(
            'SELECT id, username, email, display_name, status, last_login_at, created_at, updated_at
             FROM users WHERE id = ? LIMIT 1'
        );
        $stmt->execute([$id]);
        $user = $stmt->fetch();
        if (!$user) return null;
        $roleStmt = $this->pdo->prepare(
            'SELECT r.id, r.code, r.name FROM user_roles ur
             INNER JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = ? ORDER BY r.name'
        );
        $roleStmt->execute([$id]);
        $user['roles'] = $roleStmt->fetchAll();
        $user['role_ids'] = array_map('intval', array_column($user['roles'], 'id'));
        return $user;
    }

    private function assertUnique(string $username, ?string $email, ?int $exceptId): void
    {
        $sql = 'SELECT id FROM users WHERE username = ?' . ($exceptId ? ' AND id <> ?' : '') . ' LIMIT 1';
        $params = $exceptId ? [$username, $exceptId] : [$username];
        $stmt = $this->pdo->prepare($sql); $stmt->execute($params);
        if ($stmt->fetchColumn()) throw new InvalidArgumentException('Este usuário já existe.', 409);
        if ($email !== null) {
            $sql = 'SELECT id FROM users WHERE email = ?' . ($exceptId ? ' AND id <> ?' : '') . ' LIMIT 1';
            $params = $exceptId ? [$email, $exceptId] : [$email];
            $stmt = $this->pdo->prepare($sql); $stmt->execute($params);
            if ($stmt->fetchColumn()) throw new InvalidArgumentException('Este e-mail já está cadastrado.', 409);
        }
    }

    private function assertRoles(array $roleIds): void
    {
        if (!$roleIds) return;
        $ph = implode(',', array_fill(0, count($roleIds), '?'));
        $stmt = $this->pdo->prepare("SELECT id FROM roles WHERE status = 'active' AND id IN ($ph)");
        $stmt->execute($roleIds);
        $found = array_map('intval', array_column($stmt->fetchAll(), 'id'));
        if (count($found) !== count($roleIds)) throw new InvalidArgumentException('Um dos perfis selecionados não está ativo.', 422);
    }

    private function replaceRoles(int $userId, array $roleIds): void
    {
        $this->pdo->prepare('DELETE FROM user_roles WHERE user_id = ?')->execute([$userId]);
        if (!$roleIds) return;
        $stmt = $this->pdo->prepare('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)');
        foreach ($roleIds as $roleId) $stmt->execute([$userId, $roleId]);
    }

    private function audit(int $actorId, string $action, int $entityId, ?array $oldData, ?array $newData): void
    {
        $stmt = $this->pdo->prepare(
            'INSERT INTO audit_logs (user_id, module_code, action, entity_type, entity_id, old_data, new_data, ip_address)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
        );
        $stmt->execute([
            $actorId, 'users', $action, 'user', (string)$entityId,
            $oldData !== null ? json_encode($oldData, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) : null,
            $newData !== null ? json_encode($newData, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) : null,
            $_SERVER['REMOTE_ADDR'] ?? null,
        ]);
    }
}
