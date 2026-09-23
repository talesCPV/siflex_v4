-- SiFlex 4.0 v0.8.1 — nome exibido no menu.
-- Mantém o nome interno do módulo separado do rótulo apresentado na navegação.

SET @column_exists := (
    SELECT COUNT(*)
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'modules'
      AND COLUMN_NAME = 'menu_label'
);

SET @sql := IF(
    @column_exists = 0,
    'ALTER TABLE modules ADD COLUMN menu_label VARCHAR(150) NULL AFTER name',
    'SELECT 1'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Módulos existentes passam a usar o nome atual no menu.
-- O administrador poderá alterar o rótulo depois pela tela de Módulos.
UPDATE modules
SET menu_label = name
WHERE menu_label IS NULL OR TRIM(menu_label) = '';
