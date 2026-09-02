<?php
declare(strict_types=1);

require_once __DIR__ . '/../core/Response.php';
require_once __DIR__ . '/../core/Database.php';

try {
    $pdo = Database::connection();
    $pdo->query('SELECT 1');
    Response::ok(['database' => 'online', 'version' => '4.0.0-dev'], 'SiFlex 4.0 online');
} catch (Throwable $e) {
    error_log('[SIFLEX4][HEALTH] ' . $e->getMessage());
    Response::error('Banco de dados indisponível.', 503);
}
