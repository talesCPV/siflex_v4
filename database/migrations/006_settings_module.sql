-- SiFlex 4.0 v0.8 — Configurações do sistema.
-- Catálogo de configurações globais. Valores são armazenados como texto e
-- convertidos pelo backend conforme data_type. Não contém segredos de conexão.

CREATE TABLE IF NOT EXISTS system_settings (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    code VARCHAR(120) NOT NULL,
    name VARCHAR(150) NOT NULL,
    description VARCHAR(255) NULL,
    category VARCHAR(80) NOT NULL DEFAULT 'Geral',
    data_type ENUM('string','integer','decimal','boolean','json') NOT NULL DEFAULT 'string',
    value_text LONGTEXT NULL,
    default_value_text LONGTEXT NULL,
    is_editable TINYINT(1) NOT NULL DEFAULT 1,
    status ENUM('active','inactive') NOT NULL DEFAULT 'active',
    sort_order INT NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_system_settings_code (code),
    KEY ix_system_settings_category (category),
    KEY ix_system_settings_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO permissions (code, name)
VALUES
    ('settings.view', 'Consultar configurações do sistema'),
    ('settings.manage', 'Alterar configurações do sistema')
ON DUPLICATE KEY UPDATE name = VALUES(name);

INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
INNER JOIN permissions p ON p.code IN ('settings.view', 'settings.manage')
WHERE r.code = 'ROOT';

INSERT INTO modules
    (code, name, description, icon, route, parent_id, sort_order, status)
VALUES
    ('SETTINGS', 'Configurações', 'Configurações gerais do SiFlex 4.0', 'settings', 'settingsView', NULL, 50, 'active')
ON DUPLICATE KEY UPDATE
    name = VALUES(name),
    description = VALUES(description),
    icon = VALUES(icon),
    route = VALUES(route),
    status = 'active';

INSERT IGNORE INTO module_permissions (module_id, permission_id)
SELECT m.id, p.id
FROM modules m
INNER JOIN permissions p ON p.code = 'settings.view'
WHERE m.code = 'SETTINGS';

INSERT INTO system_settings
    (code, name, description, category, data_type, value_text, default_value_text, is_editable, status, sort_order)
VALUES
    ('system.name', 'Nome do sistema', 'Nome exibido pelo sistema em títulos e identificações futuras.', 'Geral', 'string', 'SiFlex 4.0', 'SiFlex 4.0', 1, 'active', 10),
    ('system.locale', 'Idioma', 'Localidade padrão utilizada pelo sistema.', 'Geral', 'string', 'pt-BR', 'pt-BR', 1, 'active', 20),
    ('system.timezone', 'Fuso horário', 'Fuso horário padrão das operações do sistema.', 'Geral', 'string', 'America/Sao_Paulo', 'America/Sao_Paulo', 1, 'active', 30),
    ('system.date_format', 'Formato de data', 'Formato padrão para apresentação de datas.', 'Geral', 'string', 'DD/MM/YYYY', 'DD/MM/YYYY', 1, 'active', 40),
    ('system.items_per_page', 'Itens por página', 'Quantidade padrão de registros exibidos nas listagens.', 'Interface', 'integer', '25', '25', 1, 'active', 50),
    ('system.session_timeout_minutes', 'Tempo de sessão', 'Tempo de referência, em minutos, para futuras regras de expiração de sessão.', 'Segurança', 'integer', '60', '60', 1, 'active', 60)
ON DUPLICATE KEY UPDATE
    name = VALUES(name),
    description = VALUES(description),
    category = VALUES(category),
    data_type = VALUES(data_type),
    default_value_text = VALUES(default_value_text),
    sort_order = VALUES(sort_order);
