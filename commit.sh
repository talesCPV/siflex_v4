#!/bin/bash
# Upload files to Github - git@github.com:talesCPV/siflex_v4.git

read -p "Are you sure to commit Siflex V4 to GitHub ? (Y/n)" -n 1 -r
echo    # (optional) move to a new line
if [[ $REPLY =~ ^[Yy]$ ]]
then

    cp  -r especificações.txt ~/Documentos/Flexibus/V4
    cp ~/Documentos/SQL/V4/*.sql sql/

    git init

    git add backend/
    git add config/
    git add database/
    git add docs/
    git add frontend/
    git add migration/
    git add modules/
    git add storage/
    git add tests/
    git add commit.sh
    git add .gitignore
    git add README.md
    git add SiFlex_4.0_Especificacao_Tecnica_v0.1.pdf
    
    git commit -m "by_script"

    #git branch -M main
    #git remote add origin git@github.com:talesCPV/siflex_v4.git
    git remote set-url origin git@github.com:talesCPV/siflex_v4.git

    git push -u -f origin main
    cp  -r ~/Documentos/Flexibus/certificados/ backend/bank/


fi