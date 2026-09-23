<?php
declare(strict_types=1);

final class SettingsService
{
    public function __construct(private PDO $pdo) {}

    public function list(string $search = '', string $category = '', string $status = ''): array
    {
        $where = [];
        $params = [];

        if ($search !== '') {
            $term = '%' . $search . '%';
            $where[] = '(s.code LIKE ? OR s.name LIKE ? OR s.description LIKE ?)';
            array_push($params, $term, $term, $term);
        }
        if ($category !== '') {
            $where[] = 's.category = ?';
            $params[] = $category;
        }
        if (in_array($status, ['active', 'inactive'], true)) {
            $where[] = 's.status = ?';
            $params[] = $status;
        }

        $sql = 'SELECT s.id, s.code, s.name, s.description, s.category, s.data_type,
                       s.value_text, s.default_value_text, s.is_editable, s.status,
                       s.sort_order, s.created_at, s.updated_at
                FROM system_settings s';
        if ($where) $sql .= ' WHERE ' . implode(' AND ', $where);
        $sql .= ' ORDER BY s.category, s.sort_order, s.name, s.code';

        $stmt = $this->pdo->prepare($sql);
        $stmt->execute($params);
        $items = $stmt->fetchAll();

        foreach ($items as &$item) {
            $item['is_editable'] = (bool)$item['is_editable'];
            $item['value'] = $this->decodeValue($item['value_text'], $item['data_type']);
            $item['default_value'] = $this->decodeValue($item['default_value_text'], $item['data_type']);
            unset($item['value_text'], $item['default_value_text']);
        }
        unset($item);

        return $items;
    }

    public function categories(): array
    {
        return $this->pdo->query(
            "SELECT DISTINCT category FROM system_settings
             WHERE category IS NOT NULL AND category <> ''
             ORDER BY category"
        )->fetchAll(PDO::FETCH_COLUMN);
    }

    public function get(int $id): ?array
    {
        $stmt = $this->pdo->prepare(
            'SELECT id, code, name, description, category, data_type, value_text,
                    default_value_text, is_editable, status, sort_order, created_at, updated_at
             FROM system_settings WHERE id = ? LIMIT 1'
        );
        $stmt->execute([$id]);
        $item = $stmt->fetch();
        if (!$item) return null;

        $item['is_editable'] = (bool)$item['is_editable'];
        $item['value'] = $this->decodeValue($item['value_text'], $item['data_type']);
        $item['default_value'] = $this->decodeValue($item['default_value_text'], $item['data_type']);
        unset($item['value_text'], $item['default_value_text']);
        return $item;
    }

    public function update(int $id, mixed $value, int $actorId): array
    {
        $old = $this->getRaw($id);
        if (!$old) throw new InvalidArgumentException('Configuração não encontrada.', 404);
        if (!(bool)$old['is_editable']) throw new InvalidArgumentException('Esta configuração é somente leitura.', 422);
        if ($old['status'] !== 'active') throw new InvalidArgumentException('Esta configuração está inativa.', 422);

        $normalized = $this->encodeValue($value, $old['data_type']);

        $this->pdo->beginTransaction();
        try {
            $stmt = $this->pdo->prepare('UPDATE system_settings SET value_text = ? WHERE id = ?');
            $stmt->execute([$normalized, $id]);
            $updated = $this->get($id);
            $this->audit($actorId, 'update', $id, $this->publicData($old), $updated);
            $this->pdo->commit();
            return $updated;
        } catch (Throwable $e) {
            if ($this->pdo->inTransaction()) $this->pdo->rollBack();
            throw $e;
        }
    }

    public function reset(int $id, int $actorId): array
    {
        $old = $this->getRaw($id);
        if (!$old) throw new InvalidArgumentException('Configuração não encontrada.', 404);
        if (!(bool)$old['is_editable']) throw new InvalidArgumentException('Esta configuração é somente leitura.', 422);
        if ($old['status'] !== 'active') throw new InvalidArgumentException('Esta configuração está inativa.', 422);

        $this->pdo->beginTransaction();
        try {
            $stmt = $this->pdo->prepare('UPDATE system_settings SET value_text = default_value_text WHERE id = ?');
            $stmt->execute([$id]);
            $updated = $this->get($id);
            $this->audit($actorId, 'reset', $id, $this->publicData($old), $updated);
            $this->pdo->commit();
            return $updated;
        } catch (Throwable $e) {
            if ($this->pdo->inTransaction()) $this->pdo->rollBack();
            throw $e;
        }
    }

