# Deploy no Railway

Mesmo processo do Portal do Produtor.

1. Crie um repositório no GitHub com este projeto e, no Railway, **New Project → Deploy from GitHub repo**.
2. Em **Settings → Volumes**, crie um volume montado em `/data` (banco e imagens ficam nele).
3. Em **Variables**, defina:
   - `NODE_ENV=production`
   - `SESSION_SECRET=` valor longo e aleatório
     (`node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`)
   - `DATA_DIR=/data`
   - `ADMIN_EMAIL=` e `ADMIN_PASSWORD=` (admin inicial; pode remover depois do 1º acesso)
   - `SUPPORT_URL=` (opcional: link do “Suporte PADAP” na tela de login)
   - Não defina `PORT` (o Railway injeta).
4. Em **Settings → Networking**, gere um domínio ou aponte um CNAME (ex.: `estudio.padapagronegocios.com.br`).

O `railway.json`, `nixpacks.toml` e `Procfile` já estão prontos. Com `NODE_ENV=production`
o app liga `trust proxy` sozinho (necessário para o cookie seguro atrás do HTTPS do Railway).
