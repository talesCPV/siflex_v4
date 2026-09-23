<?php
declare(strict_types=1);

require_once __DIR__ . '/../core/Response.php';
require_once __DIR__ . '/../core/Database.php';
require_once __DIR__ . '/../core/Auth.php';
require_once __DIR__ . '/../core/Permissions.php';
require_once __DIR__ . '/../modules/settings/SettingsService.php';

Auth::start();

try {
    $userId = Auth::requireLogin();
    $pdo = Database::connection();
    $service = new SettingsService($pdo);
    $action = $_GET['action'] ?? 'list';

    if ($action === 'list' || $action === 'categories') {
        Permissions::require('settings.view');
        if ($action === 'categories') Response::ok(['items' => $service->categories()]);

        $items = $service->list(
            trim((string)($_GET['search'] ?? '')),
            trim((string)($_GET['category'] ?? '')),
            trim((string)($_GET['status'] ?? ''))
        );
        $canManage = Permissions::has($userId, 'settings.manage');
        foreach ($items as &$item) $item['can_manage'] = $canManage;
        unset($item);
        Response::ok(['items' => $items]);
    }

    if ($action === 'get') {
        Permissions::require('settings.view');
        $id = filter_var($_GET['id'] ?? 0, FILTER_VALIDATE_INT);
        if (!$id) Response::error('ID de configuração inválido.', 422);
        $item = $service->get((int)$id);
        if (!$item) Response::error('Configuração não encontrada.', 404);
        $item['can_manage'] = Permissions::has($userId, 'settings.manage');
        Response::ok($item);
    }

    if ($action === 'update' || $action === 'reset') {
        Permissions::require('settings.manage');
        $id = filter_var($_GET['id'] ?? 0, FILTER_VALIDATE_INT);
        if (!$id) Response::error('ID de configuração inválido.', 422);

        if ($action === 'reset') {
            Response::ok($service->reset((int)$id, $userId), 'Configuração restaurada para o valor padrão.');
        }

        $input = json_decode(file_get_contents('php://input'), true);
        if (!is_array($input) || !array_key_exists('value', $input)) Response::error('Informe o valor da configuração.', 422);
        Response::ok($service->update((int)$id, $input['value'], $userId), 'Configuração atualizada com sucesso.');
    }

    Response::error('Ação inválida.', 400);
} catch (PDOException $e) {
    error_log('[SIFLEX4][SETTINGS][DB] ' . $e->getMessage());
    Response::error('Erro ao carregar as configurações do sistema.', 500);
} catch (Throwable $e) {
    error_log('[SIFLEX4][SETTINGS] ' . $e->getMessage());
    $code = $e instanceof InvalidArgumentException && $e->getCode() >= 400 && $e->getCode() < 500 ? $e->getCode() : 500;
    Response::error($e->getMessage(), $code);
}
