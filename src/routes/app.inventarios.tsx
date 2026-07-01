import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, ComingSoon } from "@/components/erp/page-header";

export const Route = createFileRoute("/app/inventarios")({ component: InventariosPage });

function InventariosPage() {
  return (
    <div>
      <PageHeader
        eyebrow="Operación"
        title="Inventarios"
        description="Entradas, salidas, traslados, ajustes, kardex y existencias por bodega."
      />
      <ComingSoon
        title="Módulo de inventarios — Fase 2"
        description="En la próxima fase habilitamos movimientos, kardex por producto y existencias en tiempo real por bodega y ubicación."
      />
    </div>
  );
}
