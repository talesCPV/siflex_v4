-- Relação explícita entre módulos e permissões.
-- Os tipos precisam ser idênticos aos das chaves referenciadas.

CREATE TABLE IF NOT EXISTS module_permissions (
    module_id BIGINT UNSIGNED NOT NULL,
    permission_id BIGINT UNSIGNED NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (module_id, permission_id),
    KEY ix_module_permissions_permission (permission_id),
    CONSTRAINT fk_module_permissions_module
        FOREIGN KEY (module_id) REFERENCES modules(id) ON DELETE CASCADE,
    CONSTRAINT fk_module_permissions_permission
        FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Catálogo administrativo mínimo usado pela navegação inicial.
INSERT INTO modules
    (code, name, description, icon, route, parent_id, sort_order, status)
VALUES
    ('USERS', 'Usuários', 'Gerenciamento de usuários', 'users', 'usersView', NULL, 10, 'active'),
    ('ROLES', 'Perfis e permissões', 'Perfis e permissões de acesso', 'shield', 'rolesView', NULL, 20, 'active'),
    ('MODULES', 'Módulos', 'Catálogo e navegação de módulos', 'grid', 'modulesView', NULL, 30, 'active')
ON DUPLICATE KEY UPDATE
    name = VALUES(name),
    description = VALUES(description),
    icon = VALUES(icon),
    route = VALUES(route),
    status = 'active';

-- Vínculos administrativos. Só cria quando módulo e permissão existirem.
INSERT IGNORE INTO module_permissions (module_id, permission_id)
SELECT m.id, p.id
FROM modules m
INNER JOIN permissions p ON p.code = 'users.view'
WHERE m.code = 'USERS';

INSERT IGNORE INTO module_permissions (module_id, permission_id)
SELECT m.id, p.id
FROM modules m
INNER JOIN permissions p ON p.code = 'roles.view'
WHERE m.code = 'ROLES';

INSERT IGNORE INTO module_permissions (module_id, permission_id)
SELECT m.id, p.id
FROM modules m
INNER JOIN permissions p ON p.code = 'modules.view'
WHERE m.code = 'MODULES';
