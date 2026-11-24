# Runbook de produção — Commerce Platform (FastCompre)

Documento operacional para publicar e manter o Commerce Platform em produção. Não repete decisões de arquitetura: a referência normativa é `docs/Architecture.md`. Este runbook **nunca** contém valores reais de secrets.

Itens marcados com **[VALIDAR]** dependem do comportamento real dos provedores e devem ser confirmados — e este documento atualizado — durante a configuração real, antes do go-live.

---

## 1. Topologia

```
Vercel ── fastcompre.com ........ FastCompre (Next.js) ──server-side──▶ api.fastcompre.com
      │   www.fastcompre.com ──── redirect ──▶ fastcompre.com
      └── admin.fastcompre.com .. Admin (Next.js) ───────browser─────▶ api.fastcompre.com
Railway ─ api.fastcompre.com .... API (NestJS, imagem apps/api/Dockerfile, 1 réplica)
      │                              ├─ rede privada ─▶ PostgreSQL (Railway, sem acesso público)
      │                              └─ API S3 ───────▶ Cloudflare R2 (bucket)
Cloudflare R2 ─ media.fastcompre.com ... leitura pública das imagens enviadas
Cloudflare DNS ─ zona fastcompre.com

API ──POST /api/internal/revalidate──▶ fastcompre.com   (revalidação on-demand)
Visitante ──GET /r/fastcompre/{offerId}──▶ api.fastcompre.com ──302──▶ marketplace
```

- A API é o único ponto de acesso ao PostgreSQL. O banco nunca é exposto publicamente — nem para migration, nem para bootstrap.
- Admin e API ficam no mesmo domínio registrável (`*.fastcompre.com`): o cookie de sessão é host-only na API, `SameSite=Lax`, e só é enviado em requisições same-site.
- Estado aprovado dos registros DNS (validado em 2026-11-24, ver 9.5):

  | Registro | Destino | Proxy |
  |---|---|---|
  | `fastcompre.com` (apex) | Vercel (`CNAME @`, resolvido por CNAME flattening) | DNS only |
  | `www.fastcompre.com` | Vercel (CNAME; redirect `308` para o apex) | DNS only |
  | `admin.fastcompre.com` | Vercel (CNAME) | DNS only |
  | `api.fastcompre.com` | Railway (CNAME + TXT `_railway-verify.api`) | DNS only |
  | `media.fastcompre.com` | Domínio customizado do bucket R2 | Servido pelo Cloudflare (proxied), como nesta configuração de domínio customizado do R2 |

  O `media.fastcompre.com` exige a zona `fastcompre.com` na mesma conta Cloudflare do bucket. Habilitar o proxy do Cloudflare na `api` é **mudança de topologia**: exige SSL/TLS **Full** e refazer o gate 9.1 antes (com `CLIENT_IP_SOURCE=socket` até a nova validação).

## 2. Recursos necessários

Descritos por capacidade, não por plano comercial — confirmar na configuração real que o plano contratado de cada provedor oferece o recurso. Cloudflare: recursos confirmados em 2026-11-21 (ver 9.5). Railway: Dockerfile com path customizado, Pre-Deploy Command com timeout, healthcheck, auto-deploy desativável, PostgreSQL privado e domínio customizado com TLS e acesso de shell ao container (`railway ssh`) confirmados em 2026-11-21 (ver 9.5); backups agendados e PITR **não** estão disponíveis no plano atual (exigem Pro); na fase de validação/MVP, substituídos por backup lógico local temporário (ver 9.3); healthcheck como gate de ativação e rollback de deployment confirmados em 2026-11-23 (ver 9.5). Vercel: Root Directory em monorepo pnpm, variáveis restritas a Production e domínio customizado com TLS confirmados para o FastCompre e para o Admin em 2026-11-21 (ver 9.5); Instant Rollback confirmado nos dois projetos em 2026-11-23 (ver 9.5); estratégia de Preview aprovada e validada nos dois projetos em 2026-11-24 (ver seção 3 e 9.5).

| Provedor | Recursos exigidos pelo procedimento |
|---|---|
| Railway | Serviço a partir de Dockerfile (path customizado); Pre-Deploy Command com timeout configurável; healthcheck; rollback para deployment anterior; auto-deploy desativável; PostgreSQL privado com backups agendados; domínio customizado com TLS; acesso de shell ao container do serviço (para bootstrap) |
| Vercel | Dois projetos no mesmo repositório (Root Directory por projeto, monorepo pnpm); variáveis por ambiente (Production separado de Preview); domínio apex + redirect de `www`; rollback para deployment anterior; uso comercial permitido pelo plano |
| Cloudflare | Zona `fastcompre.com`; bucket R2; domínio customizado do bucket; token R2 com permissão de objeto restrita ao bucket |

## 3. Variáveis de ambiente

Nomes derivados do código (`apps/api/src/shared/config/env.schema.ts`, `apps/fastcompre/src/lib/env.ts`, `apps/admin/src/lib/env.ts`, `apps/fastcompre/next.config.ts`). Nenhum valor real neste documento.

### API (Railway, runtime)

| Variável | Obrig. | Finalidade | Secret | Origem do valor |
|---|:-:|---|:-:|---|
| `DATABASE_URL` | ✔ | Conexão com o PostgreSQL pela rede privada | ✔ | Referência ao serviço PostgreSQL do Railway (nunca a URL pública) |
| `SESSION_SECRET` | ✔ | Sessão do Admin (mín. 16 caracteres) | ✔ | Gerado aleatoriamente (recomendado ≥ 32 bytes) |
| `REVALIDATION_SECRET` | ✔ | Header `x-revalidation-secret` enviado ao FastCompre | ✔ | Gerado aleatoriamente; **o mesmo valor** do FastCompre Production |
| `ADMIN_ORIGIN` | ✔ | Origem única aceita por CORS e `OriginGuard` | – | `https://admin.fastcompre.com` — **sem barra final** (comparação exata com o header `Origin`) |
| `REVALIDATION_TARGET_URL` | ✔ | Origem do FastCompre para revalidação | – | `https://fastcompre.com` — o host canônico, nunca `www` (um redirect quebraria o POST) |
| `STORAGE_S3_BUCKET` | ✔ | Bucket de uploads | – | `fastcompre-media` |
| `STORAGE_S3_REGION` | ✔ | Região S3 | – | `auto` (R2) |
| `STORAGE_S3_ENDPOINT` | ✔ (R2) | Endpoint da API S3 | – | `https://<ACCOUNT_ID>.r2.cloudflarestorage.com` |
| `STORAGE_S3_PUBLIC_URL_BASE` | ✔ | Base da URL pública retornada pelo upload | – | `https://media.fastcompre.com` |
| `STORAGE_S3_ACCESS_KEY_ID` | ✔ (R2) | Credencial S3 (sempre junto da secret) | ✔ | Token R2 com leitura/escrita de objetos restrito ao bucket |
| `STORAGE_S3_SECRET_ACCESS_KEY` | ✔ (R2) | Credencial S3 | ✔ | Mesmo token |
| `STORAGE_S3_FORCE_PATH_STYLE` | opc. | Estilo de endereçamento S3 (default `false`) | – | `false` — validado com o R2 em 2026-11-21 (ver 9.5) |
| `CLIENT_IP_SOURCE` | opc. | Origem do IP do rate limit (`socket` \| `x-real-ip`) | – | `x-real-ip` (gate da seção 9.1 validado em 2026-11-23); `socket` até o gate passar em uma nova cadeia de proxy |
| `PORT` | – | Porta HTTP | – | Injetada pelo Railway |

`NODE_ENV=production` já é definido pela imagem (`apps/api/Dockerfile`).

### Admin (Vercel, build-time)

| Variável | Obrig. | Finalidade | Secret | Origem do valor |
|---|:-:|---|:-:|---|
| `NEXT_PUBLIC_API_URL` | ✔ | Base da API usada pelo navegador | – (embutida no bundle) | `https://api.fastcompre.com` (só a origem) |
| `ENABLE_EXPERIMENTAL_COREPACK` | ✔ | Operacional (não lida pelo app): faz a Vercel usar o `packageManager` da raiz (`pnpm@11.17.0`) | – | `1` |

