# SiFlex 4.0 — Interface e menu v0.8.1

## Responsividade

Em telas com largura de até 760px, o menu lateral deixa de ocupar espaço permanente. Um botão hambúrguer aparece na barra superior e abre o menu sobre o conteúdo. O clique no fundo ou em um item do menu fecha o painel.

## Nome do módulo no menu

A tabela `modules` ganhou o campo `menu_label`.

- `name`: nome interno/canônico do módulo.
- `menu_label`: nome apresentado na navegação lateral.
- `description`: descrição curta usada como `title` do item do menu.

Se `menu_label` estiver vazio, o frontend utiliza `name` como fallback.

A alteração é feita na tela **Módulos**, no campo **Nome no menu**.

## Instalação

1. Sobrepor os arquivos do ZIP.
2. Executar `database/migrations/007_module_menu_labels.sql`.
3. Fazer logout/login ou atualizar a aplicação.
4. Em **Módulos**, editar um módulo e testar o campo **Nome no menu**.
5. Passar o mouse sobre o item no menu para conferir a descrição como tooltip.

A migration inicializa `menu_label` dos módulos existentes com o valor de `name`, sem substituir rótulos que já tenham sido definidos.
