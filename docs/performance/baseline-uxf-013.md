# UXF-013 — Baseline de performance do FastCompre (estado atual)

Gerado em: 2026-08-19T18:31:08.054Z
Status geral: **ok**

Lighthouse 13.4.1 · mobile · 5 runs/rota (mediana individual por métrica) · navigation mode

## `/`

| Métrica | Mediana (5 runs) |
|---|---|
| LCP | 2167.1557000000003 ms |
| CLS | 0 unitless |
| TBT | 40 ms |
| TTFB | 6 ms |
| INP (campo) | not requested |

## `/[categorySlug]`

| Métrica | Mediana (5 runs) |
|---|---|
| LCP | 2093.5713 ms |
| CLS | 0 unitless |
| TBT | 79.00000000000023 ms |
| TTFB | 6 ms |
| INP (campo) | not requested |

## `/[categorySlug]/[articleSlug]`

| Métrica | Mediana (5 runs) |
|---|---|
| LCP | 2095.6455 ms |
| CLS | 0 unitless |
| TBT | 78 ms |
| TTFB | 10 ms |
| INP (campo) | not requested |

## Metadados de reprodução (UXQ-007 deve usar a mesma configuração)

```json
{
  "lighthouseVersion": "13.4.1",
  "chromeUserAgent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/151.0.0.0 Safari/537.36",
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
  "executedAt": "2026-08-19T18:31:08.054Z"
}
```
