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
- Status de proxy/DNS-only de cada registro (`api`, `admin`, apex, `www`) é decidido **por serviço** na configuração real **[VALIDAR]**. O `media.fastcompre.com` é o domínio customizado do R2 e exige a zona `fastcompre.com` na mesma conta Cloudflare do bucket.

## 2. Recursos necessários

Descritos por capacidade, não por plano comercial — confirmar na configuração real que o plano contratado de cada provedor oferece o recurso. Cloudflare: recursos confirmados em 2026-11-21 (ver 9.5). Railway: Dockerfile com path customizado, Pre-Deploy Command com timeout, healthcheck, auto-deploy desativável, PostgreSQL privado e domínio customizado com TLS e acesso de shell ao container (`railway ssh`) confirmados em 2026-11-21 (ver 9.5); backups agendados **não** estão disponíveis no plano atual (exigem Pro) **[VALIDAR]**; healthcheck como gate de ativação e rollback de deployment confirmados em 2026-11-23 (ver 9.5). Vercel: Root Directory em monorepo pnpm, variáveis restritas a Production e domínio customizado com TLS confirmados para o FastCompre e para o Admin em 2026-11-21 (ver 9.5); rollback e Preview pendentes **[VALIDAR]**.

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

Secrets de Production **nunca** são reutilizados em Preview (em especial `REVALIDATION_SECRET`). Se previews serão desativados, terão configuração própria ou serão protegidos é decisão da configuração real **[VALIDAR]**. Builds de Preview rodam com `NODE_ENV=production`: sem variáveis próprias, o build do FastCompre falha por design.

## 4. Primeiro deploy

Pré-condições: CI verde no commit a publicar; acesso administrativo aos três provedores; zona `fastcompre.com` ativa no Cloudflare (concluído em 2026-11-21).

1. **R2** — concluído em 2026-11-21 (evidências em 9.5)
   1. Criar o bucket (`fastcompre-media`).
   2. Conectar o domínio customizado `media.fastcompre.com` ao bucket. O acesso público por `r2.dev` permanece desabilitado.
   3. Criar token com leitura/escrita de objetos **restrito ao bucket**; guardar access key e secret no gerenciador de secrets.
   4. Anotar o endpoint S3 da conta (`https://<ACCOUNT_ID>.r2.cloudflarestorage.com`).
2. **PostgreSQL (Railway)**
   1. Criar o serviço PostgreSQL **sem** acesso público.
   2. Configurar backups agendados. Em 2026-11-21, backups automáticos/PITR exigiam plano Pro na UI do Railway; nenhum upgrade foi feito e o banco está **sem backup agendado**. Decisão de plano e retenção pendente **[VALIDAR]**.
3. **API (Railway)**
   1. Criar o serviço como **Empty Service** e conectar o repositório (branch `main`) antes do primeiro deploy. Root Directory **vazio** (build context na raiz), Builder `Dockerfile`, variável `RAILWAY_DOCKERFILE_PATH=apps/api/Dockerfile` (relativa, sem barra inicial) e Start Command vazio (vale o `CMD` da imagem). Confirmado no build log: `load build definition from apps/api/Dockerfile`.
   2. Desativar auto-deploy (deploy manual).
   3. Pre-Deploy Command: `node_modules/.bin/prisma migrate deploy` (diretório de trabalho da imagem: `/app`).
   4. **Pre-Deploy Timeout**: configurar deliberadamente — o Railway não impõe limite por padrão, e `prisma migrate deploy` não deve poder ficar preso indefinidamente. Valor definido: **300 s**.
   5. Healthcheck path: `/health`; Healthcheck Timeout: **300 s**.
   6. Réplicas: 1 (o rate limit é em memória por processo).
   7. Variáveis da seção 3 (API). `CLIENT_IP_SOURCE=socket` (ou ausente) no primeiro deploy; `x-real-ip` só depois do gate da seção 9.1.
   8. Domínio customizado `api.fastcompre.com`: no Cloudflare, CNAME `api` para o target fornecido pelo Railway e TXT `_railway-verify.api`; TLS automático. **Target port do domínio = porta em que o Railway detectou a aplicação** (8080 em 2026-11-21; a API escuta em `PORT`). Target port errado resulta em `502 Application failed to respond`. Hoje o CNAME está **DNS only**; ativar o proxy do Cloudflare é decisão pendente (exige SSL/TLS **Full**, e afeta o gate 9.1) **[VALIDAR]**.
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
6. Logs da API no Railway: requisições mostram método, path, status e request ID; **não** mostram cookie, headers de autenticação, IP de cliente nem query string.

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
| **Frontend novo incompatível** | Rollback na Vercel para o deployment anterior do projeto afetado. Se a incompatibilidade for com a API, avaliar primeiro o rollback da API (limitado pela migration aplicada). |
| **Bootstrap falha** | Nada é criado (transação única). Corrigir e repetir. |
| **Dados/schema comprometidos** | Restaurar backup do PostgreSQL é último recurso, implica perda de dados desde o backup e exige decisão do Product Owner. Não existe down migration automática. |

