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

Descritos por capacidade, não por plano comercial — confirmar na configuração real que o plano contratado de cada provedor oferece o recurso. Cloudflare: recursos confirmados em 2026-11-21 (ver 9.5). Railway: Dockerfile com path customizado, Pre-Deploy Command com timeout, healthcheck, auto-deploy desativável, PostgreSQL privado e domínio customizado com TLS confirmados em 2026-11-21 (ver 9.5); backups agendados **não** estão disponíveis no plano atual (exigem Pro), e rollback e shell seguem pendentes **[VALIDAR]**. Vercel **[VALIDAR]**.

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
| `CLIENT_IP_SOURCE` | opc. | Origem do IP do rate limit (`socket` \| `x-real-ip`) | – | `socket` até o gate da seção 9.1 passar |
| `PORT` | – | Porta HTTP | – | Injetada pelo Railway |

`NODE_ENV=production` já é definido pela imagem (`apps/api/Dockerfile`).

### Admin (Vercel, build-time)

| Variável | Obrig. | Finalidade | Secret | Origem do valor |
|---|:-:|---|:-:|---|
| `NEXT_PUBLIC_API_URL` | ✔ | Base da API usada pelo navegador | – (embutida no bundle) | `https://api.fastcompre.com` (só a origem) |

Por ser `NEXT_PUBLIC_*`, o valor é embutido no build: qualquer mudança exige novo deploy do Admin.

### FastCompre (Vercel, build-time **e** runtime)

| Variável | Obrig. | Finalidade | Secret | Origem do valor |
|---|:-:|---|:-:|---|
| `SITE_SLUG` | ✔ | Site servido por este deployment | – | O mesmo `--site-slug` do bootstrap (`fastcompre`) |
| `API_URL` | ✔ | Chamadas server-side à API pública | – | `https://api.fastcompre.com` |
| `SITE_URL` | ✔ | URL canônica, `sitemap.xml`, `robots.txt` | – | `https://fastcompre.com` |
| `AFFILIATE_REDIRECT_URL` | ✔ | Origem dos links `/r/{siteSlug}/{offerId}` | – | `https://api.fastcompre.com` (o redirect é servido pela API) |
| `REVALIDATION_SECRET` | ✔ | Valida chamadas de revalidação | ✔ | O mesmo valor da API |
| `STORAGE_PUBLIC_URL_BASE` | ✔ | `images.remotePatterns` do `next/image` (build falha sem ela em produção) | – | `https://media.fastcompre.com` |

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
   7. Variáveis da seção 3 (API). `CLIENT_IP_SOURCE=socket` (ou ausente).
   8. Domínio customizado `api.fastcompre.com`: no Cloudflare, CNAME `api` para o target fornecido pelo Railway e TXT `_railway-verify.api`; TLS automático. **Target port do domínio = porta em que o Railway detectou a aplicação** (8080 em 2026-11-21; a API escuta em `PORT`). Target port errado resulta em `502 Application failed to respond`. Hoje o CNAME está **DNS only**; ativar o proxy do Cloudflare é decisão pendente (exige SSL/TLS **Full**, e afeta o gate 9.1) **[VALIDAR]**.
4. **Deploy da API** — disparar manualmente o deploy do commit validado. Esperado: build → pre-deploy aplica as migrations → healthcheck 2xx → deployment ativo. Conferir `GET https://api.fastcompre.com/health` → `{"status":"ok"}`. Primeiro deploy executado em 2026-11-21 (ver 9.5).
5. **Bootstrap** — seção 5.
6. **FastCompre (Vercel)**
   1. Projeto com Root Directory `apps/fastcompre` (monorepo pnpm).
   2. Variáveis da seção 3 no ambiente **Production**.
   3. Domínios: `fastcompre.com` (canônico) e `www.fastcompre.com` redirecionando para o apex.
   4. Deploy. Conferir Home (estado vazio), uma rota inexistente (404), `/robots.txt` e `/sitemap.xml`.
