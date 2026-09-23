# SiFlex 4.0 — Configurações do sistema v0.8

## Objetivo

O módulo de Configurações cria um catálogo centralizado de parâmetros gerais do SiFlex 4.0, sem espalhar valores fixos pelo código.

Nesta primeira versão, as configurações são globais ao sistema. A estrutura fica preparada para futura diferenciação por empresa, sem criar dependência da tabela de empresas antes de ela existir.

## Permissões

- `settings.view` — consulta as configurações.
- `settings.manage` — altera e restaura valores editáveis.

O ROOT recebe as duas permissões na migration.

## Segurança

- Toda leitura exige login e `settings.view`.
- Alterações e restaurações exigem `settings.manage` e CSRF via sessão/API.
- Valores são validados no backend conforme `data_type`.
- O módulo não deve ser usado para armazenar senhas, tokens, chaves de API ou credenciais de infraestrutura.
- Alterações e restaurações são registradas em `audit_logs` com módulo `settings`.

## Tipos suportados

- `string`
- `integer`
- `decimal`
- `boolean`
- `json`

## Configurações iniciais

A migration cria um catálogo pequeno e seguro para homologação:

- `system.name`
- `system.locale`
- `system.timezone`
- `system.date_format`
- `system.items_per_page`
- `system.session_timeout_minutes`

Os registros já existentes não têm seu valor atual sobrescrito quando a migration for executada novamente; apenas o catálogo/metadados padrão são atualizados.