### 8.1 Migration falhou

1. O deploy é interrompido; a nova versão da API **não** entra no ar.
2. **Não presumir rollback automático** do que a migration fez. Algumas migrations do projeto são explicitamente transacionais, mas isso não é garantia para migrations futuras nem para todo tipo de DDL.
3. Inspecionar, antes de qualquer ação:
   - a tabela `_prisma_migrations` (migration marcada como falha, coluna `logs` com o erro);
   - o estado real do schema e dos dados afetados.
4. Enquanto a falha não for resolvida, novos `prisma migrate deploy` ficam bloqueados.
5. Decidir conforme o estado real encontrado:
   - nada foi aplicado → `prisma migrate resolve --rolled-back "<migration>"`, corrigir a migration em novo commit e refazer o deploy;
   - os passos foram concluídos manualmente e o schema está correto → `prisma migrate resolve --applied "<migration>"`;
   - aplicação parcial → migration corretiva planejada (nunca editar uma migration já aplicada em produção).
6. A execução de `prisma migrate resolve` precisa ocorrer dentro do ambiente da API (o CLI está na imagem; o banco é privado). Mecanismo e procedimento exatos **[VALIDAR na configuração real e registrar aqui]**.

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

Procedimento da seção 8.1, item 6 — validar o mecanismo de execução de `prisma migrate resolve` no ambiente real **[VALIDAR]**.

### 9.3 Backup e restore do PostgreSQL

Confirmar agendamento e retenção dos backups e executar um restore de teste antes do go-live **[VALIDAR]**.

### 9.4 Comportamentos de provedor pendentes

- Comportamento do deployment anterior quando o novo falha no healthcheck: validado em 2026-11-23 (ver 9.5).
- Procedimento de rollback de deployment no Railway: validado em 2026-11-23 (ver 9.5).
- Procedimento de rollback de deployment na Vercel **[VALIDAR]**.
- Pre-Deploy Timeout e timeout de healthcheck: definidos em 2026-11-21 (300 s cada; ver 9.5).
- Status de proxy/DNS-only por registro DNS **[VALIDAR]**.
- Estratégia de Preview na Vercel **[VALIDAR]**.

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
- Git/Build: `Ignored Build Step = Automatic`; nenhuma política adicional de Preview criada. Comportamento atual mantido por enquanto (Preview segue **[VALIDAR]**, ver seção 3 e 9.4).
- Ainda **não** validados: rollback na Vercel, Preview e os gates pendentes do Railway (backup/restore, `prisma migrate resolve`); X-Real-IP, healthcheck falho e rollback do Railway validados depois (ver blocos abaixo).

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
- Ainda **não** validados: Preview, rollback na Vercel e os gates pendentes do Railway (backup/restore, `prisma migrate resolve`); X-Real-IP, healthcheck falho e rollback do Railway validados depois (ver blocos abaixo).

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

## 10. Referências

- `docs/Architecture.md` — §15 (autenticação: cookies, rate limit, logs e bootstrap do primeiro administrador), §27 (migrations em produção), §29 (uploads), §30 (tracking e IP de cliente).
- `apps/api/Dockerfile` — imagem de runtime (Prisma CLI, migrations, bootstrap compilado, OpenSSL).
- `apps/api/.env.example`, `apps/fastcompre/.env.example` — descrição das variáveis.
- Documentação oficial: Railway (healthchecks, pre-deploy command, PostgreSQL, domínios), Vercel (monorepos, environment variables, domains), Cloudflare R2 (public buckets, S3 API, tokens), Prisma (development and production, patching and hotfixing).
