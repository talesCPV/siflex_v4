# SiFlex 4.0 — Módulo Usuários

## Escopo da primeira versão

- Listagem com busca, filtro por status e paginação.
- Criação de usuário com senha protegida por `password_hash()`.
- Edição de dados básicos.
- Associação de um ou mais perfis ativos.
- Ativação/bloqueio/inativação por status.
- Redefinição administrativa de senha.
- Registro das operações no `audit_logs`.
- Autorização no backend por permissões `users.*`.

## Observação sobre exclusão

A ação `users.delete` não remove fisicamente o registro. Ela coloca o usuário como `inactive`. Isso preserva histórico, auditoria e relacionamentos para a futura migração V3 → V4.

## Permissões usadas

- `users.view`
- `users.create`
- `users.edit`
- `users.delete`

## Endpoint

`backend/api/users.php`

As regras específicas ficam em `backend/modules/users/UserService.php`, mantendo o endpoint como camada HTTP e o Core independente das regras do módulo.
