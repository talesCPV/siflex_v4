<?php
declare(strict_types=1);

require_once __DIR__ . '/Database.php';
require_once __DIR__ . '/Auth.php';
require_once __DIR__ . '/Response.php';

final class Permissions
{
    public static function has(int $userId, string $permission): bool
    {
        $pdo = Database::connection();
        $stmt = $pdo->prepare(
            'SELECT 1
             FROM user_roles ur
             INNER JOIN roles r ON r.id = ur.role_id AND r.status = \'active\'
             INNER JOIN role_permissions rp ON rp.role_id = r.id
             INNER JOIN permissions p ON p.id = rp.permission_id
             WHERE ur.user_id = ? AND p.code = ?
             LIMIT 1'
        );
        $stmt->execute([$userId, $permission]);
        return (bool)$stmt->fetchColumn();
    }

    public static function require(string $permission): void
    {
        $userId = Auth::requireLogin();
        if (!self::has($userId, $permission)) {
            Response::error('Acesso negado.', 403);
        }
    }
}
