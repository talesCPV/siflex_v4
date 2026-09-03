# SiFlex 4.0 — Módulo de Perfis e Permissões v0.4

## Objetivo
Administrar perfis de acesso e sua associação com permissões, mantendo a autorização no backend.

## Permissões do módulo
- `roles.view`: listar/consultar perfis e permissões.
- `roles.manage`: criar, editar e inativar perfis.

O perfil `ROOT` não pode ser inativado.

## Operações
- listar perfis
- consultar perfil e permissões
- criar perfil
- editar perfil
- inativar perfil
- atribuir/remover permissões

## Banco
Para uma instalação já existente, executar `database/migrations/002_roles_permissions.sql`.
Em uma instalação nova, `database/seeds/001_core.sql` já inclui as permissões do módulo.
