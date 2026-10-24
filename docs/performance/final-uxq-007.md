# UXQ-007 — Medição final de performance do FastCompre

Gerado em: 2026-10-18T15:25:24.908Z
Status geral: **ok**

> **Nota sobre "Status geral: ok":** este campo reflete exclusivamente o resultado técnico do instrumento de medição — 5/5 execuções Lighthouse bem-sucedidas por rota, dentro da política de retry prevista (ver `retryPolicy` nos metadados abaixo). Ele **não** representa aprovação do budget de performance da UXF-014. A avaliação de budget está na seção "Resultado frente ao budget (UXF-014)" mais abaixo.

Lighthouse 13.4.1 · mobile · 5 runs/rota (mediana individual por métrica) · navigation mode

## `/`

| Métrica | Mediana (5 runs) | Budget efetivo (UXF-014) | Resultado |
|---|---|---|---|
| LCP | 2738.7721 ms | ≤ 2384 ms (Camada B — teto de regressão da rota) | **FAIL** |
| CLS | 0 unitless | ≤ 0.10 (Camada A) | PASS |
| TBT | 48.5 ms | sem budget normativo nesta tarefa | diagnóstico |
| TTFB | 14 ms | ≤ 800 ms (Camada A) | PASS |
| INP (campo) | not requested | ≤ 200 ms (Camada A) | UNKNOWN (sem dado de campo) |

## `/[categorySlug]`

| Métrica | Mediana (5 runs) | Budget efetivo (UXF-014) | Resultado |
|---|---|---|---|
| LCP | 2690.2014 ms | ≤ 2303 ms (Camada B — teto de regressão da rota) | **FAIL** |
| CLS | 0 unitless | ≤ 0.10 (Camada A) | PASS |
| TBT | 50 ms | sem budget normativo nesta tarefa | diagnóstico |
| TTFB | 10 ms | ≤ 800 ms (Camada A) | PASS |
| INP (campo) | not requested | ≤ 200 ms (Camada A) | UNKNOWN (sem dado de campo) |

## `/[categorySlug]/[articleSlug]`

| Métrica | Mediana (5 runs) | Budget efetivo (UXF-014) | Resultado |
|---|---|---|---|
| LCP | 2714.5606 ms | ≤ 2305 ms (Camada B — teto de regressão da rota) | **FAIL** |
| CLS | 0 unitless | ≤ 0.10 (Camada A) | PASS |
| TBT | 50.5 ms | sem budget normativo nesta tarefa | diagnóstico |
| TTFB | 15 ms | ≤ 800 ms (Camada A) | PASS |
| INP (campo) | not requested | ≤ 200 ms (Camada A) | UNKNOWN (sem dado de campo) |

## Resultado frente ao budget (UXF-014)

| Rota | LCP medido | Teto efetivo de LCP | LCP | CLS | TTFB | INP | TBT |
|---|---|---|---|---|---|---|---|
| Home (`/`) | 2738.7721 ms | 2384 ms (Camada B) | **FAIL** | PASS | PASS | UNKNOWN | diagnóstico |
| Categoria (`/[categorySlug]`) | 2690.2014 ms | 2303 ms (Camada B) | **FAIL** | PASS | PASS | UNKNOWN | diagnóstico |
| Artigo (`/[categorySlug]/[articleSlug]`) | 2714.5606 ms | 2305 ms (Camada B) | **FAIL** | PASS | PASS | UNKNOWN | diagnóstico |

O critério efetivo de LCP por página (UXF-014, Seção 4) exige respeitar simultaneamente a Camada A (≤ 2500 ms, absoluto) e a Camada B (teto de regressão específico da rota, listado acima). Nas três rotas o teto vigente é o da Camada B, por ser mais restritivo que os 2500 ms da Camada A nesta medição.

### Resultado global da UXQ-007

- **Medição concluída**: instrumento executado com sucesso (status técnico "ok"), metodologia idêntica à da UXF-013, contra `next build` + `next start` verificados.
- **Budget da UXF-014 não atendido em nenhuma das três rotas monitoradas** — Home, Categoria e Artigo estão todas em **FAIL** de LCP frente ao teto efetivo (Camada B) de cada rota.
- CLS e TTFB estão dentro do budget absoluto (Camada A) nas três rotas.
- INP permanece **UNKNOWN** (medição executada sem `--public-origin`/dado de campo CrUX) — por definição da UXF-014 (Seção 7/8), um `UNKNOWN` de INP é um gate pendente e nunca deve ser lido como `PASS`.
- TBT é apenas diagnóstico nesta tarefa, sem critério de aprovação próprio.
- **A UXQ-008 passa a ser aplicável**, conforme seu pré-requisito no backlog: "corrigir qualquer página que não atinja o budget definido em UXF-014, identificada em UXQ-007".

## UXQ-008 — Encerramento (desvio de performance aceito pelo PO)

Registrado em: 2026-10-24

