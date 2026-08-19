# UXF-014 — Performance Budget do FastCompre

> Documento normativo. Fixa os targets de performance para Home, Categoria e
> Artigo do FastCompre, a partir da baseline reproduzível da UXF-013. Não
> contém nenhuma implementação — é insumo para UXW-007 a UXW-016 e UXQ-007.

## 1. Proveniência

- Baseline de referência: `docs/performance/baseline-uxf-013.json`
  (commit `5db0298`), executada em `2026-08-19T18:31:08.054Z`.
- Metodologia: Lighthouse 13.4.1, preset mobile, navigation mode, 5
  execuções sequenciais por rota, mediana individual por métrica (nunca
  `median-run`) — ver `metadata` do JSON da UXF-013 para configuração
  efetiva completa (throttling, form factor, `disableStorageReset`).
- UXQ-007 deve reexecutar a **mesma metodologia** (mesma versão do
  Lighthouse, mesmo preset, mesmo número de runs, mesma agregação) contra
  este mesmo documento — não contra a UXF-013 diretamente.

## 2. Aviso obrigatório — lab vs. field

Os targets de LCP, CLS e INP abaixo são coerentes com os thresholds "good"
oficiais do Google, que são definidos sobre **p75 de dados de campo reais**
(CrUX/RUM). A baseline e o guardrail de regressão deste documento usam
**mediana de execuções de laboratório (Lighthouse)**, uma metodologia
diferente. Nenhuma execução de laboratório — inclusive uma que respeite
integralmente o guardrail da Camada B — certifica conformidade oficial com
os Core Web Vitals do Google. Certificação real de Core Web Vitals depende
de dado de campo (p75), não do laboratório.

## 3. Camada A — Targets absolutos (Home, Categoria e Artigo)

| Métrica | Target | Natureza |
|---|---|---|
| LCP | ≤ 2500 ms | Core Web Vital oficial (threshold "good" do Google, p75 campo) |
| CLS | ≤ 0.10 | Core Web Vital oficial (threshold "good" do Google, p75 campo) |
| INP | ≤ 200 ms | Core Web Vital oficial (threshold "good" do Google, p75 campo) |
| TTFB | ≤ 800 ms | Métrica diagnóstica — **não é** um Core Web Vital oficial; target absoluto de engenharia do FastCompre |

Os quatro targets valem igualmente para os três tipos de página.

## 4. Camada B — Guardrail de regressão laboratorial (somente LCP)

Aplica-se exclusivamente a LCP, frente à mediana versionada da mesma rota
na baseline da UXF-013. Fórmula e valor de origem preservados para a regra
continuar auditável (arredondamento ao inteiro mais próximo, não
sistematicamente para cima):

| Página | Rota | Baseline (mediana, UXF-013) | Cálculo (× 1.10) | Teto de regressão |
|---|---|---|---|---|
| Home | `/` | 2167.1557 ms | 2167.1557 × 1.10 = 2383.87127 | **2384 ms** |
| Categoria | `/[categorySlug]` | 2093.5713 ms | 2093.5713 × 1.10 = 2302.92843 | **2303 ms** |
| Artigo | `/[categorySlug]/[articleSlug]` | 2095.6455 ms | 2095.6455 × 1.10 = 2305.21005 | **2305 ms** |

**O `10%` é uma decisão de engenharia do FastCompre para limitar regressão
sobre a baseline reproduzível — não é um threshold oficial do Google.**

**Critério efetivo de LCP por página = respeitar AMBOS os tetos**, ou seja:

```
efetivo(página) = min(2500 ms, teto de regressão da página)
```

Na prática, hoje: Home 2384 ms, Categoria 2303 ms, Artigo 2305 ms — o teto
de regressão é o mais restritivo dos dois nas três páginas.

## 5. CLS

- Target absoluto: ≤ 0.10 (Camada A).
- Baseline atual (UXF-013): CLS = 0 nas três rotas.
- Não há guardrail percentual de regressão para CLS (só para LCP).
- Interpretação explícita: qualquer `0 < CLS ≤ 0.10` é uma regressão frente
  ao estado atual, mas **aceitável pelo budget**. `CLS > 0.10` é
  inaceitável.

## 6. INP

