# SiFlex 4.0

Fundação inicial do novo SiFlex.

## Banco

Preencha `backend/config/database.php` com os dados do MySQL localmente. A senha não deve ser versionada.

## Instalação

1. Criar o banco `flexib52_siflex4`.
2. Executar os arquivos em `database/schema/` na ordem numérica.
3. Executar `database/seeds/001_core.sql`.
4. Criar o primeiro usuário administrador com `password_hash()` através do procedimento definido para o bootstrap.
5. Publicar `frontend/` e `backend/` no Apache de acordo com a estrutura do servidor.
6. Abrir `frontend/index.html`.

## Autenticação

A V4 usa sessão PHP, `password_verify()` e token CSRF para operações POST autenticadas. O backend é a autoridade para autenticação e autorização.
