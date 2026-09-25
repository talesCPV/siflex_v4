<?php
declare(strict_types=1);

require_once __DIR__ . '/../core/Response.php';
require_once __DIR__ . '/../core/Database.php';
require_once __DIR__ . '/../core/Auth.php';

Auth::start();

try {
    $userId = Auth::requireLogin();
    $pdo = Database::connection();
    $action = $_GET['action'] ?? 'conversations';

    if ($action === 'unread-count') {
        $stmt = $pdo->prepare('SELECT COUNT(*) FROM messages WHERE recipient_id = :user_id AND read_at IS NULL');
        $stmt->execute(['user_id' => $userId]);
        Response::ok(['unread_count' => (int)$stmt->fetchColumn()]);
    }

    if ($action === 'users') {
        $search = trim((string)($_GET['search'] ?? ''));
        $sql = 'SELECT id, username, display_name, status FROM users WHERE status = \'active\' AND id <> :user_id';
        $params = ['user_id' => $userId];
        if ($search !== '') {
            $sql .= ' AND (username LIKE :search OR display_name LIKE :search OR email LIKE :search)';
            $params['search'] = '%' . $search . '%';
        }
        $sql .= ' ORDER BY display_name, username LIMIT 200';
        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        Response::ok(['items' => $stmt->fetchAll()]);
    }

    if ($action === 'conversations') {
        $sql = <<<'SQL'
SELECT
    u.id AS user_id,
    u.username,
    u.display_name,
    u.status,
    lm.body AS last_body,
    lm.created_at AS last_created_at,
    COALESCE(uc.unread_count, 0) AS unread_count
FROM users u
INNER JOIN (
    SELECT other_id, MAX(id) AS last_message_id
    FROM (
        SELECT recipient_id AS other_id, id FROM messages WHERE sender_id = :sender_id_a
        UNION ALL
        SELECT sender_id AS other_id, id FROM messages WHERE recipient_id = :recipient_id_b
    ) x
    GROUP BY other_id
) latest ON latest.other_id = u.id
INNER JOIN messages lm ON lm.id = latest.last_message_id
LEFT JOIN (
    SELECT sender_id AS other_id, COUNT(*) AS unread_count
    FROM messages
    WHERE recipient_id = :recipient_id_c AND read_at IS NULL
    GROUP BY sender_id
) uc ON uc.other_id = u.id
WHERE u.status = 'active'
ORDER BY lm.created_at DESC, lm.id DESC
SQL;
        $stmt = $pdo->prepare($sql);
        $stmt->execute([
            'sender_id_a' => $userId,
            'recipient_id_b' => $userId,
            'recipient_id_c' => $userId,
        ]);
        Response::ok(['items' => $stmt->fetchAll()]);
    }

    if ($action === 'conversation') {
        $otherId = filter_var($_GET['user_id'] ?? 0, FILTER_VALIDATE_INT);
        if (!$otherId || (int)$otherId === $userId) Response::error('Usuário da conversa inválido.', 422);

        $stmt = $pdo->prepare('SELECT id, username, display_name, status FROM users WHERE id = :id LIMIT 1');
        $stmt->execute(['id' => $otherId]);
        $other = $stmt->fetch();
        if (!$other) Response::error('Usuário não encontrado.', 404);

        $stmt = $pdo->prepare(<<<'SQL'
SELECT id, sender_id, recipient_id, body, read_at, created_at
FROM messages
WHERE (sender_id = :me_a AND recipient_id = :other_a)
   OR (sender_id = :other_b AND recipient_id = :me_b)
ORDER BY id ASC
LIMIT 200
SQL);
        $stmt->execute([
            'me_a' => $userId, 'other_a' => $otherId,
            'other_b' => $otherId, 'me_b' => $userId,
        ]);
        Response::ok(['user' => $other, 'messages' => $stmt->fetchAll()]);
    }

    if ($action === 'mark-read') {
        Auth::requireCsrf();
        $otherId = filter_var($_GET['user_id'] ?? 0, FILTER_VALIDATE_INT);
        if (!$otherId || (int)$otherId === $userId) Response::error('Usuário da conversa inválido.', 422);
        $stmt = $pdo->prepare('UPDATE messages SET read_at = NOW() WHERE sender_id = :sender_id AND recipient_id = :recipient_id AND read_at IS NULL');
        $stmt->execute(['sender_id' => $otherId, 'recipient_id' => $userId]);
        Response::ok(['marked' => $stmt->rowCount()]);
    }

    if ($action === 'send') {
        Auth::requireCsrf();
        $input = json_decode(file_get_contents('php://input'), true);
        if (!is_array($input)) Response::error('Dados da mensagem inválidos.', 422);
        $recipientId = filter_var($input['recipient_id'] ?? 0, FILTER_VALIDATE_INT);
        $body = trim((string)($input['body'] ?? ''));
        if (!$recipientId || $recipientId === $userId) Response::error('Destinatário inválido.', 422);
        if ($body === '') Response::error('Digite uma mensagem.', 422);
        if (mb_strlen($body) > 5000) Response::error('A mensagem pode ter no máximo 5000 caracteres.', 422);

        $stmt = $pdo->prepare("SELECT id, username, display_name, status FROM users WHERE id = :id AND status = 'active' LIMIT 1");
        $stmt->execute(['id' => $recipientId]);
        $recipient = $stmt->fetch();
        if (!$recipient) Response::error('Destinatário não encontrado ou inativo.', 404);

        $stmt = $pdo->prepare('INSERT INTO messages (sender_id, recipient_id, body) VALUES (:sender_id, :recipient_id, :body)');
        $stmt->execute(['sender_id' => $userId, 'recipient_id' => $recipientId, 'body' => $body]);
        Response::ok(['id' => (int)$pdo->lastInsertId()], 'Mensagem enviada com sucesso.');
    }

    Response::error('Ação inválida.', 400);
} catch (PDOException $e) {
    error_log('[SIFLEX4][MESSAGES][DB] ' . $e->getMessage());
    Response::error('Erro ao processar as mensagens.', 500);
} catch (Throwable $e) {
    error_log('[SIFLEX4][MESSAGES] ' . $e->getMessage());
    $code = $e instanceof InvalidArgumentException && $e->getCode() >= 400 && $e->getCode() < 500 ? $e->getCode() : 500;
    Response::error($e->getMessage(), $code);
}