Por ser `NEXT_PUBLIC_*`, o valor é embutido no build: qualquer mudança exige novo deploy do Admin.

Node.js do projeto: **22.x** (Settings → Build and Deployment), alinhado ao CI.

### FastCompre (Vercel, build-time **e** runtime)

| Variável | Obrig. | Finalidade | Secret | Origem do valor |
|---|:-:|---|:-:|---|
| `SITE_SLUG` | ✔ | Site servido por este deployment | – | O mesmo `--site-slug` do bootstrap (`fastcompre`) |
| `API_URL` | ✔ | Chamadas server-side à API pública | – | `https://api.fastcompre.com` |
| `SITE_URL` | ✔ | URL canônica, `sitemap.xml`, `robots.txt` | – | `https://fastcompre.com` |
| `AFFILIATE_REDIRECT_URL` | ✔ | Origem dos links `/r/{siteSlug}/{offerId}` | – | `https://api.fastcompre.com` (o redirect é servido pela API) |
| `REVALIDATION_SECRET` | ✔ | Valida chamadas de revalidação | ✔ | O mesmo valor da API |
| `STORAGE_PUBLIC_URL_BASE` | ✔ | `images.remotePatterns` do `next/image` (build falha sem ela em produção) | – | `https://media.fastcompre.com` |
| `ENABLE_EXPERIMENTAL_COREPACK` | ✔ | Operacional (não lida pelo app): faz a Vercel usar o `packageManager` da raiz (`pnpm@11.17.0`) em vez da versão inferida do lockfile | – | `1` |

Node.js do projeto: **22.x** (Settings → Build and Deployment), alinhado ao CI.

### Preview (Vercel)

Estratégia aprovada em 2026-11-24 (ver 9.5): Preview é **somente para build e revisão visual**. Não é staging funcional e não substitui um ambiente de staging futuro.

Regras:

- Nenhum secret de Production é reutilizado em Preview (em especial `REVALIDATION_SECRET`).
- Variáveis de Production ficam marcadas **somente** em Production; as de Preview, **somente** em Preview.
- Vercel Authentication (Standard Protection) permanece ativa nos dois projetos: Previews só abrem para quem está autenticado na Vercel.
- FastCompre Preview pode consumir a leitura pública da API de produção, mas o redirect de afiliado é inerte (nenhum CTA chega à API e nenhum `AffiliateClick` é criado).
- Admin Preview fica isolado da API de produção: nenhuma chamada a ela; sem autenticação e sem escrita.
- Builds de Preview rodam com `NODE_ENV=production`: sem as variáveis de Preview, os builds dos dois projetos falham por design.

FastCompre — escopo **Preview**:

| Variável | Valor |
|---|---|
| `SITE_SLUG` | `fastcompre` |
| `API_URL` | `https://api.fastcompre.com` |
| `SITE_URL` | `https://fastcompre.com` |
| `AFFILIATE_REDIRECT_URL` | `https://affiliate-preview.invalid` (inerte; `.invalid` não resolve) |
| `REVALIDATION_SECRET` | Valor **exclusivo de Preview**, nunca o de Production (valor não registrado) |
| `STORAGE_PUBLIC_URL_BASE` | `https://media.fastcompre.com` |
| `ENABLE_EXPERIMENTAL_COREPACK` | `1` |

Admin — escopo **Preview**:

| Variável | Valor |
|---|---|
| `NEXT_PUBLIC_API_URL` | `https://api-preview.invalid` (inerte; nenhuma chamada à API de produção) |
| `ENABLE_EXPERIMENTAL_COREPACK` | `1` |

Limpeza após qualquer uso de Preview: remover apenas branches e deployments temporários. As variáveis de Preview e a Standard Protection são permanentes nesta fase.

## 4. Primeiro deploy

Pré-condições: CI verde no commit a publicar; acesso administrativo aos três provedores; zona `fastcompre.com` ativa no Cloudflare (concluído em 2026-11-21).

1. **R2** — concluído em 2026-11-21 (evidências em 9.5)
   1. Criar o bucket (`fastcompre-media`).
   2. Conectar o domínio customizado `media.fastcompre.com` ao bucket. O acesso público por `r2.dev` permanece desabilitado.
   3. Criar token com leitura/escrita de objetos **restrito ao bucket**; guardar access key e secret no gerenciador de secrets.
   4. Anotar o endpoint S3 da conta (`https://<ACCOUNT_ID>.r2.cloudflarestorage.com`).
2. **PostgreSQL (Railway)**
   1. Criar o serviço PostgreSQL **sem** acesso público.
   2. Backups: em 2026-11-21, backups automáticos/PITR exigiam plano Pro na UI do Railway; decisão do PO: sem upgrade nesta fase. Durante a validação/MVP, backup lógico local temporário conforme a seção 9.3 (com a limitação registrada lá).
3. **API (Railway)**
   1. Criar o serviço como **Empty Service** e conectar o repositório (branch `main`) antes do primeiro deploy. Root Directory **vazio** (build context na raiz), Builder `Dockerfile`, variável `RAILWAY_DOCKERFILE_PATH=apps/api/Dockerfile` (relativa, sem barra inicial) e Start Command vazio (vale o `CMD` da imagem). Confirmado no build log: `load build definition from apps/api/Dockerfile`.
   2. Desativar auto-deploy (deploy manual).
   3. Pre-Deploy Command: `node_modules/.bin/prisma migrate deploy` (diretório de trabalho da imagem: `/app`).
   4. **Pre-Deploy Timeout**: configurar deliberadamente — o Railway não impõe limite por padrão, e `prisma migrate deploy` não deve poder ficar preso indefinidamente. Valor definido: **300 s**.
   5. Healthcheck path: `/health`; Healthcheck Timeout: **300 s**.
   6. Réplicas: 1 (o rate limit é em memória por processo).
   7. Variáveis da seção 3 (API). `CLIENT_IP_SOURCE=socket` (ou ausente) no primeiro deploy; `x-real-ip` só depois do gate da seção 9.1.
   8. Domínio customizado `api.fastcompre.com`: no Cloudflare, CNAME `api` para o target fornecido pelo Railway e TXT `_railway-verify.api`; TLS automático. **Target port do domínio = porta em que o Railway detectou a aplicação** (8080 em 2026-11-21; a API escuta em `PORT`). Target port errado resulta em `502 Application failed to respond`. O CNAME fica em **DNS only** (estado aprovado em 2026-11-24, ver seção 1 e 9.5). Ativar o proxy do Cloudflare na `api` é mudança de topologia: exige SSL/TLS **Full** e refazer o gate 9.1.
4. **Deploy da API** — disparar manualmente o deploy do commit validado. Esperado: build → pre-deploy aplica as migrations → healthcheck 2xx → deployment ativo. Conferir `GET https://api.fastcompre.com/health` → `{"status":"ok"}`. Primeiro deploy executado em 2026-11-21 (ver 9.5).
5. **Bootstrap** — seção 5.
6. **FastCompre (Vercel)**
   1. Projeto com Root Directory `apps/fastcompre` (monorepo pnpm), framework Next.js, Node.js 22.x; Build/Install/Output nos padrões, sem overrides.
   2. Variáveis da seção 3 no ambiente **Production** (somente Production), incluindo `ENABLE_EXPERIMENTAL_COREPACK=1`; conferir no build log que o pnpm usado é o 11.17.0.
   3. Domínios: `fastcompre.com` (canônico) e `www.fastcompre.com` com redirect `308` para o apex. No Cloudflare, CNAME no apex (`@`, resolvido por CNAME flattening do Cloudflare) e CNAME `www`, ambos apontando para o target indicado pelo projeto em Settings → Domains, em **DNS only**; sem registro AAAA (a Vercel não suporta IPv6 para custom domains neste modelo).
   4. Deploy. Conferir Home (estado vazio), uma rota inexistente (404), `/robots.txt` e `/sitemap.xml`.
