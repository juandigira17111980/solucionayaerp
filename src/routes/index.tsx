import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6">
      <div className="max-w-xl text-center">
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
          Proyecto inicial
        </p>
        <h1 className="mt-4 text-5xl font-semibold tracking-tight text-foreground">
          Soluciona Ya ERP
        </h1>
        <p className="mt-4 text-base text-muted-foreground">
          Base del proyecto lista. Comparte tus indicaciones para comenzar a construir los módulos del ERP.
        </p>
      </div>
    </main>
  );
}
