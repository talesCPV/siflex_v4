# SiFlex 4.0

Fundação inicial do novo SiFlex, desenvolvida em paralelo ao SiFlex 3.0. A V3 não deve ser alterada durante este desenvolvimento.

## Banco

O projeto usa o banco V4 independente. Preencha localmente a senha em `backend/config/database.php`; não versione credenciais reais.

## Instalação

1. Criar o banco `flexib52_siflex4`.
2. Executar os arquivos em `database/schema/` na ordem numérica.
3. Executar `database/seeds/001_core.sql`.
4. Criar o primeiro usuário administrador usando `password_hash()`.
5. Publicar `frontend/` e `backend/` no Apache de acordo com a estrutura do servidor.
6. Abrir `frontend/index.html`.

## Estado atual

- Fundação/Core: concluída.
- Autenticação e sessão: concluídas.
- Autorização por permissões: base concluída.
- **Usuários: primeira versão implementada.**
- Perfis/permissões: estrutura de banco pronta; gerenciamento dedicado será o próximo módulo.
- Módulos/menu: estrutura de banco pronta; gerenciamento será implementado depois.

## Módulo Usuários

A tela permite listar, buscar, filtrar, criar, editar, associar perfis, redefinir senha e inativar usuários. A exclusão é lógica (`inactive`) para preservar histórico e facilitar a futura migração V3 → V4.

A API está em `backend/api/users.php` e a regra do módulo em `backend/modules/users/UserService.php`.
