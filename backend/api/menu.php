<?php
declare(strict_types=1);

require_once __DIR__ . '/../core/Response.php';
require_once __DIR__ . '/../core/Database.php';
require_once __DIR__ . '/../core/Auth.php';
require_once __DIR__ . '/../core/Permissions.php';

Auth::start();

try {
    $userId = Auth::requireLogin();
    $pdo = Database::connection();

    $sql = 'SELECT m.id, m.code, m.name, m.menu_label, m.description, m.icon, m.route, m.parent_id, m.sort_order,
                   GROUP_CONCAT(DISTINCT p.code ORDER BY p.code SEPARATOR \'|\') AS permission_codes
            FROM modules m
            LEFT JOIN module_permissions mp ON mp.module_id = m.id
            LEFT JOIN permissions p ON p.id = mp.permission_id
            WHERE m.status = \'active\'
            GROUP BY m.id, m.code, m.name, m.menu_label, m.description, m.icon, m.route, m.parent_id, m.sort_order
            ORDER BY COALESCE(m.parent_id, 0), m.sort_order, m.name, m.code';

    $stmt = $pdo->query($sql);
    $rows = $stmt->fetchAll();
    $items = [];

    foreach ($rows as $row) {
        $codes = $row['permission_codes'] ? explode('|', (string)$row['permission_codes']) : [];
        $visible = false;
        foreach ($codes as $permission) {
            if ($permission !== '' && Permissions::has($userId, $permission)) {
                $visible = true;
                break;
            }
        }
        if (!$codes) {
            // Sem permissão vinculada, o módulo não aparece no menu.
            continue;
        }
        if (!$visible) continue;
        $row['permission_codes'] = $codes;
        $items[] = $row;
    }

    Response::ok(['items' => $items]);
} catch (PDOException $e) {
    error_log('[SIFLEX4][MENU][DB] ' . $e->getMessage());
    Response::error('Erro ao carregar o menu.', 500);
} catch (Throwable $e) {
    error_log('[SIFLEX4][MENU] ' . $e->getMessage());
    Response::error('Erro interno do servidor.', 500);
}
