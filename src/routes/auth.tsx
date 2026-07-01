import { useState } from "react";
import { createFileRoute, useNavigate, redirect } from "@tanstack/react-router";
import { toast } from "sonner";
import { Building2, Loader2, Shield } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/auth")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (data.session) {
      throw redirect({ to: "/app" });
    }
  },
  head: () => ({
    meta: [
      { title: "Iniciar sesión — Soluciona Ya ERP" },
      { name: "description", content: "Ingresa a tu cuenta de Soluciona Ya ERP." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("Bienvenido de vuelta");
        navigate({ to: "/app" });
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/app`,
            data: { full_name: fullName },
          },
        });
        if (error) throw error;
        toast.success("Cuenta creada. Iniciando sesión…");
        navigate({ to: "/app" });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Ocurrió un error";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-background">
      {/* Left: brand panel */}
      <div className="relative hidden lg:flex flex-col justify-between p-12 bg-sidebar text-sidebar-foreground overflow-hidden">
        <div className="absolute inset-0 opacity-30 pointer-events-none [background-image:radial-gradient(circle_at_20%_20%,var(--sidebar-primary)_0,transparent_50%),radial-gradient(circle_at_80%_80%,var(--info)_0,transparent_50%)]" />
        <div className="relative flex items-center gap-3">
          <div className="grid size-10 place-items-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground font-semibold">
            SY
          </div>
          <div>
            <p className="text-sm font-medium tracking-wide">Soluciona Ya</p>
            <p className="text-xs text-sidebar-foreground/70">ERP de nueva generación</p>
          </div>
        </div>

        <div className="relative space-y-8">
          <h1 className="text-4xl font-semibold leading-tight tracking-tight">
            El ERP moderno para empresas que se mueven rápido.
          </h1>
          <p className="text-sidebar-foreground/70 text-lg leading-relaxed max-w-md">
            Inventarios, ventas, compras, cartera y contabilidad en una sola plataforma. Simple, rápido y a la altura de tu operación.
          </p>
          <div className="grid grid-cols-2 gap-4 max-w-md">
            {[
              { icon: Building2, label: "Multiempresa" },
              { icon: Shield, label: "Seguridad empresarial" },
            ].map((f) => (
              <div key={f.label} className="flex items-center gap-2 text-sm text-sidebar-foreground/80">
                <f.icon className="size-4" />
                <span>{f.label}</span>
              </div>
            ))}
          </div>
        </div>

        <p className="relative text-xs text-sidebar-foreground/50">
          © {new Date().getFullYear()} Soluciona Ya ERP
        </p>
      </div>

      {/* Right: form */}
      <div className="flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-sm space-y-8">
          <div className="lg:hidden flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-lg bg-primary text-primary-foreground font-semibold">
              SY
            </div>
            <p className="font-semibold">Soluciona Ya ERP</p>
          </div>

          <div>
            <h2 className="text-2xl font-semibold tracking-tight">
              {mode === "signin" ? "Ingresa a tu cuenta" : "Crea tu cuenta"}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {mode === "signin"
                ? "Usa tu correo y contraseña para continuar."
                : "El primer usuario que crea una empresa será el super administrador."}
            </p>
          </div>

          <Tabs value={mode} onValueChange={(v) => setMode(v as "signin" | "signup")}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="signin">Iniciar sesión</TabsTrigger>
              <TabsTrigger value="signup">Crear cuenta</TabsTrigger>
            </TabsList>

            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              <TabsContent value="signup" className="space-y-4 m-0">
                <div className="space-y-2">
                  <Label htmlFor="fullName">Nombre completo</Label>
                  <Input
                    id="fullName"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Ana Ramírez"
                    required={mode === "signup"}
                  />
                </div>
              </TabsContent>

              <div className="space-y-2">
                <Label htmlFor="email">Correo</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="tu@empresa.com"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Contraseña</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete={mode === "signin" ? "current-password" : "new-password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  minLength={8}
                  required
                />
              </div>

              <Button type="submit" className="w-full" disabled={loading}>
                {loading && <Loader2 className="mr-2 size-4 animate-spin" />}
                {mode === "signin" ? "Ingresar" : "Crear cuenta"}
              </Button>
            </form>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
