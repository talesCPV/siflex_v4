<?php
declare(strict_types=1);

require_once __DIR__ . '/../core/Response.php';
require_once __DIR__ . '/../core/Database.php';
require_once __DIR__ . '/../core/Auth.php';
require_once __DIR__ . '/../core/Permissions.php';
require_once __DIR__ . '/../modules/users/UserService.php';

Auth::start();
$action = $_GET['action'] ?? 'list';

function inputData(): array
{
    $raw = file_get_contents('php://input');
    if ($raw !== false && trim($raw) !== '') {
        $json = json_decode($raw, true);
        if (is_array($json)) return $json;
    }
    return $_POST;
}

function validateUserFields(array $input, bool $creating = true): array
{
    $username = trim((string)($input['username'] ?? ''));
    $email = trim((string)($input['email'] ?? ''));
    $displayName = trim((string)($input['display_name'] ?? ''));
    $status = (string)($input['status'] ?? 'active');
    $password = (string)($input['password'] ?? '');
    $errors = [];
    if ($creating && $username === '') $errors['username'] = 'Informe o usuário.';
    if ($creating && $password === '') $errors['password'] = 'Informe a senha.';
    if ($displayName === '') $errors['display_name'] = 'Informe o nome de exibição.';
    if ($username !== '' && (mb_strlen($username) < 3 || mb_strlen($username) > 80)) $errors['username'] = 'O usuário deve ter entre 3 e 80 caracteres.';
    if ($email !== '' && (mb_strlen($email) > 190 || !filter_var($email, FILTER_VALIDATE_EMAIL))) $errors['email'] = 'E-mail inválido.';
    if (mb_strlen($displayName) > 150) $errors['display_name'] = 'Nome de exibição muito longo.';
    if (!in_array($status, ['active', 'blocked', 'inactive'], true)) $errors['status'] = 'Status inválido.';
    if ($creating && (mb_strlen($password) < 8 || mb_strlen($password) > 4096)) $errors['password'] = 'A senha deve ter pelo menos 8 caracteres.';
    if ($errors) Response::error('Corrija os campos informados.', 422, $errors);
    return ['username'=>$username, 'email'=>$email !== '' ? $email : null, 'display_name'=>$displayName, 'status'=>$status, 'password'=>$password];
}

function roleIds(array $input): array
{
    $roles = $input['role_ids'] ?? [];
    if (!is_array($roles)) Response::error('Perfis inválidos.', 422);
    $roles = array_values(array_unique(array_filter(array_map('intval', $roles), static fn(int $id): bool => $id > 0)));
    if (count($roles) > 50) Response::error('Quantidade de perfis inválida.', 422);
    return $roles;
}

try {
    $actorId = Auth::requireLogin();
    $pdo = Database::connection();
    $service = new UserService($pdo);

    if ($action === 'list') {
        Permissions::require('users.view');
        $page = max(1, (int)($_GET['page'] ?? 1));
        $perPage = min(100, max(10, (int)($_GET['per_page'] ?? 20)));
        Response::ok($service->list(trim((string)($_GET['search'] ?? '')), trim((string)($_GET['status'] ?? '')), $page, $perPage));
    }

    if ($action === 'roles') {
        Permissions::require('users.view');
        Response::ok(['items' => $service->roles()]);
    }

    if ($action === 'get') {
        Permissions::require('users.view');
        $id = (int)($_GET['id'] ?? 0);
        if ($id <= 0) Response::error('Usuário inválido.', 422);
        $user = $service->get($id);
        if (!$user) Response::error('Usuário não encontrado.', 404);
        Response::ok($user);
    }

    if ($action === 'create') {
        Permissions::require('users.create');
        if ($_SERVER['REQUEST_METHOD'] !== 'POST') Response::error('Método não permitido.', 405);
        Auth::requireCsrf();
        $input = inputData();
        $user = $service->create(validateUserFields($input, true), roleIds($input), $actorId);
        Response::ok($user, 'Usuário criado com sucesso.');
    }

    if ($action === 'update') {
        Permissions::require('users.edit');
        if (!in_array($_SERVER['REQUEST_METHOD'], ['PUT', 'PATCH', 'POST'], true)) Response::error('Método não permitido.', 405);
        Auth::requireCsrf();
        $input = inputData();
        $id = (int)($input['id'] ?? $_GET['id'] ?? 0);
        if ($id <= 0) Response::error('Usuário inválido.', 422);
        $data = validateUserFields($input, false);
        if ($id === $actorId && $data['status'] !== 'active') Response::error('Você não pode bloquear ou inativar o próprio usuário.', 422);
        $user = $service->update($id, $data, roleIds($input), $actorId);
        Response::ok($user, 'Usuário atualizado com sucesso.');
    }

    if ($action === 'reset-password') {
        Permissions::require('users.edit');
        if ($_SERVER['REQUEST_METHOD'] !== 'POST') Response::error('Método não permitido.', 405);
        Auth::requireCsrf();
        $input = inputData();
        $id = (int)($input['id'] ?? 0);
        $password = (string)($input['password'] ?? '');
        if ($id <= 0) Response::error('Usuário inválido.', 422);
        if (mb_strlen($password) < 8 || mb_strlen($password) > 4096) Response::error('A senha deve ter pelo menos 8 caracteres.', 422);
        $service->resetPassword($id, $password, $actorId);
        Response::ok(null, 'Senha redefinida com sucesso.');
    }

    if ($action === 'delete') {
        Permissions::require('users.delete');
        if (!in_array($_SERVER['REQUEST_METHOD'], ['DELETE', 'POST'], true)) Response::error('Método não permitido.', 405);
        Auth::requireCsrf();
        $input = inputData();
        $id = (int)($input['id'] ?? $_GET['id'] ?? 0);
        if ($id <= 0) Response::error('Usuário inválido.', 422);
        if ($id === $actorId) Response::error('Você não pode inativar o próprio usuário.', 422);
        $user = $service->inactivate($id, $actorId);
        Response::ok($user, 'Usuário inativado.');
    }

    Response::error('Ação de usuários desconhecida.', 404);
} catch (InvalidArgumentException $e) {
    $status = (int)$e->getCode();
    if ($status < 400 || $status > 499) $status = 422;
    Response::error($e->getMessage(), $status);
} catch (PDOException $e) {
    error_log('[SIFLEX4][USERS][DB] ' . $e->getMessage());
    Response::error('Erro ao acessar os dados de usuários.', 500);
} catch (Throwable $e) {
    error_log('[SIFLEX4][USERS] ' . $e->getMessage());
    Response::error('Erro interno do servidor.', 500);
}
