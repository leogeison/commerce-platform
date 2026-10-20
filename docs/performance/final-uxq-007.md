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
