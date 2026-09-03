<?php
declare(strict_types=1);

require_once __DIR__ . '/../core/Response.php';
require_once __DIR__ . '/../core/Database.php';
require_once __DIR__ . '/../core/Auth.php';
require_once __DIR__ . '/../core/Permissions.php';
require_once __DIR__ . '/../modules/roles/RoleService.php';

Auth::start();
$action = $_GET['action'] ?? 'list';

function roleInput(): array
{
    $raw = file_get_contents('php://input');
    if ($raw !== false && trim($raw) !== '') {
        $json = json_decode($raw, true);
        if (is_array($json)) return $json;
    }
    return $_POST;
}

function validateRole(array $input): array
{
    $code = strtoupper(trim((string)($input['code'] ?? '')));
    $name = trim((string)($input['name'] ?? ''));
    $description = trim((string)($input['description'] ?? ''));
    $status = (string)($input['status'] ?? 'active');
    $errors = [];
    if ($code === '' || !preg_match('/^[A-Z0-9_\-]{2,80}$/', $code)) $errors['code'] = 'Use 2 a 80 caracteres: letras, números, _ ou -.';
    if ($name === '' || mb_strlen($name) > 120) $errors['name'] = 'Informe um nome válido para o perfil.';
    if (mb_strlen($description) > 255) $errors['description'] = 'Descrição muito longa.';
    if (!in_array($status, ['active', 'inactive'], true)) $errors['status'] = 'Status inválido.';
    if ($errors) Response::error('Corrija os campos informados.', 422, $errors);
    return ['code'=>$code, 'name'=>$name, 'description'=>$description !== '' ? $description : null, 'status'=>$status];
}

function permissionIds(array $input): array
{
    $ids = $input['permission_ids'] ?? [];
    if (!is_array($ids)) Response::error('Permissões inválidas.', 422);
    $ids = array_values(array_unique(array_filter(array_map('intval', $ids), static fn(int $id): bool => $id > 0)));
    if (count($ids) > 500) Response::error('Quantidade de permissões inválida.', 422);
    return $ids;
}

try {
    $actorId = Auth::requireLogin();
    $pdo = Database::connection();
    $service = new RoleService($pdo);

    if ($action === 'list') {
        Permissions::require('roles.view');
        Response::ok(['items' => $service->list(trim((string)($_GET['search'] ?? '')), trim((string)($_GET['status'] ?? '')))]);
    }
    if ($action === 'permissions') {
        Permissions::require('roles.view');
        Response::ok(['items' => $service->permissions()]);
    }
    if ($action === 'get') {
        Permissions::require('roles.view');
        $id = (int)($_GET['id'] ?? 0);
        if ($id <= 0) Response::error('Perfil inválido.', 422);
        $role = $service->get($id);
        if (!$role) Response::error('Perfil não encontrado.', 404);
        Response::ok($role);
    }
    if ($action === 'create') {
        Permissions::require('roles.manage');
        if ($_SERVER['REQUEST_METHOD'] !== 'POST') Response::error('Método não permitido.', 405);
        Auth::requireCsrf();
        $input = roleInput();
        Response::ok($service->create(validateRole($input), permissionIds($input), $actorId), 'Perfil criado com sucesso.');
    }
    if ($action === 'update') {
        Permissions::require('roles.manage');
        if (!in_array($_SERVER['REQUEST_METHOD'], ['PUT', 'PATCH', 'POST'], true)) Response::error('Método não permitido.', 405);
        Auth::requireCsrf();
        $input = roleInput();
        $id = (int)($input['id'] ?? $_GET['id'] ?? 0);
        if ($id <= 0) Response::error('Perfil inválido.', 422);
        Response::ok($service->update($id, validateRole($input), permissionIds($input), $actorId), 'Perfil atualizado com sucesso.');
    }
    if ($action === 'delete') {
        Permissions::require('roles.manage');
        if (!in_array($_SERVER['REQUEST_METHOD'], ['POST', 'DELETE'], true)) Response::error('Método não permitido.', 405);
        Auth::requireCsrf();
        $input = roleInput();
        $id = (int)($input['id'] ?? $_GET['id'] ?? 0);
        if ($id <= 0) Response::error('Perfil inválido.', 422);
        Response::ok($service->inactivate($id, $actorId), 'Perfil inativado.');
    }
    Response::error('Ação de perfis desconhecida.', 404);
} catch (InvalidArgumentException $e) {
    $status = (int)$e->getCode();
    if ($status < 400 || $status > 499) $status = 422;
    Response::error($e->getMessage(), $status);
} catch (PDOException $e) {
    error_log('[SIFLEX4][ROLES][DB] ' . $e->getMessage());
    Response::error('Erro ao acessar os dados de perfis.', 500);
} catch (Throwable $e) {
    error_log('[SIFLEX4][ROLES] ' . $e->getMessage());
    Response::error('Erro interno do servidor.', 500);
}
