# SiFlex 4.0 — Mensagens internas v0.9

Sistema inicial de mensagens diretas entre usuários ativos.

## Banco

Executar `database/migrations/007_internal_messages.sql`. A tabela `messages` guarda remetente, destinatário, conteúdo, data/hora e `read_at`.

## API

`backend/api/messages.php` exige sessão autenticada. Alterações (`send` e `mark-read`) exigem CSRF. A API fornece contador de não lidas, usuários ativos, conversas, histórico e envio.

## Frontend

O ícone `mdi-email-outline` fica ao lado de Sair. Um badge vermelho mostra a quantidade de mensagens não lidas. O contador é atualizado ao abrir a aplicação e a cada 15 segundos.
