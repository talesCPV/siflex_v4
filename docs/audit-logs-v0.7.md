# SiFlex 4.0 — Logs de Auditoria v0.7

## Objetivo

Adicionar a consulta administrativa dos registros existentes em `audit_logs`, sem criar uma segunda estrutura de auditoria.

## Banco

A fundação já cria `audit_logs` em `database/schema/005_audit_logs.sql`.

A migration `005_audit_module.sql` adiciona:

- permissão `audit.view`;
- associação dessa permissão ao perfil `ROOT`;
- módulo `AUDIT` com rota `auditView`;
- vínculo `AUDIT -> audit.view` em `module_permissions`.

A migration `004_module_permissions.sql` também foi corrigida para usar `BIGINT UNSIGNED`, compatível com `modules.id` e `permissions.id`.

## API

`backend/api/audit.php`

- `action=list`: consulta paginada;
- `action=filters`: carrega módulos, ações e tipos de entidade existentes;
- requer `audit.view`;
- somente leitura.

Filtros disponíveis:

- usuário;
- módulo;
- ação;
- tipo de entidade;
- período inicial/final;
- busca livre.

## Frontend

A tela **Logs de auditoria** aparece no menu para usuários que possuam `audit.view` através de `module_permissions`.

A consulta mostra usuário, data/hora, módulo, ação, entidade, ID, IP e detalhes JSON de antes/depois quando existirem.

## Aplicação

Aplicar `database/migrations/005_audit_module.sql` depois da fundação e das migrations anteriores.
Não é necessário recriar `audit_logs`.
