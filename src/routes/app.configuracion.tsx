import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/erp/page-header";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { toast } from "sonner";

export const Route = createFileRoute("/app/configuracion")({ component: ConfigPage });

function ConfigPage() {
  const qc = useQueryClient();
  const router = useRouter();

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    toast.success("Sesión cerrada");
    router.navigate({ to: "/auth", replace: true });
  }

  return (
    <div>
      <PageHeader
        eyebrow="Configuración"
        title="Preferencias"
        description="Ajustes personales de la cuenta. La configuración avanzada por empresa llega en próximas fases."
      />
      <div className="rounded-xl border border-border bg-card p-6 max-w-lg">
        <h3 className="font-semibold">Cuenta</h3>
        <p className="mt-1 text-sm text-muted-foreground">Cierra la sesión en este dispositivo.</p>
        <Button className="mt-4" variant="destructive" onClick={signOut}>Cerrar sesión</Button>
      </div>
    </div>
  );
}
