-- SiFlex 4.0 - Upgrade do controle de acesso para o módulo de perfis.
INSERT INTO permissions (code, name) VALUES
('roles.view', 'Visualizar perfis'),
('roles.manage', 'Gerenciar perfis')
ON DUPLICATE KEY UPDATE name = VALUES(name);

INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.code = 'ROOT' AND p.code IN ('roles.view', 'roles.manage');
