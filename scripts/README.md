# Scripts de manutenção

Rodam no computador (não no servidor). Precisam de `npm install` feito na raiz do projeto.
As pastas `.cache-*` que eles criam ficam fora do git.

## Banco de imagens (`npm run banco-imagens`)

Gera as fotos do Banco de imagens embutido a partir de `src/lib/banco-catalog.json`
(foto em até 1920 px + miniatura 480×320 em `src/public/img/banco/`).

Para acrescentar uma foto: escolha uma foto **gratuita** do Unsplash (sem o selo “Unsplash+”),
acrescente uma entrada no catálogo e rode `npm run banco-imagens`. O formato da entrada está
no início de `scripts/banco-imagens.js`. Use `-- --todas` para refazer todas.

## Modelos de slide do PowerPoint (22 “Modelos PADAP”)

Converte `Modelos_Slides_PADAP.pptx` em `src/public/js/modelos-padap.js` + imagens em
`src/public/img/modelos-padap/`. Precisa do **PowerPoint instalado** (Windows).

```powershell
# 1) extrair (abre o PPTX somente leitura; não altera o arquivo)
powershell -ExecutionPolicy Bypass -File scripts\modelos-pptx\extrair.ps1 -Pptx "C:\caminho\Modelos_Slides_PADAP.pptx"
# 2) converter
npm run modelos:converter
```

Se o PPTX mudar de ordem ou ganhar slides, ajuste no `converter.js` a lista `NAMES` (nomes que
aparecem no menu) e `CHARTS` (dados dos gráficos editáveis). Depois confira no editor e rode
`npm test`.

## Administrador (`npm run create-admin -- email "Nome" senha`)

Cria (ou promove) um administrador direto no banco local.
