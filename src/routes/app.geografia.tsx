import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { MapPin } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/erp/page-header";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const Route = createFileRoute("/app/geografia")({ component: GeografiaPage });

function GeografiaPage() {
  const { data = [] } = useQuery({
    queryKey: ["geo-tree"],
    queryFn: async () => {
      const { data } = await supabase
        .from("cities")
        .select("id, name, departments!inner(name, countries!inner(name, code))")
        .order("name")
        .limit(500);
      return data ?? [];
    },
  });

  return (
    <div>
      <PageHeader
        eyebrow="Administración"
        title="Geografía"
        description="Países, departamentos y ciudades. Se utilizan en direcciones de terceros, bodegas y documentos."
      />
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <Table>
          <TableHeader><TableRow><TableHead>Ciudad</TableHead><TableHead>Departamento</TableHead><TableHead>País</TableHead></TableRow></TableHeader>
          <TableBody>
            {data.map((c) => {
              const dep = c.departments as unknown as { name: string; countries: { name: string; code: string } };
              return (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.name}</TableCell>
                  <TableCell className="text-muted-foreground">{dep.name}</TableCell>
                  <TableCell className="text-muted-foreground">
                    <span className="inline-flex items-center gap-2">
                      <MapPin className="size-3" /> {dep.countries.name}
                    </span>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
