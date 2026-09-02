-- Perfil ROOT e permissões fundamentais do SiFlex 4.0.
-- O usuário administrador deve ser criado separadamente.

INSERT INTO roles (code, name, description)
VALUES ('ROOT', 'Administrador', 'Acesso administrativo completo ao SiFlex 4.0')
ON DUPLICATE KEY UPDATE name = VALUES(name), description = VALUES(description);

INSERT INTO permissions (code, name) VALUES
('system.access', 'Acessar o sistema'),
('users.view', 'Visualizar usuários'),
('users.create', 'Criar usuários'),
('users.edit', 'Editar usuários'),
('users.delete', 'Excluir usuários'),
('modules.view', 'Visualizar módulos'),
('modules.manage', 'Gerenciar módulos')
ON DUPLICATE KEY UPDATE name = VALUES(name);

INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.code = 'ROOT';
