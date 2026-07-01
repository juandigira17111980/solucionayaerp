import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Building2, Boxes, Sparkles, ShieldCheck, LineChart, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Soluciona Ya ERP — El ERP moderno para tu empresa" },
      { name: "description", content: "ERP de nueva generación para empresas comerciales y de distribución. Multiempresa, multibodega, seguro y muy fácil de usar." },
      { property: "og:title", content: "Soluciona Ya ERP" },
      { property: "og:description", content: "El ERP moderno para empresas que se mueven rápido." },
      { property: "og:url", content: "/" },
    ],
    links: [{ rel: "canonical", href: "/" }],
  }),
  component: Landing,
});

const features = [
  { icon: Building2, title: "Multiempresa y multibodega", desc: "Administra varias empresas y centros de distribución desde una sola plataforma." },
  { icon: Boxes, title: "Inventarios en tiempo real", desc: "Kardex, existencias, traslados y ajustes con trazabilidad completa." },
  { icon: ShieldCheck, title: "Seguridad empresarial", desc: "Roles, permisos granulares y auditoría en cada acción." },
  { icon: LineChart, title: "BI integrado", desc: "Dashboards, KPIs y reportes dinámicos exportables a Excel y PDF." },
  { icon: Sparkles, title: "Asistentes con IA", desc: "Automatiza tareas y obtén insights de tus datos con IA integrada." },
  { icon: Zap, title: "Automatizaciones", desc: "Notificaciones, aprobaciones, flujo documental y webhooks." },
];

function Landing() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Nav */}
      <header className="sticky top-0 z-30 border-b border-border/60 bg-background/80 backdrop-blur">
        <div className="mx-auto max-w-6xl px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="grid size-8 place-items-center rounded-md bg-primary text-primary-foreground text-sm font-semibold">SY</div>
            <span className="font-semibold">Soluciona Ya ERP</span>
          </div>
          <div className="flex items-center gap-2">
            <Link to="/auth">
              <Button variant="ghost">Iniciar sesión</Button>
            </Link>
            <Link to="/auth">
              <Button>Empezar gratis</Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 -z-10 [background-image:radial-gradient(circle_at_top_left,color-mix(in_oklch,var(--primary)_18%,transparent),transparent_50%),radial-gradient(circle_at_bottom_right,color-mix(in_oklch,var(--info)_16%,transparent),transparent_50%)]" />
        <div className="mx-auto max-w-6xl px-6 py-24 lg:py-32 text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-xs text-muted-foreground">
            <span className="size-1.5 rounded-full bg-success" /> Nueva generación de ERPs
          </span>
          <h1 className="mt-6 text-4xl sm:text-6xl font-semibold tracking-tight max-w-3xl mx-auto">
            El ERP moderno para empresas que se mueven rápido.
          </h1>
          <p className="mt-6 text-lg text-muted-foreground max-w-2xl mx-auto">
            Inventarios, ventas, compras, cartera y contabilidad en una sola plataforma. Simple, rápido y con la robustez de un ERP empresarial.
          </p>
          <div className="mt-8 flex items-center justify-center gap-3">
            <Link to="/auth">
              <Button size="lg" className="gap-2">
                Comenzar ahora <ArrowRight className="size-4" />
              </Button>
            </Link>
            <a href="#modulos">
              <Button size="lg" variant="outline">Ver módulos</Button>
            </a>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="modulos" className="mx-auto max-w-6xl px-6 py-20 border-t border-border">
        <div className="text-center">
          <p className="text-sm font-medium text-primary">Plataforma modular</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight">Todo lo que tu operación necesita</h2>
          <p className="mt-3 text-muted-foreground">Diseñado para escalar con tu empresa.</p>
        </div>
        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => (
            <div key={f.title} className="rounded-xl border border-border bg-card p-5 shadow-elevation-low hover:shadow-elevation-medium transition-shadow">
              <div className="grid size-10 place-items-center rounded-lg bg-accent text-accent-foreground">
                <f.icon className="size-5" />
              </div>
              <h3 className="mt-4 font-semibold">{f.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="border-t border-border py-8 text-center text-sm text-muted-foreground">
        © {new Date().getFullYear()} Soluciona Ya ERP
      </footer>
    </div>
  );
}
