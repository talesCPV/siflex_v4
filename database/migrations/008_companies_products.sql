-- SiFlex 4.0 — Cadastros básicos: Empresas e Produtos
-- Migration 008. V3 usada como referência funcional; estrutura remodelada para V4.
-- Executar uma vez no banco V4.

ALTER TABLE modules ADD COLUMN IF NOT EXISTS menu_label VARCHAR(150) NULL AFTER name;

CREATE TABLE IF NOT EXISTS companies (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    razao_social VARCHAR(80) NOT NULL,
    fantasia VARCHAR(40) NULL,
    cnpj VARCHAR(14) NULL,
    ie VARCHAR(20) NULL,
    im VARCHAR(20) NULL,
    endereco VARCHAR(60) NULL,
    numero VARCHAR(10) NULL,
    complemento VARCHAR(50) NULL,
    bairro VARCHAR(60) NULL,
    cidade VARCHAR(30) NULL,
    uf CHAR(2) NULL,
    cep VARCHAR(10) NULL,
    tipo ENUM('CLI','FOR') NOT NULL DEFAULT 'CLI',
    ramo VARCHAR(80) NULL,
    telefone VARCHAR(20) NULL,
    email VARCHAR(80) NULL,
    status ENUM('active','inactive') NOT NULL DEFAULT 'active',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY ix_companies_status (status),
    KEY ix_companies_razao (razao_social),
    KEY ix_companies_fantasia (fantasia),
    KEY ix_companies_cnpj (cnpj),
    KEY ix_companies_tipo (tipo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS products (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    company_id BIGINT UNSIGNED NULL,
    descricao VARCHAR(80) NOT NULL,
    estoque DECIMAL(18,4) NOT NULL DEFAULT 0,
    estoque_min DECIMAL(18,4) NOT NULL DEFAULT 0,
    unidade VARCHAR(10) NOT NULL DEFAULT 'UND',
    ncm VARCHAR(8) NULL,
    codigo_interno INT NULL,
    codigo_barras VARCHAR(20) NULL,
    codigo_fornecedor VARCHAR(20) NULL,
    consumo TINYINT(1) NOT NULL DEFAULT 0,
    custo DECIMAL(18,4) NOT NULL DEFAULT 0,
    markup DECIMAL(18,4) NOT NULL DEFAULT 0,
    local_estoque VARCHAR(20) NULL,
    status ENUM('active','inactive') NOT NULL DEFAULT 'active',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_products_descricao (descricao),
    KEY ix_products_status (status),
    KEY ix_products_company (company_id),
    KEY ix_products_codigo (codigo_interno),
    KEY ix_products_barcode (codigo_barras),
    CONSTRAINT fk_products_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO permissions (code, name) VALUES
('companies.view', 'Visualizar empresas'),
('companies.create', 'Criar empresas'),
('companies.edit', 'Editar empresas'),
('companies.delete', 'Inativar empresas'),
('products.view', 'Visualizar produtos'),
('products.create', 'Criar produtos'),
('products.edit', 'Editar produtos'),
('products.delete', 'Inativar produtos')
ON DUPLICATE KEY UPDATE name = VALUES(name);

INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.code = 'ROOT'
  AND p.code IN (
    'companies.view','companies.create','companies.edit','companies.delete',
    'products.view','products.create','products.edit','products.delete'
  );

INSERT INTO modules (code,name,menu_label,description,icon,route,parent_id,sort_order,status)
VALUES ('TOOLS','Ferramentas','Ferramentas','Ferramentas e cadastros do sistema','mdi-tools',NULL, NULL, 100,'active')
ON DUPLICATE KEY UPDATE name=VALUES(name),menu_label=VALUES(menu_label),description=VALUES(description),icon=VALUES(icon),route=VALUES(route),status='active';

INSERT INTO modules (code,name,menu_label,description,icon,route,parent_id,sort_order,status)
SELECT 'CADASTRO','Cadastro','Cadastro','Cadastros básicos','mdi-database-outline',NULL,m.id,10,'active'
FROM modules m WHERE m.code='TOOLS'
ON DUPLICATE KEY UPDATE name=VALUES(name),menu_label=VALUES(menu_label),description=VALUES(description),icon=VALUES(icon),route=VALUES(route),parent_id=VALUES(parent_id),status='active';

INSERT INTO modules (code,name,menu_label,description,icon,route,parent_id,sort_order,status)
SELECT 'EMPRESAS','Empresas','Empresas','Cadastro de clientes e fornecedores','mdi-domain', 'companiesView',m.id,10,'active'
FROM modules m WHERE m.code='CADASTRO'
ON DUPLICATE KEY UPDATE name=VALUES(name),menu_label=VALUES(menu_label),description=VALUES(description),icon=VALUES(icon),route=VALUES(route),parent_id=VALUES(parent_id),status='active';

INSERT INTO modules (code,name,menu_label,description,icon,route,parent_id,sort_order,status)
SELECT 'PRODUTOS','Produtos','Produtos','Cadastro e controle de produtos','mdi-package-variant-closed','productsView',m.id,20,'active'
FROM modules m WHERE m.code='CADASTRO'
ON DUPLICATE KEY UPDATE name=VALUES(name),menu_label=VALUES(menu_label),description=VALUES(description),icon=VALUES(icon),route=VALUES(route),parent_id=VALUES(parent_id),status='active';

-- Os módulos pais aparecem quando o usuário possuir qualquer permissão dos cadastros.
INSERT IGNORE INTO module_permissions (module_id, permission_id)
SELECT m.id,p.id FROM modules m CROSS JOIN permissions p
WHERE m.code='TOOLS' AND p.code IN ('companies.view','products.view');

INSERT IGNORE INTO module_permissions (module_id, permission_id)
SELECT m.id,p.id FROM modules m CROSS JOIN permissions p
WHERE m.code='CADASTRO' AND p.code IN ('companies.view','products.view');

INSERT IGNORE INTO module_permissions (module_id, permission_id)
SELECT m.id,p.id FROM modules m INNER JOIN permissions p ON p.code='companies.view'
WHERE m.code='EMPRESAS';

INSERT IGNORE INTO module_permissions (module_id, permission_id)
SELECT m.id,p.id FROM modules m INNER JOIN permissions p ON p.code='products.view'
WHERE m.code='PRODUTOS';

CREATE TABLE IF NOT EXISTS product_reservations (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    product_id BIGINT UNSIGNED NOT NULL,
    user_id BIGINT UNSIGNED NULL,
    project_id BIGINT UNSIGNED NULL,
    quantity DECIMAL(18,4) NOT NULL DEFAULT 0,
    status ENUM('active','cancelled') NOT NULL DEFAULT 'active',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY ix_product_reservations_product (product_id,status),
    CONSTRAINT fk_product_reservations_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
    CONSTRAINT fk_product_reservations_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
