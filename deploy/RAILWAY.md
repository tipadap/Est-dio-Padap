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

## Perdeu o acesso do administrador?

1. Em **Variables**, confira `ADMIN_EMAIL` e defina uma `ADMIN_PASSWORD` nova (mínimo 8 caracteres).
2. Adicione `ADMIN_RESET=1` e clique em **Deploy**.
3. Nos logs deve aparecer: `Senha do administrador "…" redefinida` (ou `Administrador "…" criado`).
4. Entre com esse e-mail e senha. Depois **apague `ADMIN_RESET` e `ADMIN_PASSWORD`** e faça Deploy de novo.

## Apagar todos os usuários e recomeçar

**Irreversível:** apaga todos os usuários e as apresentações deles, e derruba todas as sessões.

1. Em **Variables**, defina `ADMIN_EMAIL` e `ADMIN_PASSWORD` (mínimo 8 caracteres) — será o único usuário depois.
2. Crie `ADMIN_WIPE_USERS` com um código qualquer, ex.: `APAGAR-2026-11-10`, e clique em **Deploy**.
3. Nos logs: `ADMIN_WIPE_USERS: N usuário(s) e M apresentação(ões) apagados...`.
4. Entre com o novo admin e **apague `ADMIN_WIPE_USERS` e `ADMIN_PASSWORD`**.

Cada código só funciona uma vez; se a variável ficar esquecida, os próximos deploys não apagam nada.
Se `ADMIN_EMAIL`/`ADMIN_PASSWORD` estiverem inválidos, nada é apagado.

## Recuperação de senha por e-mail (opcional)

Sem estas variáveis, "Esqueci minha senha" orienta a falar com o administrador. Com elas, a
pessoa recebe um link (válido por 1 hora, uso único) para criar uma nova senha.

| Variável | Exemplo |
|---|---|
| `SMTP_HOST` | `smtp.gmail.com` (Google Workspace), `smtp.office365.com` (Microsoft 365) ou o do seu provedor |
| `SMTP_PORT` | `587` (ou `465`) |
| `SMTP_USER` | conta remetente, ex.: `nao-responda@padapagronegocios.com.br` |
| `SMTP_PASS` | senha de app da conta (no Google/Microsoft, gere uma "senha de app") |
| `SMTP_FROM` | `Estúdio PADAP <nao-responda@padapagronegocios.com.br>` |
| `APP_URL` | endereço do sistema, ex.: `https://web-production-83f13.up.railway.app` (obrigatório em produção) |

## Dados do produtor vindos do Portal do Produtor (opcional)

No editor, **Formas → Dados → Dados do produtor (Portal)** busca produtores e propriedades no Portal.

1. Gere uma chave: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
2. No serviço do **Portal** no Railway: `ESTUDIO_API_TOKEN=<chave>`
3. No serviço do **Estúdio**: `PORTAL_URL=<endereço do Portal>` e `PORTAL_API_TOKEN=<a mesma chave>`

A integração é somente leitura e só entrega nome do produtor e propriedades (nome, município, UF, área).
