# Estúdio PADAP

Sistema web para criar apresentações com a identidade visual da **PADAP Produtividade Agrícola**
(Brandbook: cores `#072B35`, `#1DBD2C`, `#0F4C4F`, fonte Space Grotesk, grafismo de folha).

## O que tem

- **Login** por e-mail e senha, “Lembrar-me” (30 dias), troca de senha obrigatória no 1º acesso.
- **Página Inicial**: apresentação em branco + 6 modelos prontos (Institucional, Resultados do Campo,
  Planejamento Estratégico, Mercado e Oportunidades, Inovação que Produz, Sustentabilidade no Agro).
- **Biblioteca**: minhas apresentações (abrir, renomear, duplicar, excluir) e as compartilhadas pela equipe.
- **Editor**: slides (adicionar, duplicar, excluir, arrastar para reordenar), 11 layouts, caixas de texto
  (fonte, tamanho, negrito/itálico/sublinhado, realce, cor, listas, alinhamento), Banco de imagens,
  Portfólio, imagens próprias, formas da marca (folha, símbolo P), máscaras de foto, organizar
  (ordem, alinhar, transparência, bloquear), desfazer/refazer, zoom, anotações do apresentador,
  visão em grade e salvamento automático.
- **Apresentar** em tela cheia (setas, espaço, N = anotações, F = tela cheia, Esc = sair).
- **Compartilhar**: visível para a equipe (ver/apresentar/copiar) e/ou link público só de visualização.
- **Exportar**: PowerPoint (.pptx, textos editáveis), PDF e impressão (um slide por página).
- **Admin**: usuários (criar, editar, inativar, redefinir senha) e imagens (Banco e Portfólio;
  definir a foto do login, o banner da Página Inicial e a foto de capa de cada modelo).

## Rodar localmente

```bash
npm install
cp .env.example .env   # ajuste DATA_DIR (fora do OneDrive), ADMIN_EMAIL e ADMIN_PASSWORD
npm run dev            # http://localhost:3000 (ou a PORT do .env)
npm test
```

O administrador inicial é criado no 1º start se o banco estiver vazio (ou use
`npm run create-admin -- email@padap.com.br "Nome" senha`).

## Stack

Node.js 20+ · Express · EJS · SQLite (`better-sqlite3`) · sessão em cookie · sem build de frontend
(módulos ES puros em `src/public/js`). Exportação PPTX com `pptxgenjs` no navegador.

| Pasta / arquivo | Função |
| --- | --- |
| `src/lib/sanitize.js` | Formato do JSON de slides + limpeza de tudo que vem do navegador (XSS) |
| `src/public/js/render.js` | Desenho dos slides (formas, máscaras, textos) — usado em todas as telas |
| `src/public/js/templates.js` | Layouts e modelos prontos |
| `src/public/js/editor.js` | Editor |
| `src/public/js/pptx.js` | Exportação PowerPoint |

## Observações

- **Fonte no PowerPoint**: o .pptx usa “Space Grotesk”. Em computadores sem a fonte instalada, o
  PowerPoint troca por outra. Instale a fonte (gratuita, Google Fonts) nas máquinas da equipe.
- **PDF**: Exportar → PDF abre a página de impressão; escolha “Salvar como PDF”, margens “Nenhuma” e
  ative “Gráficos de plano de fundo”.
- **OneDrive**: não deixe `DATA_DIR` dentro do OneDrive — a sincronização corrompe o SQLite.
