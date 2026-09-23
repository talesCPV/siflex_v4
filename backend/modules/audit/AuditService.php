<?php
declare(strict_types=1);

final class AuditService
{
    public function __construct(private PDO $pdo)
    {
    }

    public function list(array $filters): array
    {
        $page = max(1, (int)($filters['page'] ?? 1));
        $perPage = min(100, max(10, (int)($filters['per_page'] ?? 25)));
        $offset = ($page - 1) * $perPage;

        $where = [];
        $params = [];

        if (($filters['user_id'] ?? '') !== '') {
            $where[] = 'a.user_id = ?';
            $params[] = (int)$filters['user_id'];
        }
        if (($filters['module_code'] ?? '') !== '') {
            $where[] = 'a.module_code = ?';
            $params[] = trim((string)$filters['module_code']);
        }
        if (($filters['action'] ?? '') !== '') {
            $where[] = 'a.action = ?';
            $params[] = trim((string)$filters['action']);
        }
        if (($filters['entity_type'] ?? '') !== '') {
            $where[] = 'a.entity_type = ?';
            $params[] = trim((string)$filters['entity_type']);
        }
        if (($filters['date_from'] ?? '') !== '') {
            $where[] = 'a.created_at >= ?';
            $params[] = trim((string)$filters['date_from']) . ' 00:00:00';
        }
        if (($filters['date_to'] ?? '') !== '') {
            $where[] = 'a.created_at <= ?';
            $params[] = trim((string)$filters['date_to']) . ' 23:59:59';
        }
        if (($filters['search'] ?? '') !== '') {
            $search = '%' . trim((string)$filters['search']) . '%';
            $where[] = '(a.entity_id LIKE ? OR a.module_code LIKE ? OR a.action LIKE ? OR u.username LIKE ? OR u.display_name LIKE ?)';
            array_push($params, $search, $search, $search, $search, $search);
        }

        $whereSql = $where ? ' WHERE ' . implode(' AND ', $where) : '';

        $countStmt = $this->pdo->prepare(
            'SELECT COUNT(*)
             FROM audit_logs a
             LEFT JOIN users u ON u.id = a.user_id' . $whereSql
        );
        $countStmt->execute($params);
        $total = (int)$countStmt->fetchColumn();

        $sql =
            'SELECT a.id, a.user_id, a.module_code, a.action, a.entity_type, a.entity_id,
                    a.old_data, a.new_data, a.ip_address, a.created_at,
                    u.username, u.display_name
             FROM audit_logs a
             LEFT JOIN users u ON u.id = a.user_id' .
            $whereSql .
            ' ORDER BY a.created_at DESC, a.id DESC
              LIMIT ' . $perPage . ' OFFSET ' . $offset;

        $stmt = $this->pdo->prepare($sql);
        $stmt->execute($params);
        $items = $stmt->fetchAll();

        foreach ($items as &$item) {
            $item['old_data'] = $this->decodeJson($item['old_data']);
            $item['new_data'] = $this->decodeJson($item['new_data']);
        }
        unset($item);

        $totalPages = max(1, (int)ceil($total / $perPage));

        return [
            'items' => $items,
            'pagination' => [
                'page' => $page,
                'per_page' => $perPage,
                'total' => $total,
                'total_pages' => $totalPages,
            ],
        ];
    }

    public function filterOptions(): array
    {
        $modules = $this->pdo->query(
            "SELECT DISTINCT module_code FROM audit_logs
             WHERE module_code IS NOT NULL AND module_code <> ''
             ORDER BY module_code"
        )->fetchAll(PDO::FETCH_COLUMN);

        $actions = $this->pdo->query(
            "SELECT DISTINCT action FROM audit_logs
             WHERE action IS NOT NULL AND action <> ''
             ORDER BY action"
        )->fetchAll(PDO::FETCH_COLUMN);

        $entityTypes = $this->pdo->query(
            "SELECT DISTINCT entity_type FROM audit_logs
             WHERE entity_type IS NOT NULL AND entity_type <> ''
             ORDER BY entity_type"
        )->fetchAll(PDO::FETCH_COLUMN);

        return [
            'modules' => $modules,
            'actions' => $actions,
            'entity_types' => $entityTypes,
        ];
    }

    private function decodeJson(mixed $value): mixed
    {
        if ($value === null || $value === '') return null;
        $decoded = json_decode((string)$value, true);
        return json_last_error() === JSON_ERROR_NONE ? $decoded : $value;
    }
}