7. **Admin (Vercel)**
   1. Projeto com Root Directory `apps/admin`, framework Next.js, Node.js 22.x; Build/Install/Output nos padrões, sem overrides.
   2. `NEXT_PUBLIC_API_URL` e `ENABLE_EXPERIMENTAL_COREPACK=1` somente no ambiente Production.
   3. Deploy inicial; conferir no build log o pnpm 11.17.0 e o `prebuild` de `contracts`, `ui` e `editorial`.
   4. Na URL provisória da Vercel, validar só o carregamento de `/login`, sem tentar autenticação — **não** tentar login fora de `admin.fastcompre.com`: CORS e `OriginGuard` restringem a origem do Admin, e o fluxo de cookie foi projetado para os subdomínios same-site de `fastcompre.com`.
   5. Domínio `admin.fastcompre.com`: adicionar no projeto (Settings → Domains) e, no Cloudflare, criar CNAME `admin` para o target indicado pela Vercel, em **DNS only**.
   6. Validar HTTPS do domínio, login, persistência da sessão, logout e redirect para `/login` sem sessão (ver 9.5).
8. **Smoke test** — seção 6.
9. **Gates operacionais** — seção 9.

## 5. Bootstrap do primeiro administrador

One-off, executado **dentro do ambiente da API** (onde a rede privada e as variáveis do serviço já existem). Nunca por endpoint HTTP e nunca a partir de máquina local com o banco exposto.

1. Abrir shell no container do serviço API com o Railway CLI (validado em 2026-11-21, ver 9.5):
   - `railway login`; chave SSH local registrada no Railway (o CLI oferece o registro no primeiro `railway ssh`; não usar `RAILWAY_TOKEN` de projeto);
   - `railway link --project commerce-platform --environment production --service api`, executado **fora do repositório** (o link grava estado local no diretório atual); conferir com `railway status`;
   - `railway ssh` abre o shell em `/app`. Antes de executar o bootstrap, confirmar que `tty` retorna um dispositivo (`/dev/pts/N`), validando o terminal interativo exigido pelo prompt de senha sem eco, e que as variáveis do serviço estão presentes (checar só a presença, nunca imprimir valores).
2. Executar:
   ```
   node dist/cli/bootstrap-admin.js \
     --email <email-do-owner> \
     --user-name "<nome>" \
     --site-name "FastCompre" \
     --site-slug fastcompre \
     --site-domain fastcompre.com
   ```
3. A senha é digitada **somente** no prompt interativo (sem eco), duas vezes. Nunca passar a senha como argumento, variável de ambiente, arquivo ou pipe — ela ficaria em histórico, logs ou listagem de processos (e o prompt exige terminal interativo de qualquer forma).
4. Resultado esperado: `Administrador criado com sucesso.` com e-mail, Site e Role `OWNER`. `User`, `Site` e `SiteUser(OWNER)` são criados atomicamente.
5. Validar sem consultar o banco diretamente:
   - login em `https://admin.fastcompre.com` com o e-mail e a senha;
   - com um único Site, o login redireciona para o Dashboard `/fastcompre` — confirma `SiteUser` vinculado ao Site;
   - ações de OWNER disponíveis (ex.: atalhos de criação no Dashboard).

   Até o Admin estar publicado, a verificação possível é a contagem somente leitura de `User`, `Site` e `SiteUser` dentro do container (transação `READ ONLY`, sem imprimir e-mail, hash ou IDs). A validação por login é obrigatória após o deploy do Admin — concluída em 2026-11-21 (ver 9.5).
6. Não repetir o comando. Uma segunda execução com os mesmos dados falha sem criar nada.

Se o bootstrap falhar: nenhum dos três registros é criado. Corrigir argumentos/ambiente e executar novamente.

## 6. Smoke test pós-deploy

Executar após o primeiro deploy e após cada deploy relevante. Não criar dados fictícios em produção.

1. `GET https://api.fastcompre.com/health` → 200 `{"status":"ok"}`.
2. FastCompre: Home responde 200; rota inexistente responde 404; `www.fastcompre.com` redireciona para `fastcompre.com`.
3. Admin: login, Dashboard carregado, navegação para Artigos/Produtos, logout.
4. Upload real (capa de Artigo ou imagem de Produto que será usada de fato): a URL retornada (`https://media.fastcompre.com/...`) abre no navegador.
5. Primeira publicação **real** (quando houver conteúdo real): o Artigo aparece na Home e na Categoria sem intervenção manual (prova da revalidação); o CTA da Oferta responde 302 para o marketplace (prova do tracking — gera um `AffiliateClick` legítimo; uma Oferta com clique não pode ser excluída fisicamente).
6. Logs da API no Railway (validado em 2026-11-24, ver 9.5):
   - **Logs estruturados produzidos pela aplicação** (Pino): requisições mostram método, path, status e request ID; **não** mostram `Authorization`, cookies/sessão, secrets, request bodies, query string nem IP de cliente (Architecture §15). A regra vale para esses logs.
   - **Logs HTTP de borda da Railway** são logs da plataforma, fora do controle do código: incluem o `srcIp` do cliente (com retenção definida pela Railway). Isso não é falha da aplicação. Conferir que não mostram query string, cookies, `Authorization` nem body.

## 7. Deploys posteriores

1. CI verde no commit.
2. **API primeiro** (deploy manual no Railway):
   - o pre-deploy roda `prisma migrate deploy`; sem migration pendente, termina com "No pending migrations to apply." e o deploy segue;
   - o novo deployment só recebe tráfego depois do healthcheck 2xx;
   - migrations nunca rodam no startup da API.
3. **Frontends depois**, quando dependerem da nova API.
4. Regra obrigatória: mudanças de schema e de contrato são **expand/contract** — a nova migration precisa funcionar com o código que já está no ar, e o código novo precisa tolerar o schema anterior durante a janela de deploy. Remoções e renomeações destrutivas acontecem só em deploy posterior, depois que nenhum código ativo depende do formato antigo.

## 8. Falhas e rollback

| Situação | Procedimento |
|---|---|
| **Build falha** (Railway ou Vercel) | Nada muda em produção. Corrigir e fazer novo deploy. |
| **Migration falha no pre-deploy** | Ver 8.1. |
| **Nova API não passa no healthcheck** | O deployment novo fica em `Deploying` durante a janela do healthcheck e termina `Failed`, sem receber tráfego; o deployment anterior continua ativo e servindo (validado em 2026-11-23, ver 9.5). Ler os logs da API. Se o pre-deploy tiver aplicado migrations antes da falha do healthcheck, elas **permanecem no banco** — o rollback da aplicação não as desfaz, e por isso a regra expand/contract da seção 7 é obrigatória. |
| **API cai depois de ficar `Active`** | O healthcheck do Railway é gate de ativação, **não** monitoramento contínuo. Não há evidência de fallback automático para o deployment anterior: o Railway reinicia o processo conforme a restart policy. Se não estabilizar, fazer rollback (linha abaixo). |
| **API ativa com problema funcional** | Rollback no Railway (validado em 2026-11-23, ver 9.5): serviço `api` → **Deployments** → menu ⋯ do último deployment saudável → **Rollback** → confirmar. O Railway cria um **novo deployment**, executa de novo o pipeline de build, o **pre-deploy** (`prisma migrate deploy`) e o **healthcheck**. O rollback **não reverte o banco**: migrations já aplicadas permanecem — por isso a regra expand/contract da seção 7 é obrigatória. O rollback pode restaurar variáveis do deployment escolhido; **após o rollback, conferir as variáveis críticas da API** (neste teste, `CLIENT_IP_SOURCE` permaneceu `x-real-ip`) e executar o smoke test da seção 6. |
| **Frontend novo incompatível** | Instant Rollback na Vercel **no projeto afetado** — FastCompre e Admin são projetos independentes, com rollback próprio (validado em 2026-11-23, ver 9.5). Tile de Production → **Instant Rollback** → escolher um deployment de produção anterior `Ready` → confirmar. A Vercel reatribui os domínios ao deployment existente, sem rebuild. O deployment escolhido roda com as variáveis do build dele; mudanças de env posteriores não se aplicam a ele. Por isso, **antes do rollback**, verificar se o deployment escolhido continua compatível com a API atual, os contratos, os secrets (ex.: `REVALIDATION_SECRET`), os hosts/domínios e a configuração de storage e revalidação. Após o rollback, a Vercel desliga a atribuição automática dos domínios de Production; resolvido o incidente, usar **Manage/Promote** para voltar ao deployment desejado e reabilitá-la. Se a incompatibilidade for com a API, avaliar primeiro o rollback da API (limitado pela migration aplicada). |
| **Bootstrap falha** | Nada é criado (transação única). Corrigir e repetir. |
| **Dados/schema comprometidos** | Restaurar backup do PostgreSQL é último recurso, implica perda de dados desde o backup e exige decisão do Product Owner. Não existe down migration automática. Backups disponíveis e limitações: seção 9.3. |

