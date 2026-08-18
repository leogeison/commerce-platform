/**
 * Fixture de verificação da UXF-004/UXF-005 — não é uma tela de produto.
 *
 * UXF-004: renderiza o probe técnico de packages/ui/src/probe.tsx para
 * provar que o content-scanning do Tailwind alcança o pacote. Ver
 * packages/ui/src/probe.tsx.
 *
 * UXF-005: reaproveita esta mesma rota (em vez de criar uma rota nova) para
 * provar visualmente e via build que Text/Button/Skeleton renderizam
 * corretamente aqui e no equivalente do FastCompre, com a mesma ponte
 * tokens→Tailwind (packages/ui/tokens/tailwind-theme.css) resolvendo para
 * o mesmo CSS nos dois apps.
 */
import { TailwindScanProbe } from '@commerce-platform/ui/probe';
import { Text, Button, Skeleton } from '@commerce-platform/ui';

export default function TailwindScanProbePage() {
  return (
    <>
      <TailwindScanProbe />

      <Text tone="primary">Texto primário (body)</Text>
      <Text tone="muted">Texto muted (body)</Text>
      <Text tone="danger" variant="body-sm">
        Texto de erro (body-sm)
      </Text>
      <Text as="span" variant="body-sm">
        Página 1 de 3
      </Text>

      <Button variant="primary">Ação primária</Button>
      <Button variant="secondary">Ação secundária</Button>
      <Button variant="primary" size="sm">
        Ação primária (sm)
      </Button>

      <Skeleton variant="text" />
      <Skeleton variant="block" width={200} height={80} />
      <Skeleton variant="circle" width={40} height={40} />
    </>
  );
}
