-- O catálogo de auditoria usa a tabela audit_logs criada na fundação (005_audit_logs.sql).
-- Esta migration adiciona somente a permissão e o módulo de consulta.

INSERT INTO permissions (code, name)
VALUES ('audit.view', 'Consultar logs de auditoria')
ON DUPLICATE KEY UPDATE name = VALUES(name);

-- O ROOT recebe automaticamente a permissão de consulta.
INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
INNER JOIN permissions p ON p.code = 'audit.view'
WHERE r.code = 'ROOT';

-- Catálogo administrativo da auditoria.
INSERT INTO modules
    (code, name, description, icon, route, parent_id, sort_order, status)
VALUES
    ('AUDIT', 'Logs de auditoria', 'Consulta das ações registradas no sistema', 'history', 'auditView', NULL, 40, 'active')
ON DUPLICATE KEY UPDATE
    name = VALUES(name),
    description = VALUES(description),
    icon = VALUES(icon),
    route = VALUES(route),
    status = 'active';

INSERT IGNORE INTO module_permissions (module_id, permission_id)
SELECT m.id, p.id
FROM modules m
INNER JOIN permissions p ON p.code = 'audit.view'
WHERE m.code = 'AUDIT';
