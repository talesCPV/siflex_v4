<?php
declare(strict_types=1);

require_once __DIR__ . '/../core/Response.php';
require_once __DIR__ . '/../core/Database.php';
require_once __DIR__ . '/../core/Auth.php';
require_once __DIR__ . '/../core/Permissions.php';
require_once __DIR__ . '/../modules/modules/ModuleService.php';

Auth::start();
$action = $_GET['action'] ?? 'list';

function moduleInput(): array {
    $raw = file_get_contents('php://input');
    if ($raw !== false && trim($raw) !== '') {
        $json = json_decode($raw, true);
        if (is_array($json)) return $json;
    }
    return $_POST;
}

function validateModule(array $input): array {
    $code = strtoupper(trim((string)($input['code'] ?? '')));
    $name = trim((string)($input['name'] ?? ''));
    $menuLabel = trim((string)($input['menu_label'] ?? ''));
    $description = trim((string)($input['description'] ?? ''));
    $icon = trim((string)($input['icon'] ?? ''));
    $route = trim((string)($input['route'] ?? ''));
    $parentRaw = $input['parent_id'] ?? null;
    $sortRaw = $input['sort_order'] ?? 0;
    $status = (string)($input['status'] ?? 'active');
    $errors = [];
    $permissionIds = array_values(array_unique(array_map('intval', (array)($input['permission_ids'] ?? []))));
    if (!$permissionIds) $errors['permission_ids'] = 'Selecione pelo menos uma permissão.';
    if ($code === '' || !preg_match('/^[A-Z0-9_\-]{2,100}$/', $code)) $errors['code'] = 'Use 2 a 100 caracteres: letras, números, _ ou -.';
    if ($name === '' || mb_strlen($name) > 150) $errors['name'] = 'Informe um nome válido para o módulo.';
    if (mb_strlen($menuLabel) > 150) $errors['menu_label'] = 'Nome no menu muito longo.';
    if (mb_strlen($description) > 255) $errors['description'] = 'Descrição muito longa.';
    if (mb_strlen($icon) > 150) $errors['icon'] = 'Ícone muito longo.';
    if (mb_strlen($route) > 255) $errors['route'] = 'Rota muito longa.';
    if (!in_array($status, ['active', 'inactive'], true)) $errors['status'] = 'Status inválido.';
    if ($parentRaw === '' || $parentRaw === null) $parentId = null;
    elseif (filter_var($parentRaw, FILTER_VALIDATE_INT) !== false && (int)$parentRaw > 0) $parentId = (int)$parentRaw;
    else { $parentId = null; $errors['parent_id'] = 'Módulo pai inválido.'; }
    if (filter_var($sortRaw, FILTER_VALIDATE_INT) === false) { $errors['sort_order'] = 'Ordem inválida.'; $sortOrder = 0; }
    else { $sortOrder = (int)$sortRaw; if ($sortOrder < 0 || $sortOrder > 100000) $errors['sort_order'] = 'A ordem deve estar entre 0 e 100000.'; }
    if ($errors) Response::error('Corrija os campos informados.', 422, $errors);
    return ['code'=>$code, 'name'=>$name, 'menu_label'=>$menuLabel !== '' ? $menuLabel : null, 'description'=>$description !== '' ? $description : null,
        'icon'=>$icon !== '' ? $icon : null, 'route'=>$route !== '' ? $route : null,
        'parent_id'=>$parentId, 'sort_order'=>$sortOrder, 'status'=>$status, 'permission_ids'=>$permissionIds];
}

try {
    $actorId = Auth::requireLogin();
    $pdo = Database::connection();
    $service = new ModuleService($pdo);
    if ($action === 'list') {
        Permissions::require('modules.view');
        Response::ok(['items'=>$service->list(trim((string)($_GET['search'] ?? '')), trim((string)($_GET['status'] ?? '')))]);
    }
    if ($action === 'parents') {
        Permissions::require('modules.view');
        $exclude = isset($_GET['exclude_id']) ? (int)$_GET['exclude_id'] : null;
        Response::ok(['items'=>$service->parents($exclude > 0 ? $exclude : null)]);
    }
    if ($action === 'get') {
        Permissions::require('modules.view');
        $id = (int)($_GET['id'] ?? 0);
        if ($id <= 0) Response::error('Módulo inválido.', 422);
        $module = $service->get($id);
        if (!$module) Response::error('Módulo não encontrado.', 404);
        Response::ok($module);
    }
    if ($action === 'create') {
        Permissions::require('modules.manage');
        if ($_SERVER['REQUEST_METHOD'] !== 'POST') Response::error('Método não permitido.', 405);
        Auth::requireCsrf();
        Response::ok($service->create(validateModule(moduleInput()), $actorId), 'Módulo criado com sucesso.');
    }
    if ($action === 'update') {
        Permissions::require('modules.manage');
        if (!in_array($_SERVER['REQUEST_METHOD'], ['PUT','PATCH','POST'], true)) Response::error('Método não permitido.', 405);
        Auth::requireCsrf();
        $input = moduleInput();
        $id = (int)($input['id'] ?? $_GET['id'] ?? 0);
        if ($id <= 0) Response::error('Módulo inválido.', 422);
        Response::ok($service->update($id, validateModule($input), $actorId), 'Módulo atualizado com sucesso.');
    }
    if ($action === 'delete') {
        Permissions::require('modules.manage');
        if (!in_array($_SERVER['REQUEST_METHOD'], ['POST','DELETE'], true)) Response::error('Método não permitido.', 405);
        Auth::requireCsrf();
        $input = moduleInput();
        $id = (int)($input['id'] ?? $_GET['id'] ?? 0);
        if ($id <= 0) Response::error('Módulo inválido.', 422);
        Response::ok($service->inactivate($id, $actorId), 'Módulo inativado.');
    }
    Response::error('Ação de módulos desconhecida.', 404);
} catch (InvalidArgumentException $e) {
    $status = (int)$e->getCode(); if ($status < 400 || $status > 499) $status = 422;
    Response::error($e->getMessage(), $status);
} catch (PDOException $e) {
    error_log('[SIFLEX4][MODULES][DB] ' . $e->getMessage());
    Response::error('Erro ao acessar os dados de módulos.', 500);
} catch (Throwable $e) {
    error_log('[SIFLEX4][MODULES] ' . $e->getMessage());
    Response::error('Erro interno do servidor.', 500);
}
