/**
 * `setupFilesAfterEnv` (UXF-007; era `setupFiles` na UXF-008) — necessário
 * para que `jest-axe/extend-expect` chame `expect.extend(...)` depois que
 * o ambiente Jest já está instalado (mesmo motivo de `apps/admin`,
 * ADM-002). As variáveis de ambiente abaixo continuam sendo aplicadas
 * antes de qualquer arquivo de teste importar `./env` — `setupFilesAfterEnv`
 * roda depois do ambiente, mas ainda antes do arquivo de teste em si.
 */
import 'jest-axe/extend-expect';

process.env.SITE_SLUG = 'test-site';
process.env.API_URL = 'http://localhost:3000';
process.env.SITE_URL = 'http://localhost:3001';
process.env.AFFILIATE_REDIRECT_URL = 'http://localhost:3000';
process.env.REVALIDATION_SECRET = 'test-revalidation-secret-value';