### 8.1 Migration falhou

Regra: `prisma migrate deploy` (Pre-Deploy) é o **único** mecanismo normal de aplicação de migrations em produção. `prisma migrate resolve` é só recuperação/reconciliação de incidente — nunca substitui o `deploy`. Ele **não executa nem desfaz** SQL da migration; apenas escreve no histórico (`_prisma_migrations`).

1. O deploy é interrompido; a nova versão da API **não** entra no ar e o deployment anterior continua ativo.
2. **Não presumir rollback automático** do que a migration fez. Algumas migrations do projeto são explicitamente transacionais, mas isso não é garantia para migrations futuras nem para todo tipo de DDL.
3. Enquanto a falha não for resolvida, **todo novo deploy da API falha no Pre-Deploy**. Na topologia validada deste projeto, redeploy e rollback da API também criam novo deployment e voltam a executar o Pre-Deploy (ver seção 8); portanto, enquanto a migration falha não for resolvida, esses caminhos também ficam bloqueados. O deployment ativo segue servindo.
4. Inspecionar, antes de qualquer ação (somente leitura, via `railway ssh` no container ativo da `api`):
   - `node_modules/.bin/prisma migrate status`;
   - a tabela `_prisma_migrations` em transação `READ ONLY`. Migration falha = linha com `finished_at` e `rolled_back_at` nulos; o erro fica em `logs`. A imagem não tem `psql`; usar `node` + `pg` (dependência da API):
     ```sh
     node - <<'EOF'
     const { Client } = require('pg');
     (async () => {
       const c = new Client({ connectionString: process.env.DATABASE_URL });
       await c.connect(); await c.query('BEGIN READ ONLY');
       console.table((await c.query(`SELECT migration_name, started_at, finished_at, rolled_back_at,
         left(checksum, 12) AS checksum_prefix, (logs IS NOT NULL) AS has_logs
         FROM "_prisma_migrations" ORDER BY started_at`)).rows);
       await c.query('ROLLBACK'); await c.end();
     })().catch((e) => { console.error('Falha:', e.code ?? 'erro'); process.exit(1); });
     EOF
     ```
   - o estado real do schema e dos dados afetados.
5. Decidir conforme o estado real encontrado:
   - **nada foi aplicado**, ou o que foi aplicado foi revertido manualmente → `--rolled-back` (item 6), corrigir a migration em novo commit e voltar ao fluxo normal de deploy;
   - **o banco já está exatamente no estado que a migration deveria produzir** (passos concluídos manualmente, conferidos) → `--applied` (item 7);
   - **aplicação parcial** → reverter manualmente e usar `--rolled-back`, ou concluir manualmente e usar `--applied`, ou migration corretiva planejada. Nunca editar uma migration já aplicada com sucesso em produção.
6. **`prisma migrate resolve --rolled-back "<M>"`** — só depois de investigar o estado real do banco. Marca a linha falha de M como rolled back (escreve `rolled_back_at` no histórico), o que libera o próximo `migrate deploy` para executar M de novo. Não exige o arquivo da migration no container, então pode ser executado via `railway ssh` no container ativo da `api`. Depois: corrigir a migration e/ou o estado necessário e seguir o fluxo normal de deploy.
7. **`prisma migrate resolve --applied "<M>"`** — só quando o banco já foi levado exatamente ao estado que M produziria. Registra M como aplicada sem executar o SQL. **Exige o arquivo `prisma/migrations/<M>/migration.sql` no container** (o checksum é gravado a partir dele) — o container ativo da `api` roda a imagem anterior e não o contém. Procedimento: serviço temporário `ops-migrate` (validado em ensaio somente leitura, ver 9.5):
   1. No projeto `commerce-platform`, environment `production`: **+ New → Empty Service** `ops-migrate`; mesmo repositório e branch da API; Root Directory vazio; Builder Dockerfile.
   2. Variáveis com mínimo privilégio: somente `DATABASE_URL=${{Postgres.DATABASE_URL}}` e `RAILWAY_DOCKERFILE_PATH=apps/api/Dockerfile`. Nenhum secret funcional (sessão, revalidação, storage etc.).
   3. Start Command `sleep infinity` (inerte; mantém um container disponível para SSH). Sem domínio, sem TCP Proxy, sem healthcheck e sem Pre-Deploy.
   4. Deploy e aguardar `Active`. Entrar com `railway ssh -s ops-migrate`.
   5. Conferir `echo "$RAILWAY_GIT_COMMIT_SHA"`: **abortar** se não for exatamente o commit que contém M. Conferir `ls prisma/migrations/<M>/migration.sql`.
   6. Executar `node_modules/.bin/prisma migrate status` e a inspeção somente leitura do item 4.
   7. Só então, em incidente real e após confirmação técnica: `node_modules/.bin/prisma migrate resolve --applied "<M>"`.
   8. Conferir de novo `migrate status` e a inspeção somente leitura.
   9. Remover completamente o serviço `ops-migrate` (Settings → Danger → Delete Service).
   10. Só depois, deploy normal da `api` (Pre-Deploy `migrate deploy` inalterado).
8. Depois de qualquer `resolve`: novo deploy pelo fluxo normal, `migrate status`, inspeção somente leitura, `GET /health` e smoke test da seção 6. Rollback da aplicação, se necessário, só depois de o histórico estar resolvido — e ele não desfaz o banco.

## 9. Gates operacionais

Gates que ficam abertos depois do primeiro deploy e não podem ser presumidos.

### 9.1 Origem confiável do IP de cliente (`CLIENT_IP_SOURCE`)

Estado inicial: `CLIENT_IP_SOURCE=socket`. Atrás do Railway, o socket não representa o visitante: o experimento de 2026-11-23 mostrou peers internos da Railway (faixa `100.64.x.x`, variando entre requisições). Antes da medição, o compartilhamento do limite (login 5/60s, redirect de afiliado 30/60s) entre visitantes era uma hipótese conservadora, não um fato medido. Aceito até este gate passar.

Só mudar para `x-real-ip` depois de provar, na cadeia real (Railway e, se houver, Cloudflare na frente de `api.fastcompre.com`), as duas propriedades abaixo. Executar com `CLIENT_IP_SOURCE=x-real-ip` aplicado em janela controlada, antes de tráfego real, usando somente `POST /admin/auth/login` com e-mail inexistente (não usar `/r/...`, que gera `AffiliateClick`). Nenhum IP é registrado em log para isso (PROD-003); as provas são comportamentais.

1. **Anti-spoofing** — de um mesmo cliente, enviar 6 tentativas de login seguidas, cada uma com um `X-Real-IP` falso diferente. Esperado: a 6ª recebe **429**. Se não receber, o header pode ser forjado → voltar imediatamente para `socket`.
2. **Distinção de clientes reais** — esgotar o limite a partir do cliente A (rede 1) até receber 429; em seguida, dentro da mesma janela de 60s, tentar o login a partir do cliente B em outra rede real (ex.: rede móvel). Esperado: B **não** recebe 429. Se receber, o valor não representa o visitante (ex.: representa um proxy intermediário) → voltar para `socket`.

Resultado (2026-11-23): gate **aprovado**; configuração final `CLIENT_IP_SOURCE=x-real-ip` (evidências em 9.5).

