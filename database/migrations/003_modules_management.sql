-- Garante as permissões administrativas do catálogo de módulos.
-- Pode ser executado com segurança mais de uma vez.

INSERT INTO permissions (code, name) VALUES
('modules.view', 'Visualizar módulos'),
('modules.manage', 'Gerenciar módulos')
ON DUPLICATE KEY UPDATE name = VALUES(name);

INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.code = 'ROOT'
  AND p.code IN ('modules.view', 'modules.manage');