    private function getRaw(int $id): ?array
    {
        $stmt = $this->pdo->prepare(
            'SELECT id, code, name, description, category, data_type, value_text,
                    default_value_text, is_editable, status, sort_order, created_at, updated_at
             FROM system_settings WHERE id = ? LIMIT 1'
        );
        $stmt->execute([$id]);
        return ($row = $stmt->fetch()) ? $row : null;
    }

    private function encodeValue(mixed $value, string $type): string
    {
        return match ($type) {
            'string' => $this->encodeString($value),
            'integer' => $this->encodeInteger($value),
            'decimal' => $this->encodeDecimal($value),
            'boolean' => $this->encodeBoolean($value),
            'json' => $this->encodeJson($value),
            default => throw new InvalidArgumentException('Tipo de configuração não suportado.', 422),
        };
    }

    private function decodeValue(?string $value, string $type): mixed
    {
        if ($value === null) return null;
        return match ($type) {
            'integer' => (int)$value,
            'decimal' => (float)$value,
            'boolean' => in_array(strtolower($value), ['1', 'true', 'yes', 'sim'], true),
            'json' => json_decode($value, true),
            default => $value,
        };
    }

    private function encodeString(mixed $value): string
    {
        if (is_array($value) || is_object($value)) throw new InvalidArgumentException('O valor deve ser texto.', 422);
        $value = trim((string)$value);
        if (mb_strlen($value) > 10000) throw new InvalidArgumentException('O valor de texto é muito longo.', 422);
        return $value;
    }

    private function encodeInteger(mixed $value): string
    {
        if (is_int($value)) return (string)$value;
        if (is_string($value) && preg_match('/^-?\d+$/', trim($value))) return (string)(int)$value;
        if (is_float($value) && floor($value) === $value) return (string)(int)$value;
        throw new InvalidArgumentException('O valor deve ser um número inteiro.', 422);
    }

    private function encodeDecimal(mixed $value): string
    {
        if (!is_numeric($value) || is_bool($value)) throw new InvalidArgumentException('O valor deve ser numérico.', 422);
        $number = (float)$value;
        if (!is_finite($number)) throw new InvalidArgumentException('O valor numérico é inválido.', 422);
        return rtrim(rtrim(number_format($number, 6, '.', ''), '0'), '.') ?: '0';
    }

    private function encodeBoolean(mixed $value): string
    {
        if (is_bool($value)) return $value ? '1' : '0';
        if (in_array($value, [1, '1', 'true', 'TRUE', 'yes', 'sim'], true)) return '1';
        if (in_array($value, [0, '0', 'false', 'FALSE', 'no', 'nao', 'não'], true)) return '0';
        throw new InvalidArgumentException('O valor deve ser verdadeiro ou falso.', 422);
    }

    private function encodeJson(mixed $value): string
    {
        if (is_string($value)) {
            json_decode($value, true);
            if (json_last_error() === JSON_ERROR_NONE) return $value;
        }
        $json = json_encode($value, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        if ($json === false) throw new InvalidArgumentException('JSON inválido.', 422);
        return $json;
    }

    private function publicData(array $row): array
    {
        $data = $row;
        if (isset($data['value_text'])) $data['value'] = $this->decodeValue($data['value_text'], $data['data_type']);
        if (isset($data['default_value_text'])) $data['default_value'] = $this->decodeValue($data['default_value_text'], $data['data_type']);
        unset($data['value_text'], $data['default_value_text']);
        $data['is_editable'] = (bool)$data['is_editable'];
        return $data;
    }

    private function audit(int $actorId, string $action, int $entityId, ?array $oldData, ?array $newData): void
    {
        $stmt = $this->pdo->prepare(
            'INSERT INTO audit_logs
             (user_id, module_code, action, entity_type, entity_id, old_data, new_data, ip_address)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
        );
        $stmt->execute([
            $actorId,
            'settings',
            $action,
            'system_setting',
            (string)$entityId,
            $oldData !== null ? json_encode($oldData, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) : null,
            $newData !== null ? json_encode($newData, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) : null,
            $_SERVER['REMOTE_ADDR'] ?? null,
        ]);
    }
}