Modelo de confiança:
- `X-Real-IP` é usado **somente** porque, na topologia atual (cliente → edge do Railway → API, com `api.fastcompre.com` em DNS only no Cloudflare), foi comprovado empiricamente que o edge do Railway controla e sobrescreve esse header.
- `trust proxy` do Express permanece desabilitado.
- `X-Forwarded-For` não é usado como fonte de IP.
- Refazer este gate se o Cloudflare passar a proxyar `api.fastcompre.com`, se a cadeia de proxy mudar ou se a API migrar de infraestrutura. Até a nova validação, voltar para `socket`.

### 9.2 Recuperação de migration falha

Gate **aprovado** (ver 9.5). Procedimento na seção 8.1: inspeção somente leitura e `--rolled-back` via `railway ssh` no container ativo da `api`; `--applied` via serviço temporário `ops-migrate`.

### 9.3 Backup e restore do PostgreSQL

Gate **aprovado para a fase de validação/MVP** (drill em 2026-11-24, ver 9.5), com a limitação abaixo.

**Estratégia atual (validação/MVP):** backup lógico local temporário, manual.

- `pg_dump -Fc` executado **dentro** do container do serviço `Postgres` no Railway (PostgreSQL **18.6**; `pg_dump` da mesma versão). Nenhuma credencial sai do Railway e o banco continua privado.
- SHA-256 calculado na origem (container) e no destino (máquina local); os dois precisam ser idênticos.
- Criptografia local com GPG AES256 (`gpg --symmetric --cipher-algo AES256`), com a passphrase digitada só no pinentry. A passphrase nunca deve aparecer na linha de comando ou no repositório e precisa ser mantida pelo operador em local seguro; sua perda torna os backups irrecuperáveis.
- Ficam retidos somente `fastcompre-prod-pg18-<AAAAMMDDTHHMMSSZ>.dump.gpg` e o `.sha256` (checksum do dump e do `.gpg`), em `~/backups/commerce-platform`, com permissão `600`. Dumps em claro são removidos depois do drill.

**Quando executar e retenção:**

- obrigatório antes de todo deploy da API com migration nova;
- pelo menos semanal enquanto houver dados reais;
- manter 30 dias e nunca menos que os 3 backups mais recentes (remoção manual, após conferir com `ls -l`).

**Procedimento.** Arquivos locais ficam em `~/backups/commerce-platform`; os comandos `railway …` precisam rodar a partir de `~/railway-ops` (diretório vinculado ao projeto/ambiente; de outro diretório o CLI responde `No linked project found`). Por isso todos os comandos abaixo rodam num único shell em `~/railway-ops` e usam caminhos absolutos para os arquivos locais:

```bash
B="$HOME/backups/commerce-platform"
cd "$HOME/railway-ops"
```

1. Impressão digital da produção **antes** (somente leitura; não fazer login no Admin até o passo 7, porque o login cria linhas em `Session`). O arquivo `fp.sql` contém as consultas de contagem das tabelas do domínio, `_prisma_migrations`, colunas, enums, índices e constraints:
   ```sql
   \pset footer off
   SELECT 'counts', (SELECT count(*) FROM "Site"), (SELECT count(*) FROM "User"), (SELECT count(*) FROM "SiteUser"),
     (SELECT count(*) FROM "Session"), (SELECT count(*) FROM "Category"), (SELECT count(*) FROM "Product"),
     (SELECT count(*) FROM "Offer"), (SELECT count(*) FROM "Article"), (SELECT count(*) FROM "ArticleProduct"),
     (SELECT count(*) FROM "Author"), (SELECT count(*) FROM "AffiliateClick");
   SELECT 'migrations', count(*), md5(string_agg(migration_name||'|'||checksum||'|'||coalesce(finished_at::text,'')||'|'||coalesce(rolled_back_at::text,''), ',' ORDER BY migration_name)) FROM _prisma_migrations;
   SELECT 'columns', md5(string_agg(table_name||'.'||column_name||':'||data_type||':'||is_nullable||':'||coalesce(column_default,''), ',' ORDER BY table_name, column_name)) FROM information_schema.columns WHERE table_schema='public';
   SELECT 'enums', md5(string_agg(t.typname||':'||e.enumlabel, ',' ORDER BY t.typname, e.enumsortorder)) FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid;
   SELECT 'indexes', md5(string_agg(indexdef, ',' ORDER BY indexname)) FROM pg_indexes WHERE schemaname='public';
   SELECT 'constraints', md5(string_agg(conname||':'||pg_get_constraintdef(oid), ',' ORDER BY conname)) FROM pg_constraint WHERE connamespace='public'::regnamespace;
   ```
   ```bash
   railway ssh -s Postgres -- sh -c 'psql -X -A -t -v ON_ERROR_STOP=1 -h localhost -U "$PGUSER" -d "$PGDATABASE" -f -' < "$B/fp.sql" > "$B/fp-prod-before.txt"
   ```
2. Dump dentro do container e checksum na origem:
   ```bash
   TS=$(date -u +%Y%m%dT%H%M%SZ); NAME="fastcompre-prod-pg18-$TS"
   railway ssh -s Postgres -- sh -c "pg_dump -h localhost -U \"\$PGUSER\" -d \"\$PGDATABASE\" -Fc -Z 6 -f /tmp/$NAME.dump && sha256sum /tmp/$NAME.dump"
   ```
3. Transferência, checksum no destino (tem que ser igual ao da origem; se não for, descartar e repetir), validação do arquivo e remoção na origem:
   ```bash
   railway ssh -s Postgres -- cat "/tmp/$NAME.dump" > "$B/$NAME.dump"
   sha256sum "$B/$NAME.dump"
   docker run --rm -i postgres:18.6 pg_restore --list < "$B/$NAME.dump" > /dev/null && echo "dump válido"
   railway ssh -s Postgres -- rm -f "/tmp/$NAME.dump"
   ```
4. Checksums e criptografia:
   ```bash
   (cd "$B" && sha256sum "$NAME.dump" > "$NAME.sha256")
   gpg --symmetric --cipher-algo AES256 --output "$B/$NAME.dump.gpg" "$B/$NAME.dump"
   (cd "$B" && sha256sum "$NAME.dump.gpg" >> "$NAME.sha256")
   chmod 600 "$B/$NAME.dump.gpg" "$B/$NAME.sha256"
   ```
5. Restore drill local (container temporário, exposto só em `127.0.0.1`, dados em memória), partindo do `.gpg`:
   ```bash
   PW=$(openssl rand -hex 16)
   docker run -d --name cp-restore-drill -e POSTGRES_PASSWORD="$PW" -e POSTGRES_DB=railway \
     -p 127.0.0.1:55432:5432 --tmpfs /var/lib/postgresql postgres:18.6
   gpg --decrypt --output "$B/restore-$NAME.dump" "$B/$NAME.dump.gpg"
   grep -q "$(sha256sum < "$B/restore-$NAME.dump" | cut -d' ' -f1)" "$B/$NAME.sha256" && echo "checksum após decrypt OK"
   docker exec -i cp-restore-drill pg_restore -U postgres -d railway --no-owner --no-privileges --exit-on-error < "$B/restore-$NAME.dump"
   docker exec -i cp-restore-drill psql -X -A -t -v ON_ERROR_STOP=1 -U postgres -d railway < "$B/fp.sql" > "$B/fp-restore.txt"
   diff "$B/fp-prod-before.txt" "$B/fp-restore.txt" && echo "restore == produção"
   (cd <repo> && DATABASE_URL="postgresql://postgres:$PW@127.0.0.1:55432/railway" pnpm --filter api exec prisma migrate status)
   ```
6. Limpeza obrigatória: `docker rm -f cp-restore-drill; unset PW; rm -f "$B/$NAME.dump" "$B/restore-$NAME.dump"` (ficam só `.dump.gpg` e `.sha256`).
7. Impressão digital da produção **depois** (mesmo comando do passo 1, ainda a partir de `~/railway-ops`, saída em `"$B/fp-prod-after.txt"`) e `diff "$B/fp-prod-before.txt" "$B/fp-prod-after.txt"`; conferir que a `api` continua no mesmo deployment e `GET /health` → 200.

Restaurar um backup **no banco de produção** não faz parte deste procedimento: é último recurso, com decisão do Product Owner (seção 8).

