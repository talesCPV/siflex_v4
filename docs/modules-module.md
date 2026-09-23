# SiFlex 4.0 — Módulos v0.5

O módulo de gerenciamento de módulos administra o catálogo usado pela futura navegação dinâmica do SiFlex 4.0.

## Funcionalidades

- listar e pesquisar módulos;
- filtrar por ativo/inativo;
- criar módulo;
- editar módulo;
- inativar módulo sem apagar histórico;
- definir código, nome, descrição, ícone, rota e ordem;
- definir módulo pai para formar uma hierarquia;
- impedir módulo como próprio pai;
- impedir ciclos na hierarquia;
- registrar criação, alteração e inativação em `audit_logs`.

## API

`backend/api/modules.php`

Ações:

- `list` — requer `modules.view`;
- `parents` — requer `modules.view`;
- `get` — requer `modules.view`;
- `create` — requer `modules.manage` + CSRF;
- `update` — requer `modules.manage` + CSRF;
- `delete` — inativa o módulo e requer `modules.manage` + CSRF.

## Próxima etapa

O próximo passo da área administrativa é utilizar este catálogo para montar o menu dinamicamente conforme os módulos ativos e as permissões do usuário.
