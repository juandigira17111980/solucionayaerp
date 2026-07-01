import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Ruler } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, EmptyState } from "@/components/erp/page-header";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const Route = createFileRoute("/app/unidades")({ component: UnidadesPage });

function UnidadesPage() {
  const { data = [], isLoading } = useQuery({
    queryKey: ["uoms-list"],
    queryFn: async () => {
      const { data } = await supabase.from("units_of_measure").select("*").order("code");
      return data ?? [];
    },
  });

  return (
    <div>
      <PageHeader
        eyebrow="Maestros"
        title="Unidades de medida"
        description="Catálogo global de unidades de medida. Se comparte entre todas las empresas."
      />
      {isLoading ? <p className="text-sm text-muted-foreground">Cargando…</p>
      : data.length === 0 ? <EmptyState icon={Ruler} title="Sin unidades" />
      : (
        <div className="rounded-xl border border-border bg-card overflow-hidden max-w-2xl">
          <Table>
            <TableHeader><TableRow><TableHead>Código</TableHead><TableHead>Nombre</TableHead><TableHead>Símbolo</TableHead></TableRow></TableHeader>
            <TableBody>
              {data.map((u) => (
                <TableRow key={u.id}>
                  <TableCell className="font-mono text-sm">{u.code}</TableCell>
                  <TableCell className="font-medium">{u.name}</TableCell>
                  <TableCell className="text-muted-foreground">{u.symbol ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