**Limitação (aceita somente durante validação/MVP):**

- não protege contra perda simultânea da máquina/disco local;
- não oferece PITR;
- RPO = intervalo entre backups; RTO depende de execução manual;
- antes de dados críticos ou do go-live definitivo, adotar backup externo automatizado ou PITR.

### 9.4 Comportamentos de provedor pendentes

- Comportamento do deployment anterior quando o novo falha no healthcheck: validado em 2026-11-23 (ver 9.5).
- Procedimento de rollback de deployment no Railway: validado em 2026-11-23 (ver 9.5).
- Procedimento de rollback de deployment na Vercel: validado em 2026-11-23 para FastCompre e Admin (ver 9.5).
- Pre-Deploy Timeout e timeout de healthcheck: definidos em 2026-11-21 (300 s cada; ver 9.5).
- Status de proxy/DNS-only por registro DNS: aprovado e validado em 2026-11-24 (ver seção 1 e 9.5).
- Estratégia de Preview na Vercel: aprovada e validada em 2026-11-24 (ver seção 3 e 9.5).

### 9.5 Validações concluídas

**Cloudflare DNS + R2 — 2026-11-21**

- Zona `fastcompre.com` ativa no Cloudflare (nameservers trocados no registrador; registros pré-existentes preservados).
- Bucket `fastcompre-media` criado; região `auto`; acesso público por `r2.dev` não habilitado.
- Domínio customizado `media.fastcompre.com` ativo no bucket; leitura pública de objeto retornou HTTP 200 com o conteúdo correto.
- Token R2 com permissão `Object Read & Write` restrita ao bucket; credenciais guardadas fora do repositório.
- Upload com o mesmo `@aws-sdk/client-s3` usado pela API, com `region: auto`, endpoint S3 da conta e `forcePathStyle: false`: funcionou. `DeleteObject` também funcionou. Portanto `STORAGE_S3_FORCE_PATH_STYLE=false`.

**Railway + PostgreSQL + API (primeiro deploy, sem bootstrap) — 2026-11-21**

- Projeto `commerce-platform`; serviço PostgreSQL `Postgres` sem Public Access/TCP Proxy; `DATABASE_PUBLIC_URL` inexistente.
- Backups automáticos/PITR exigem plano Pro na UI atual; nenhum upgrade feito. Banco sem backup agendado (gate 9.3 aberto).
- Serviço `api`: repositório `leogeison/commerce-platform`, branch `main`, Root Directory vazio, auto-deploy desativado, Builder `Dockerfile`, `RAILWAY_DOCKERFILE_PATH=apps/api/Dockerfile`, Start Command vazio, 1 réplica.
- Build log: `load build definition from apps/api/Dockerfile`.
- `DATABASE_URL=${{Postgres.DATABASE_URL}}` (referência privada); Prisma conectou em `postgres.railway.internal:5432`.
- Pre-deploy `node_modules/.bin/prisma migrate deploy` (timeout 300 s): 2 migrations encontradas e aplicadas. As migrations rodaram no pre-deploy, não no startup da API.
- Nest iniciou; healthcheck `/health` (timeout 300 s) passou na primeira tentativa.
- **Porta:** o Railway detectou a aplicação ouvindo na porta **8080**. Com target port `3000` no domínio customizado, a resposta foi `502 Application failed to respond`; trocar o target port para `8080` (no domínio Railway e no customizado) resolveu. Foi uma validação operacional, sem mudança de código.
- Domínio Railway `api-production-89f31192.up.railway.app` e domínio customizado `api.fastcompre.com` (CNAME `api` + TXT `_railway-verify.api` no Cloudflare, CNAME em DNS only): `GET /health` nos dois retornou HTTP/2 200 com `{"status":"ok"}`.
- `CLIENT_IP_SOURCE=socket` mantido.
- Ainda **não** validados nesta etapa: bootstrap e shell (seção 5), `prisma migrate resolve` (9.2), deployment anterior com healthcheck falho e rollback (9.4), backups/restore (9.3), proxy Cloudflare da API, X-Real-IP (9.1), Vercel e Preview.

**Bootstrap do primeiro administrador/Site — 2026-11-21**

- Railway CLI autenticado e vinculado ao projeto `commerce-platform`, environment `production`, serviço `api`; `railway ssh` funcionou com chave SSH registrada.
- Shell dentro do container da API: `pwd` = `/app`, `tty` = `/dev/pts/0` (terminal interativo); `dist/cli/bootstrap-admin.js` presente; variáveis críticas do serviço presentes (verificada só a presença).
- `prisma migrate status` dentro do container conectou em `postgres.railway.internal:5432`: 2 migrations, schema em dia — o shell tem as variáveis do serviço e a rede privada, sem exposição pública do banco.
- Antes: `User` 0, `Site` 0, `SiteUser` 0.
- `node dist/cli/bootstrap-admin.js` com Site `FastCompre`, slug `fastcompre`, domínio `fastcompre.com`, locale padrão `pt-BR`; senha digitada só no prompt sem eco. Saída: `Administrador criado com sucesso.`, Role `OWNER`.
- Depois (consulta somente leitura): `User` 1, `Site` 1, `SiteUser` 1; slug `fastcompre`, domínio `fastcompre.com`, locale `pt-BR`, role `OWNER`, `active = true`, e-mail normalizado, hash Argon2. Sem duplicidade.
- O bootstrap não foi repetido em produção (o comportamento em conflito — falha por unicidade sem gravar nada — é coberto pelos testes e2e do comando).
- Validação por login no Admin (seção 5, item 5): concluída em 2026-11-21, após o deploy do Admin (ver bloco Admin abaixo).

**FastCompre (Vercel) — 2026-11-21**

- Projeto Vercel `fastcompre`, Root Directory `apps/fastcompre`, framework Next.js, Node.js 22.x.
- `ENABLE_EXPERIMENTAL_COREPACK=1` em Production; o build usou `pnpm 11.17.0`. Build de produção concluído com sucesso.
- Variáveis do FastCompre (seção 3) configuradas somente em Production; `REVALIDATION_SECRET` com o mesmo valor da API (valor não registrado).
- `https://fastcompre.com` conectado à Production: HTTP 200. `https://www.fastcompre.com`: `308 Permanent Redirect` para `https://fastcompre.com/`.
- Cloudflare: os dois A e os dois AAAA antigos da Hostinger no apex foram removidos; criado `CNAME @` para o target fornecido pela Vercel (`*.vercel-dns-017.com`), em DNS only — os IPv4 da Vercel retornados por `dig A fastcompre.com` vêm do CNAME flattening do Cloudflare, não de registros A na zona. `www` também é CNAME para a Vercel, em DNS only. Sem registro AAAA (a Vercel não suporta IPv6 para custom domains neste modelo).
- Após aplicar o Node.js 22.x, redeploy validado de novo: apex 200, `www` 308.
- Revalidação: de dentro do container da API no Railway (`railway ssh`), `POST https://fastcompre.com/api/internal/revalidate` com o `REVALIDATION_SECRET` do serviço e payload `{}` retornou `400 {"error":"INVALID_PAYLOAD"}` — prova de alcance e de secret compatível (secret divergente retornaria `401`), sem executar revalidação real.
- Git/Build: `Ignored Build Step = Automatic`; nenhuma política adicional de Preview criada nesta etapa (estratégia de Preview aprovada e validada em 2026-11-24, ver seção 3 e bloco Preview abaixo).
- Preview, X-Real-IP, healthcheck falho, rollback do Railway, rollback na Vercel, `prisma migrate resolve` e backup/restore (local, validação/MVP): validados depois (ver blocos abaixo).

**Admin (Vercel) — 2026-11-21**