- Target normativo: ≤ 200 ms, de campo/p75 — vale para os três tipos de
  página.
- **Não verificável em laboratório.** A baseline da UXF-013 não tem
  nenhum valor de INP (execução real feita sem `--public-origin`/
  `CRUX_API_KEY`).
- Estados possíveis, sem ambiguidade:
  - `PASS` = p75 de campo disponível e ≤ 200 ms.
  - `FAIL` = p75 de campo disponível e > 200 ms.
  - `UNKNOWN` = dado de campo insuficiente para calcular p75.
- Enquanto não houver dado de campo suficiente, o estado de INP para
  qualquer página é `UNKNOWN` — nunca `PASS`, nunca `FAIL`, e nunca
  substituído por TBT ou qualquer proxy de laboratório.

## 7. TTFB

- Target absoluto: ≤ 800 ms, para os três tipos de página.
- Sem guardrail percentual de regressão.
- **Os 6–10 ms medidos na UXF-013 não podem ser usados como teto de
  produção nem como base de calibração percentual** — foram medidos contra
  `http://localhost:3002`, não uma topologia de rede de produção real.

## 8. TBT — referência diagnóstica, não é um budget normativo

| Página | TBT (mediana, UXF-013) |
|---|---|
| Home | 40 ms |
| Categoria | 79 ms |
| Artigo | 78 ms |

Preservado aqui só como referência de laboratório. TBT **não é** um dos
quatro budgets normativos desta tarefa (UXF-014 pede LCP/CLS/INP/TTFB) —
não tem critério PASS/FAIL.

## 9. Critérios PASS / FAIL / UNKNOWN (resumo)

| Métrica | PASS | FAIL | UNKNOWN |
|---|---|---|---|
| LCP | mediana lab ≤ efetivo da página (Seção 4) | mediana lab > efetivo da página | — |
| CLS | ≤ 0.10 (inclui `0 < CLS ≤ 0.10`, registrado como regressão frente ao estado atual) | > 0.10 | — |
| INP | p75 de campo disponível e ≤ 200 ms | p75 de campo disponível e > 200 ms | dado de campo insuficiente |
| TTFB | ≤ 800 ms | > 800 ms | — |
| TBT | — (sem PASS/FAIL, só referência diagnóstica) | — | — |

## 10. Como UXW-007 a UXW-016 e UXQ-007 devem referenciar este documento

- UXW-007, UXW-008, UXW-009, UXW-013 e UXW-016 medem contra os critérios da
  Seção 9 deste documento (não contra a UXF-013 diretamente).
- Distinção obrigatória em UXW-016 entre os dois tipos de achado:
  - **`FAIL` medido** (LCP, CLS ou TTFB acima do teto, ou INP com p75 de
    campo disponível acima de 200 ms) → é um **desvio de budget real**,
    seguindo o mecanismo já aprovado: UX-M04 fecha independentemente do
    resultado, mas o desvio é registrado formalmente (página, métrica,
    valor medido vs. budget) e esse registro bloqueia UX-M05 até resolução
    via UXQ-008/UXQ-009.
  - **`UNKNOWN` de INP** (ausência de dado de campo suficiente) → é um
    **estado não verificável, não um desvio medido**. Não deve ser
    registrado como "budget deviation" em UXW-016 e não deve disparar
    UXQ-008 automaticamente — UXQ-008 corrige página que não atingiu o
    budget, não ausência de evidência.
- UXQ-007 reexecuta a mesma metodologia da UXF-013 (Seção 1) e compara o
  resultado final contra este mesmo documento.
- **UXQ-009 e o estado `UNKNOWN` de INP:** se o INP de alguma página ainda
  estiver `UNKNOWN` quando UXQ-009 for executada, UXQ-009 **não pode
  declarar silenciosamente que o budget foi cumprido** nessa página. Isso é
  uma lacuna normativa/observacional real, a ser levada para decisão
  explícita nesse momento (ex.: aguardar dado de campo, aprovar RUM, ou
  outra decisão arquitetural equivalente) — nunca convertida
  automaticamente em `PASS`, e nunca resolvida relaxando o budget de INP.
- Revisão do budget em si só ocorre por decisão explícita e separada —
  nunca como efeito colateral de uma tarefa UXW/UXQ.
