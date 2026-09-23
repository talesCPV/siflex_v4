<?php
declare(strict_types=1);

require_once __DIR__ . '/../core/Response.php';
require_once __DIR__ . '/../core/Database.php';
require_once __DIR__ . '/../core/Auth.php';
require_once __DIR__ . '/../core/Permissions.php';
require_once __DIR__ . '/../modules/audit/AuditService.php';

Auth::start();

try {
    $userId = Auth::requireLogin();
    Permissions::require('audit.view');
    $pdo = Database::connection();
    $service = new AuditService($pdo);
    $action = $_GET['action'] ?? 'list';

    if ($action === 'filters') {
        Response::ok($service->filterOptions());
    }

    if ($action !== 'list') {
        Response::error('Ação inválida.', 400);
    }

    $page = filter_var($_GET['page'] ?? 1, FILTER_VALIDATE_INT);
    $perPage = filter_var($_GET['per_page'] ?? 25, FILTER_VALIDATE_INT);
    $userFilter = filter_var($_GET['user_id'] ?? '', FILTER_VALIDATE_INT);

    $result = $service->list([
        'page' => $page === false ? 1 : $page,
        'per_page' => $perPage === false ? 25 : $perPage,
        'user_id' => $userFilter === false ? '' : $userFilter,
        'module_code' => $_GET['module_code'] ?? '',
        'action' => $_GET['audit_action'] ?? '',
        'entity_type' => $_GET['entity_type'] ?? '',
        'date_from' => $_GET['date_from'] ?? '',
        'date_to' => $_GET['date_to'] ?? '',
        'search' => $_GET['search'] ?? '',
    ]);

    Response::ok($result);
} catch (PDOException $e) {
    error_log('[SIFLEX4][AUDIT][DB] ' . $e->getMessage());
    Response::error('Erro ao carregar os logs de auditoria.', 500);
} catch (Throwable $e) {
    error_log('[SIFLEX4][AUDIT] ' . $e->getMessage());
    Response::error($e->getMessage(), $e instanceof InvalidArgumentException ? 422 : 500);
}