- Projeto Vercel `admin`, Root Directory `apps/admin`, framework Next.js, Node.js 22.x.
- `ENABLE_EXPERIMENTAL_COREPACK=1` em Production; o build usou `pnpm 11.17.0`. `NEXT_PUBLIC_API_URL=https://api.fastcompre.com` somente em Production.
- Build de produção concluído; o `prebuild` compilou `@commerce-platform/contracts`, `@commerce-platform/ui` e `@commerce-platform/editorial`.
- `/login` carregou na URL provisória da Vercel; nenhuma tentativa de autenticação nesse host.
- Domínio `admin.fastcompre.com` configurado na Vercel; Cloudflare com `CNAME admin` para o target fornecido pela Vercel, em DNS only. `https://admin.fastcompre.com/login`: HTTP 200 pela Vercel.
- Login real com o administrador do bootstrap: redirecionou para `/fastcompre`; a sessão persistiu após reload.
- `GET https://api.fastcompre.com/admin/auth/me` com sessão válida observado em produção (em requisição condicional, `304 Not Modified`), com `Access-Control-Allow-Credentials: true` e `Access-Control-Allow-Origin: https://admin.fastcompre.com`.
- Dashboard reconheceu o Site FastCompre e exibiu ações compatíveis com OWNER.
- Logout funcionou; depois dele, o acesso direto a `/fastcompre` redirecionou para `/login`.
- Preview, X-Real-IP, healthcheck falho, rollback do Railway, rollback na Vercel, `prisma migrate resolve` e backup/restore (local, validação/MVP): validados depois (ver blocos abaixo).

**IP real do cliente / `CLIENT_IP_SOURCE` — 2026-11-23**

- Experimento em projeto Railway temporário e isolado (HTTP echo com a imagem oficial do Node), sem secrets, sem banco e sem conexão com `commerce-platform`; domínio `*.up.railway.app`. Valores falsos dos testes nas faixas reservadas para documentação. Nenhum IP público real registrado aqui.
- `socket`: o container observou `remoteAddress` na faixa interna `100.64.x.x`, variando entre requisições — peers da cadeia interna do Railway, não o endereço público do cliente.
- O Railway entregou um `X-Real-IP` controlado pela infraestrutura e distinto entre as duas redes testadas. Em ambas as redes, sobrescreveu todos os valores controlados pelo cliente: `X-Real-IP` IPv4 falso, lista falsa de IPs, `X-Real-IP` duplicado e IPv6 falso. Nenhum chegou como `X-Real-IP` efetivo à aplicação.
- `X-Forwarded-For` também foi observado reconstruído/sobrescrito no experimento; é só uma observação, não contrato do Railway, e o header não é usado como fonte de IP.
- Projeto temporário removido; o endpoint deixou de responder (`curl` → `000`).
- API: `CLIENT_IP_SOURCE` alterado de `socket` para `x-real-ip`; novo deployment saudável, `GET https://api.fastcompre.com/health` → 200 `{"status":"ok"}`.
- Anti-spoofing no rate limit real: 6 tentativas de login inválidas seguidas, cada uma com um `X-Real-IP` falso diferente → `401, 401, 401, 401, 401, 429`. Forjar o header não cria buckets independentes.
- Distinção de clientes: ainda na janela de bloqueio, uma tentativa a partir de uma segunda rede → `401` (bucket independente).

**Healthcheck falho e rollback da API (Railway) — 2026-11-23**

- Pré-condição: deployment saudável ativo; Healthcheck Path `/health`; `CLIENT_IP_SOURCE=x-real-ip`.
- Healthcheck falho: Healthcheck Path alterado temporariamente para uma rota inexistente. O novo deployment ficou em `Deploying` durante a janela do healthcheck e terminou `Failed`. Durante todo o teste, `GET https://api.fastcompre.com/health` → 200; o deployment saudável anterior continuou servindo tráfego e não foi substituído.
- Restauração: Healthcheck Path de volta para `/health`; novo deployment saudável `Active`; `/health` → 200; `CLIENT_IP_SOURCE` continuou `x-real-ip`.
- Rollback real para o deployment saudável anterior: o Railway criou um novo deployment e executou de novo o pipeline de build (etapas do Dockerfile majoritariamente em cache), exportando uma nova imagem — não houve reutilização direta da imagem anterior.
- Pre-deploy no rollback: `prisma migrate deploy` executado de novo, conectado ao PostgreSQL privado; `2 migrations found`; `No pending migrations to apply`. O rollback não desfaz migrations.
- Healthcheck no rollback: path `/health`, janela de 5 minutos, aprovado na primeira tentativa; deployment `Active`.
- Após o rollback, `CLIENT_IP_SOURCE` continuou `x-real-ip`.
- Smoke test pós-rollback: `/health` → 200; `https://fastcompre.com` → 200; login no Admin, Dashboard `/fastcompre`, logout e redirect de `/fastcompre` para `/login` sem sessão funcionaram.
- Implicações registradas na seção 8: healthcheck é gate de ativação, não monitoramento contínuo; sem evidência de fallback automático se o processo cair depois de `Active`; rollback da aplicação não reverte o banco, e migrations aplicadas antes de um healthcheck falho permanecem; expand/contract segue obrigatório; o rollback executa de novo pre-deploy e healthcheck e pode restaurar variáveis do deployment escolhido, então as variáveis críticas devem ser conferidas após cada rollback.

**Rollback na Vercel (FastCompre e Admin) — 2026-11-23**

Evidência de qual deployment serve o domínio: o ID `dpl_…` presente no HTML da página.

- FastCompre: com o deployment atual (D1) identificado e servindo produção, Instant Rollback para um deployment anterior `Ready` que já havia servido Production. Sem rebuild e sem deployment novo: a Vercel reatribuiu os domínios ao deployment existente. O `dpl_` do HTML mudou para o do deployment anterior. Smoke test no deployment antigo: `https://fastcompre.com` → 200; rota inexistente → 404; `/robots.txt` → 200; `/sitemap.xml` → 200; `https://www.fastcompre.com` → 308 para `https://fastcompre.com/`. Em seguida, Manage/Promote de volta ao D1: o `dpl_` voltou ao original e a produção terminou no estado inicial.
- Admin: com o D1 identificado e servindo produção, Instant Rollback para um deployment anterior `Ready` que já havia servido Production. O `dpl_` de `/login` mudou. No deployment antigo: `/login` carregou; login, Dashboard `/fastcompre`, navegação interna e logout funcionaram; acesso direto a `/fastcompre` sem sessão voltou para `/login`. Em seguida, Manage/Promote de volta ao D1: o `dpl_` voltou ao original e a produção terminou no estado inicial.
- Implicações (registradas na seção 8): Instant Rollback reatribui os domínios a um deployment de produção existente, sem rebuild; o deployment antigo usa o snapshot de variáveis do build dele, e mudanças de env posteriores não são aplicadas retroativamente; antes de cada rollback, validar a compatibilidade **do deployment escolhido** com a API atual, os contratos, os secrets, os hosts/domínios e a configuração de storage e revalidação (não é uma obrigação de compatibilidade da API com todo o histórico retido pela Vercel); após o rollback, a atribuição automática dos domínios de Production fica desligada até um Manage/Promote; FastCompre e Admin são tratados como projetos independentes.

**Recuperação de migration (`prisma migrate resolve`) — 2026-11-24**

- 2026-11-23 — Prisma v7.9.1. No container ativo da `api` (`railway ssh`), somente leitura: `prisma migrate status` → 2 migrations, `Database schema is up to date`; `_prisma_migrations` inspecionada em transação `READ ONLY` → as duas migrations com `finished_at` preenchido, `rolled_back_at` nulo e sem logs de erro; `prisma migrate resolve --help` confirmou `--applied` e `--rolled-back`.
- 2026-11-24 — Ensaio somente leitura do `ops-migrate` (seção 8.1, item 7), sem executar o passo de `resolve`: serviço criado no environment `production` com o Dockerfile da API, Start Command `sleep infinity`, sem domínio, healthcheck ou Pre-Deploy, e só `DATABASE_URL` (referência) + `RAILWAY_DOCKERFILE_PATH`. Ficou `Active`; o SSH abriu em `/app`; `RAILWAY_GIT_COMMIT_SHA` igual ao commit esperado do `main`; `prisma/migrations` presente com as 2 migrations; `migrate status` alcançou o PostgreSQL privado (`postgres.railway.internal:5432`) e a consulta `READ ONLY` passou.
- Nenhuma escrita foi executada no banco e nenhum `prisma migrate resolve` foi executado. Serviço `ops-migrate` removido (CLI: `Service 'ops-migrate' not found`).
- A `api` permaneceu no mesmo deployment, com o mesmo conjunto de variáveis (comparado por hash, sem expor valores), e `GET /health` → 200.

