# SiFlex 4.0 — Navegação dinâmica v0.6

Esta etapa liga o catálogo de módulos à navegação do frontend.

## Relação módulo → permissão

Foi criada a tabela `module_permissions`, permitindo associar uma ou mais permissões a cada módulo.
O menu só apresenta módulos ativos para os quais o usuário atual possui pelo menos uma das permissões associadas.

## API

`backend/api/menu.php`

- exige usuário autenticado;
- retorna somente módulos ativos autorizados para o usuário;
- mantém a hierarquia por `parent_id`;
- não substitui as verificações de autorização das APIs dos módulos.

## Frontend

A barra lateral agora é montada a partir do catálogo retornado pela API.

- Início continua fixo;
- módulos ativos e autorizados são adicionados dinamicamente;
- módulos pai/filho respeitam a hierarquia;
- rotas que correspondem a uma view existente no `index.html` são abertas dentro da SPA;
- outras rotas são tratadas como navegação normal.

## Migration

Execute:

`database/migrations/004_module_permissions.sql`

A migration cria a relação módulo/permissão e cadastra os três módulos administrativos básicos (`USERS`, `ROLES`, `MODULES`) caso ainda não existam.
