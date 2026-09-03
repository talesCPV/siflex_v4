<?php
declare(strict_types=1);

require_once __DIR__ . '/../core/Response.php';
require_once __DIR__ . '/../core/Database.php';
require_once __DIR__ . '/../core/Auth.php';

Auth::start();
$action = $_GET['action'] ?? 'status';

try {
    $pdo = Database::connection();

    if ($action === 'status') {
        $id = Auth::userId();
        if ($id === null) Response::ok(['authenticated' => false]);

        $stmt = $pdo->prepare(
            'SELECT id, username, display_name, email, status, last_login_at
             FROM users WHERE id = ? LIMIT 1'
        );
        $stmt->execute([$id]);
        $user = $stmt->fetch();

        if (!$user || $user['status'] !== 'active') {
            Auth::logout();
            Response::ok(['authenticated' => false]);
        }

        Response::ok([
            'authenticated' => true,
            'user' => $user,
            'csrf_token' => Auth::csrfToken(),
        ]);
    }

    if ($action === 'login') {
        if ($_SERVER['REQUEST_METHOD'] !== 'POST') Response::error('Método não permitido.', 405);

        $input = json_decode(file_get_contents('php://input'), true) ?? $_POST;
        $username = trim((string)($input['username'] ?? ''));
        $password = (string)($input['password'] ?? '');

        if ($username === '' || $password === '') {
            Response::error('Usuário e senha são obrigatórios.', 422);
        }
        if (mb_strlen($username) > 80 || mb_strlen($password) > 4096) {
            Response::error('Dados de acesso inválidos.', 422);
        }

        $stmt = $pdo->prepare(
            'SELECT id, username, password_hash, display_name, email, status
             FROM users WHERE username = ? LIMIT 1'
        );
        $stmt->execute([$username]);
        $user = $stmt->fetch();

        if (!$user || $user['status'] !== 'active' || !password_verify($password, $user['password_hash'])) {
            Response::error('Usuário ou senha inválidos.', 401);
        }

        Auth::login((int)$user['id']);

        $update = $pdo->prepare('UPDATE users SET last_login_at = NOW() WHERE id = ?');
        $update->execute([(int)$user['id']]);

        unset($user['password_hash']);
        $user['last_login_at'] = date('Y-m-d H:i:s');

        Response::ok([
            'authenticated' => true,
            'user' => $user,
            'csrf_token' => Auth::csrfToken(),
        ], 'Login realizado.');
    }

    if ($action === 'logout') {
        if ($_SERVER['REQUEST_METHOD'] !== 'POST') Response::error('Método não permitido.', 405);
        if (Auth::userId() !== null) Auth::requireCsrf();
        Auth::logout();
        Response::ok(null, 'Logout realizado.');
    }

    if ($action === 'csrf') {
        Auth::requireLogin();
        Response::ok(['csrf_token' => Auth::csrfToken()]);
    }

    Response::error('Ação de autenticação desconhecida.', 404);
} catch (Throwable $e) {
    error_log('[SIFLEX4][AUTH] ' . $e->getMessage());
    Response::error('Erro interno do servidor.', 500);
}