**Backup/restore do PostgreSQL (local, validação/MVP) — 2026-11-24**

- Dump `pg_dump -Fc` criado dentro do container `Postgres` de produção (PostgreSQL 18.6). SHA-256 da origem e do destino idênticos; `pg_restore --list` válido; arquivo temporário removido do `/tmp` do container.
- Criptografia GPG AES256 e descriptografia preservaram o mesmo SHA-256.
- Restore local em `postgres:18.6` (container temporário em `127.0.0.1`) passou. Impressão digital do restaurado idêntica à da produção: contagens, `_prisma_migrations`, colunas, enums, índices e constraints. `prisma migrate status` no restaurado: 2 migrations, schema up to date.
- Container de restore e dumps em claro removidos; ficaram só `.dump.gpg` e `.sha256`.
- Produção antes == produção depois; a `api` permaneceu no mesmo deployment e `GET /health` → 200. Nenhuma escrita deliberada no banco de produção durante o drill.
- Limitação registrada na seção 9.3: aceito somente para validação/MVP; antes de dados críticos ou go-live definitivo, backup externo automatizado ou PITR.

**Preview na Vercel (FastCompre e Admin) — 2026-11-24**

- Estado inicial dos dois projetos (`fastcompre` e `admin`): Production Branch = `main`; variáveis de Production somente em Production (no Admin, `NEXT_PUBLIC_API_URL` e `ENABLE_EXPERIMENTAL_COREPACK`); escopo Preview vazio; Deployment Protection = Vercel Authentication / Standard Protection; `Ignored Build Step = Automatic`.
- Variáveis de Preview da seção 3 cadastradas somente no escopo Preview; `REVALIDATION_SECRET` de Preview gerado exclusivamente para Preview (valor não registrado).
- Branch temporária `preview-drill` criada apontando para o mesmo commit do `main`. Com `Ignored Build Step = Automatic`, nenhum Preview surgiu automaticamente para o mesmo commit; os deployments de Preview foram criados manualmente na Vercel a partir da branch `preview-drill`.
- Admin Preview: `Ready`. Em janela anônima, a proteção da Vercel apareceu. `/login` carregou. A raiz mostrou o erro de carregamento esperado, porque `api-preview.invalid` não resolve. Nenhuma tentativa de login foi feita.
- FastCompre Preview: `Ready`. Em janela anônima, a proteção da Vercel apareceu. Home, rota inexistente (404), `/robots.txt` e `/sitemap.xml` funcionaram. Nenhum CTA de afiliado foi acionado.
- Produção: `AffiliateClick` permaneceu `0`; `GET https://api.fastcompre.com/health` → 200.
- Limpeza: branch `preview-drill` removida local e remotamente; deployments de Preview removidos da Vercel. Mantidas as variáveis de Preview e a Standard Protection (estratégia permanente nesta fase).

**DNS/proxy Cloudflare por registro — 2026-11-24**

Verificação externa, somente leitura (resolver `1.1.1.1`, headers HTTP e certificados TLS); nenhuma alteração de DNS. Zona `fastcompre.com` com nameservers do Cloudflare. Proxy determinado comparando os IPs resolvidos com as faixas IPv4 publicadas pelo Cloudflare (`cloudflare.com/ips-v4`): registro proxied resolve para IPs do Cloudflare e não expõe o destino do CNAME.

- `fastcompre.com`: IPv4 da Vercel (CNAME flattening do `CNAME @`), fora das faixas do Cloudflare; sem AAAA. `server: Vercel`, HTTP 200; certificado Let's Encrypt emitido para `fastcompre.com`. **DNS only → Vercel.**
- `www.fastcompre.com`: CNAME para o target da Vercel (o mesmo do apex), IPs fora das faixas do Cloudflare. `server: Vercel`, `308` para `https://fastcompre.com/`. **DNS only → Vercel.**
- `admin.fastcompre.com`: CNAME para o target da Vercel, IPs fora das faixas do Cloudflare. `server: Vercel`, `/login` → 200; certificado Let's Encrypt emitido para `admin.fastcompre.com`. **DNS only → Vercel.**
- `api.fastcompre.com`: CNAME para o domínio `*.up.railway.app` do serviço, IP fora das faixas do Cloudflare; TXT `_railway-verify.api` presente. `server: railway-hikari`, sem `cf-ray`, `/health` → 200; certificado Let's Encrypt emitido para `api.fastcompre.com`. **DNS only → Railway**: o Cloudflare não está no caminho, e o modelo de confiança do gate 9.1 (`X-Real-IP` controlado pelo edge do Railway) continua válido.
- `media.fastcompre.com`: IPv4 nas faixas do Cloudflare (IPv6 em `2606:4700::`), sem CNAME exposto. `server: cloudflare`, com `cf-ray` (a raiz, sem objeto, responde 404); certificado emitido pelo Cloudflare. **Servido pelo Cloudflare (proxied)** como domínio customizado do bucket R2, no fluxo validado em 2026-11-21.
- Estado aprovado registrado na seção 1. Habilitar o proxy na `api` é mudança de topologia e exige refazer o gate 9.1.

**Logs da API em produção (smoke test da seção 6, item 6) — 2026-11-24**

Probes não destrutivos em `https://api.fastcompre.com`, com valores falsos e um marcador único; logs lidos pelo Railway CLI (logs da aplicação e logs HTTP). Nenhuma alteração de código, configuração ou variáveis.

- Probes: `GET /health` com query string, `Cookie` de sessão, `Authorization: Bearer`, `X-Real-IP`, `X-Forwarded-For`, `Referer` e `X-Revalidation-Secret` falsos → 200; rota inexistente com query string → 404; `POST /admin/auth/login` com e-mail inexistente e senha falsa → 401; `POST /admin/auth/login` com JSON malformado → 400; `GET /admin/auth/me` com cookie de sessão falso → 401.
- Logs estruturados da aplicação (Pino, linha `request completed`): campos `req.id`, `req.method`, `req.url` (só o pathname), `req.params`, headers de requisição `host`, `user-agent`, `content-type` e `content-length`; `res.statusCode` e headers de resposta `content-type`, `content-length` e `x-request-id`; `responseTime` e metadados. **Não** apareceram: `Authorization`, cookie/valor de sessão, secret, `Referer`, body (e-mail/senha), query string, IP de cliente (`remoteAddress`, `X-Real-IP`, `X-Forwarded-For`) nem headers completos. Nenhum stack trace nos logs coletados (não houve 500).
- Logs HTTP de borda da Railway (plataforma): campos `method`, `path`, `httpStatus`, `host`, `clientUa`, `srcIp`, `edgeRegion`, `requestId`, bytes, durações, `upstreamAddress` (endereço interno) e `deploymentId`. Incluem o `srcIp` do cliente (comportamento da plataforma, não falha da aplicação). Não mostraram query string, cookies, `Authorization` nem body.
- Observação não bloqueante (observabilidade): a requisição com JSON malformado aparece no log de borda (400), mas não gera linha `request completed` no log da aplicação. Nenhum dado do body apareceu em nenhum dos dois logs.
- Cópias locais dos logs usadas na análise removidas após a verificação.

## 10. Referências

- `docs/Architecture.md` — §15 (autenticação: cookies, rate limit, logs e bootstrap do primeiro administrador), §27 (migrations em produção), §29 (uploads), §30 (tracking e IP de cliente).
- `apps/api/Dockerfile` — imagem de runtime (Prisma CLI, migrations, bootstrap compilado, OpenSSL).
- `apps/api/.env.example`, `apps/fastcompre/.env.example` — descrição das variáveis.
- Documentação oficial: Railway (healthchecks, pre-deploy command, PostgreSQL, domínios), Vercel (monorepos, environment variables, domains), Cloudflare R2 (public buckets, S3 API, tokens), Prisma (development and production, patching and hotfixing).