7. **Admin (Vercel)**
   1. Projeto com Root Directory `apps/admin`.
   2. `NEXT_PUBLIC_API_URL` no ambiente Production.
   3. Domínio `admin.fastcompre.com`.
   4. Deploy.
8. **Smoke test** — seção 6.
9. **Gates operacionais** — seção 9.

## 5. Bootstrap do primeiro administrador

One-off, executado **dentro do ambiente da API** (onde a rede privada e as variáveis do serviço já existem). Nunca por endpoint HTTP e nunca a partir de máquina local com o banco exposto.

1. Abrir shell no container do serviço API (acesso de shell do Railway) **[VALIDAR mecanismo e alocação de terminal interativo no primeiro uso]**.
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
| **Nova API não passa no healthcheck** | O deployment novo não recebe tráfego e é marcado como falho. Ler os logs da API. Lembrar que a migration desse deploy **já foi aplicada** no pre-deploy. Comportamento exato do deployment anterior nesse cenário **[VALIDAR]**. |
| **API ativa com problema funcional** | Rollback no Railway para o último deployment bem-sucedido **[VALIDAR procedimento]**. O rollback troca a imagem, **não reverte migrations já aplicadas** — por isso a regra expand/contract da seção 7 é obrigatória. |
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

Estado inicial: `CLIENT_IP_SOURCE=socket` — atrás do proxy do Railway, o rate limit (login 5/60s, redirect de afiliado 30/60s) funciona de forma **global**, não por visitante. Aceito até este gate passar.

Só mudar para `x-real-ip` depois de provar, na cadeia real (Railway e, se houver, Cloudflare na frente de `api.fastcompre.com`), as duas propriedades abaixo. Executar com `CLIENT_IP_SOURCE=x-real-ip` aplicado em janela controlada, antes de tráfego real, usando somente `POST /admin/auth/login` com e-mail inexistente (não usar `/r/...`, que gera `AffiliateClick`). Nenhum IP é registrado em log para isso (PROD-003); as provas são comportamentais.

1. **Anti-spoofing** — de um mesmo cliente, enviar 6 tentativas de login seguidas, cada uma com um `X-Real-IP` falso diferente. Esperado: a 6ª recebe **429**. Se não receber, o header pode ser forjado → voltar imediatamente para `socket`.
2. **Distinção de clientes reais** — esgotar o limite a partir do cliente A (rede 1) até receber 429; em seguida, dentro da mesma janela de 60s, tentar o login a partir do cliente B em outra rede real (ex.: rede móvel). Esperado: B **não** recebe 429. Se receber, o valor não representa o visitante (ex.: representa um proxy intermediário) → voltar para `socket`.

Resultado e configuração final da cadeia **[VALIDAR e registrar aqui]**.

### 9.2 Recuperação de migration falha

Procedimento da seção 8.1, item 6 — validar o mecanismo de execução de `prisma migrate resolve` no ambiente real **[VALIDAR]**.

### 9.3 Backup e restore do PostgreSQL

Confirmar agendamento e retenção dos backups e executar um restore de teste antes do go-live **[VALIDAR]**.

### 9.4 Comportamentos de provedor pendentes

- Comportamento do deployment anterior quando o novo falha no healthcheck **[VALIDAR]**.
- Procedimento de rollback de deployment no Railway e na Vercel **[VALIDAR]**.
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

## 10. Referências

- `docs/Architecture.md` — §15 (autenticação: cookies, rate limit, logs e bootstrap do primeiro administrador), §27 (migrations em produção), §29 (uploads), §30 (tracking e IP de cliente).
- `apps/api/Dockerfile` — imagem de runtime (Prisma CLI, migrations, bootstrap compilado, OpenSSL).
- `apps/api/.env.example`, `apps/fastcompre/.env.example` — descrição das variáveis.
- Documentação oficial: Railway (healthchecks, pre-deploy command, PostgreSQL, domínios), Vercel (monorepos, environment variables, domains), Cloudflare R2 (public buckets, S3 API, tokens), Prisma (development and production, patching and hotfixing).
