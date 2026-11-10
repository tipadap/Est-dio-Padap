# Estúdio PADAP

Sistema web para criar apresentações com a identidade visual da **PADAP Produtividade Agrícola**
(Brandbook: cores `#072B35`, `#1DBD2C`, `#0F4C4F`, fonte Space Grotesk, grafismo de folha).

Em produção no Railway — deploy, variáveis, backup e recuperação de acesso em
[`deploy/RAILWAY.md`](deploy/RAILWAY.md).

## O que tem

- **Login** por e-mail e senha, “Lembrar-me” (30 dias), troca de senha obrigatória no 1º acesso e
  “Esqueci minha senha” por e-mail (quando o SMTP está configurado).
- **Página Inicial**: apresentação em branco + modelos prontos — *Apresentação PADAP completa*
  (os 22 modelos oficiais), Institucional, Resultados do Campo, Planejamento Estratégico, Mercado e
  Oportunidades, Inovação que Produz e Sustentabilidade no Agro.
- **Biblioteca**: minhas apresentações (abrir, renomear, duplicar, excluir) e as compartilhadas pela equipe.
- **Editor**
  - Slides: adicionar, duplicar, excluir, arrastar para reordenar, anotações do apresentador, visão em grade.
  - Layouts: **22 Modelos PADAP** (do `Modelos_Slides_PADAP.pptx`), **30 Fundos PADAP** (só decoração;
    aplicar um fundo mantém o conteúdo e ajusta a cor do texto) e 11 layouts básicos.
  - Texto: fonte, tamanho, negrito/itálico/sublinhado, realce, cor, listas, alinhamento.
  - Imagens: **Banco de imagens** (56 fotos reais de agro por tema + as enviadas pelo admin),
    **Portfólio 2026** (45 produtos, logos e páginas) e imagens próprias; máscaras de folha/círculo.
  - Formas da marca (folha, símbolo P, arcos, degradês), **gráficos** de barras/linhas e **tabelas**
    editáveis, **tabela de cotação** e **indicadores de mercado** (preços do admin + dólar PTAX do
    Banco Central) e **dados do produtor** vindos do Portal do Produtor (opcional).
  - Organizar (ordem, alinhar, transparência, bloquear), seleção múltipla, desfazer/refazer, zoom,
    salvamento automático e **histórico de versões** (restaurar uma versão anterior).
- **Apresentar** em tela cheia (setas, espaço, N = anotações, F = tela cheia, Esc = sair).
- **Compartilhar**: visível para a equipe (ver/apresentar/copiar) e/ou link público só de visualização.
- **Exportar**: PowerPoint (.pptx, textos/gráficos/tabelas editáveis), PDF e impressão.
- **Admin**: usuários, imagens (Banco e Portfólio; foto do login, banner e capas dos modelos),
  preços e indicadores de mercado, e **backup** (download .zip + cópia diária automática).

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

Node.js 22 · Express · EJS · SQLite (`better-sqlite3`) · sessão no SQLite · sem build de frontend
(módulos ES puros em `src/public/js`). PPTX com `pptxgenjs` e PDF com `jsPDF`, ambos no navegador.

| Pasta / arquivo | Função |
| --- | --- |
| `src/server.js` | Express, segurança (helmet/CSP, sessão, CSRF), arquivos estáticos e `/health` |
| `src/migrations.js` | Estrutura do banco, em migrações numeradas (`PRAGMA user_version`) |
| `src/routes/` | Páginas, login, API (`/api`) e administração (`/admin`) |
| `src/lib/sanitize.js` | Formato do JSON de slides + limpeza de tudo que vem do navegador (XSS) |
| `src/lib/backup.js` | Backup .zip (admin) e cópia diária do banco |
| `src/lib/banco.js`, `portfolio.js` | Banco de imagens e Portfólio embutidos (catálogos `*.json`) |
| `src/public/js/render.js` | Desenho dos slides (formas, máscaras, textos, gráficos, tabelas) — usado em todas as telas |
| `src/public/js/templates.js` | Layouts e modelos prontos (+ `modelos-padap.js` gerado e `fundos-padap.js`) |
| `src/public/js/editor.js` | Núcleo do editor: estado, desfazer/salvar, palco, slides, comandos e teclado |
| `src/public/js/editor/` | Partes do editor: `ui` (menus/janelas), `texto`, `dados` (gráficos, tabelas, preços, produtor), `imagens` (seletor), `arquivo` (compartilhar, exportar, histórico) |
| `src/public/js/pptx.js`, `pdf.js` | Exportação PowerPoint e PDF |
| `scripts/` | Manutenção: gerar os Modelos PADAP a partir do PPTX e as fotos do Banco ([`scripts/README.md`](scripts/README.md)) |
| `test/` | Testes (`npm test`): servidor/API, migrações e parte visual (layouts, modelos, fundos) |

## Como mudar com segurança

- **Banco de dados**: acrescente uma migração no fim de `src/migrations.js` (nunca edite uma já
  publicada). Antes de migrar um banco com dados, o sistema guarda uma cópia em `DATA_DIR/backups`.
- **Testes**: rode `npm test` antes de enviar. O GitHub Actions roda os testes e o `npm audit` a cada
  push; com “Wait for CI” ligado no Railway, só publica se passarem.
- **Deploy**: push na `main` publica no Railway. A versão nova só entra no ar depois que `/health` responde.

## Observações

- **Fonte no PowerPoint**: o .pptx usa “Space Grotesk”. Em computadores sem a fonte instalada, o
  PowerPoint troca por outra. Instale a fonte (gratuita, Google Fonts) nas máquinas da equipe.
- **OneDrive**: não deixe `DATA_DIR` dentro do OneDrive — a sincronização corrompe o SQLite. O ideal é
  que a própria pasta do projeto também fique fora (ex.: `C:\dev\Estudio_PADAP`).
- **Fotos do Banco de imagens**: Unsplash, licença livre para uso comercial; a origem de cada uma está
  em `src/lib/banco-catalog.json`.