**Status: ENCERRADA — desvio conhecido e documentado, sem budget atingido.** Esta seção não substitui nem revisa a medição normativa acima; registra o resultado da investigação de causa e a decisão do PO que encerra a tarefa.

### Resultado

- Home, Categoria e Artigo **continuam acima do budget de LCP** (Camada B) nas 5/5 execuções por rota já registradas na medição normativa acima — 15/15 runs da UXQ-007 acima do budget.
- **Nenhuma correção pequena, segura e empiricamente sustentada, capaz de recuperar o déficit de ~350–410 ms, foi identificada** dentro do escopo de ajuste de baixo risco desta tarefa.
- **O budget da UXF-014 permanece INALTERADO.** Não houve, em nenhum momento desta tarefa, relaxamento, reinterpretação ou revisão do budget.

### Candidatos investigados e/ou testados (evidência já coletada, não repetida aqui em detalhe)

| Candidato | Resultado |
|---|---|
| Imagens | Não são o elemento LCP em nenhuma das 3 rotas (confirmado via `lcp-discovery-insight` vazio nas capturas de produção) |
| Webfonts | Download concluído em <250 ms em todas as capturas; sem evidência de causa dominante |
| `experimental.inlineCss` | Testado empiricamente — regressão uniforme de ~153–161 ms nas 3 rotas; rejeitado |
| CSS render-blocking → não bloqueante (experimento A/B via proxy local) | Redução observada porém insuficiente (Home ~−68 ms, Categoria ~−38 ms, Artigo ~−17 ms); **0/15 runs PASS**; regressão de CLS em Home/Categoria; descartado como solução |
| JS/hidratação | Long task de hidratação ocorre >1 s depois do LCP observado em todas as 5 capturas de produção; sem evidência temporal de bloqueio do paint real |
| Utilities CSS mortas (inspeção do CSS compilado) | Apenas `.animate-spin` (~45 bytes não comprimidos) sem consumidor real; impacto não mensurável frente ao déficit — alteração revertida, não mantida |

### Decisão do PO

O PO optou formalmente por **aceitar o FAIL de LCP como desvio conhecido e documentado**, permitindo o fechamento do MVP neste momento, sem alterar o budget e sem abrir uma intervenção arquitetural maior nesta tarefa. Esta decisão:

- **NÃO significa que o budget foi atendido** — é uma exceção explícita do PO, não um PASS técnico.
- Não altera o budget da UXF-014.
- Não implementa nenhuma correção adicional além das já testadas e descartadas/revertidas acima.
- Deixa qualquer eventual intervenção arquitetural maior (ex.: divisão do CSS global por rota, revisão da composição do shell compartilhado, infraestrutura de entrega) para trabalho futuro separado, fora desta tarefa.

### Consequência para a UXQ-009

- **O budget da UXF-014 continua não atendido** para Home, Categoria e Artigo (ver "Resultado frente ao budget (UXF-014)" acima) — esta seção não altera esse fato.
- **O critério técnico original de performance da UXQ-009** ("budget cumprido e documentado") **não poderá ser satisfeito literalmente** com base nesta medição.
- O PO aprovou uma **exceção/waiver formal** para permitir o fechamento do MVP, registrada nesta seção — não uma revisão do critério original.
- A UXQ-009, quando executada, **deve registrar o gate como fechado por exceção explícita do PO**, nunca como "budget PASS" — a redação do fechamento da UXQ-009 deve deixar isso inequívoco.
- Esta exceção **não reclassifica os resultados de LCP como aprovados** e **não altera retroativamente a UXF-014** nem a medição normativa da UXQ-007 acima.

## Metadados de reprodução (UXQ-007 deve usar a mesma configuração)

```json
{
  "lighthouseVersion": "13.4.1",
  "chromeUserAgent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/155.0.0.0 Safari/537.36",
  "formFactor": "mobile",
  "throttlingMethod": "simulate",
  "throttling": {
    "rttMs": 150,
    "throughputKbps": 1638.4,
    "requestLatencyMs": 562.5,
    "downloadThroughputKbps": 1474.5600000000002,
    "uploadThroughputKbps": 675,
    "cpuSlowdownMultiplier": 4
  },
  "navigationMode": true,
  "runsPerRoute": 5,
  "retryPolicy": "1 retry por slot (máx. 2 tentativas); falha do slot após retry => rota insufficient-data",
  "aggregation": "median-per-metric (nunca median-run)",
  "disableStorageReset": false,
  "baseUrl": "http://localhost:3002",
  "categorySlug": "eletronicos-para-viagem",
  "articleSlug": "carregador-usb-c-65w-gan-vale-a-pena",
  "cruxRequested": false,
  "cruxFormFactor": null,
  "publicOriginForCrux": null,
  "executionMachine": {
    "platform": "win32",
    "arch": "x64",
    "cpuModel": "Intel(R) Core(TM) i5-9400F CPU @ 2.90GHz",
    "totalMemGb": 15.92,
    "nodeVersion": "v22.20.0"
  },
  "executedAt": "2026-10-18T15:25:24.908Z"
}
```
