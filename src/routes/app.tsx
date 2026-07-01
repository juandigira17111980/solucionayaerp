import { createFileRoute, Outlet, redirect, Link, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  Building2, Warehouse, Boxes, Users, LayoutDashboard, Settings, LogOut,
  Package, Tags, Factory, Ruler, MapPin, ShieldCheck, ChevronDown, Search,
  Menu, X, Sparkles, ShoppingCart,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useActiveCompany } from "@/hooks/use-active-company";
import { useQueryClient } from "@tanstack/react-query";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/app")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: AppLayout,
});

type NavItem = { label: string; to: string; icon: React.ComponentType<{ className?: string }>; badge?: string };
type NavGroup = { label: string; items: NavItem[] };

const NAV: NavGroup[] = [
  {
    label: "General",
    items: [
      { label: "Dashboard", to: "/app", icon: LayoutDashboard },
    ],
  },
  {
    label: "Maestros",
    items: [
      { label: "Productos", to: "/app/productos", icon: Package },
      { label: "Categorías", to: "/app/categorias", icon: Tags },
      { label: "Marcas", to: "/app/marcas", icon: Factory },
      { label: "Unidades", to: "/app/unidades", icon: Ruler },
      { label: "Terceros", to: "/app/terceros", icon: Users },
    ],
  },
  {
    label: "Operación",
    items: [
      { label: "Bodegas", to: "/app/bodegas", icon: Warehouse },
      { label: "Bodegas", to: "/app/bodegas", icon: Warehouse },
      { label: "Inventarios", to: "/app/inventarios", icon: Boxes },
      { label: "Compras", to: "/app/compras", icon: ShoppingCart },
    ],
  },
  {
    label: "Administración",
    items: [
      { label: "Empresas", to: "/app/empresas", icon: Building2 },
      { label: "Seguridad", to: "/app/seguridad", icon: ShieldCheck },
      { label: "Geografía", to: "/app/geografia", icon: MapPin },
      { label: "Configuración", to: "/app/configuracion", icon: Settings },
    ],
  },
];

function AppLayout() {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = Route.useRouteContext();
  const { companies, activeCompany, setActiveCompany, isLoading } = useActiveCompany();

  const pathname = router.state.location.pathname;

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    router.navigate({ to: "/auth", replace: true });
  }

  const showOnboarding = !isLoading && companies.length === 0;

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Sidebar - desktop */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 hidden lg:flex flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border transition-[width] duration-200",
          collapsed ? "w-16" : "w-64",
        )}
      >
        <SidebarContent
          collapsed={collapsed}
          onToggle={() => setCollapsed(!collapsed)}
          pathname={pathname}
        />
      </aside>

      {/* Sidebar - mobile */}
      {mobileOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-foreground/40 lg:hidden"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="fixed inset-y-0 left-0 z-50 flex flex-col w-64 bg-sidebar text-sidebar-foreground border-r border-sidebar-border lg:hidden">
            <SidebarContent collapsed={false} pathname={pathname} onClose={() => setMobileOpen(false)} />
          </aside>
        </>
      )}

      {/* Main */}
      <div className={cn("min-h-screen transition-[padding] duration-200", collapsed ? "lg:pl-16" : "lg:pl-64")}>
        {/* Top bar */}
        <header className="sticky top-0 z-30 h-14 flex items-center gap-3 px-4 lg:px-6 bg-surface-elevated/80 backdrop-blur border-b border-border">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={() => setMobileOpen(true)}
          >
            <Menu className="size-5" />
          </Button>

          {/* Company switcher */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="gap-2 max-w-[240px] justify-between">
                <Building2 className="size-4 shrink-0 text-muted-foreground" />
                <span className="truncate text-sm">
                  {activeCompany?.trade_name ?? activeCompany?.legal_name ?? "Sin empresa"}
                </span>
                <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-64">
              <DropdownMenuLabel className="text-xs">Empresas</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {companies.length === 0 && (
                <DropdownMenuItem disabled>Sin empresas todavía</DropdownMenuItem>
              )}
              {companies.map((c) => (
                <DropdownMenuItem key={c.id} onClick={() => setActiveCompany(c.id)}>
                  <Building2 className="mr-2 size-4" />
                  <div className="flex flex-col">
                    <span className="text-sm">{c.trade_name ?? c.legal_name}</span>
                    <span className="text-xs text-muted-foreground">NIT {c.tax_id}</span>
                  </div>
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => router.navigate({ to: "/app/empresas" })}>
                <Settings className="mr-2 size-4" /> Administrar empresas
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Search */}
          <div className="hidden md:flex flex-1 max-w-md relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input placeholder="Buscar en el ERP…" className="pl-9 bg-surface" />
          </div>

          <div className="ml-auto flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="gap-2">
                  <div className="grid size-7 place-items-center rounded-full bg-primary text-primary-foreground text-xs font-semibold">
                    {user.email?.[0]?.toUpperCase() ?? "U"}
                  </div>
                  <span className="hidden sm:inline text-sm max-w-[160px] truncate">{user.email}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="truncate">{user.email}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => router.navigate({ to: "/app/configuracion" })}>
                  <Settings className="mr-2 size-4" /> Configuración
                </DropdownMenuItem>
                <DropdownMenuItem onClick={signOut} className="text-destructive focus:text-destructive">
                  <LogOut className="mr-2 size-4" /> Cerrar sesión
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <main className="p-4 lg:p-8">
          {showOnboarding ? <OnboardingBanner /> : null}
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function SidebarContent({
  collapsed,
  onToggle,
  pathname,
  onClose,
}: {
  collapsed: boolean;
  onToggle?: () => void;
  pathname: string;
  onClose?: () => void;
}) {
  return (
    <>
      <div className="h-14 flex items-center gap-2 px-3 border-b border-sidebar-border">
        <div className="grid size-8 place-items-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground text-sm font-semibold">
          SY
        </div>
        {!collapsed && (
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold truncate">Soluciona Ya</p>
            <p className="text-[10px] uppercase tracking-wide text-sidebar-foreground/60">ERP</p>
          </div>
        )}
        {onClose && (
          <Button variant="ghost" size="icon" onClick={onClose} className="text-sidebar-foreground hover:bg-sidebar-accent">
            <X className="size-4" />
          </Button>
        )}
        {onToggle && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onToggle}
            className="ml-auto text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent"
          >
            <Menu className="size-4" />
          </Button>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-4">
        {NAV.map((group) => (
          <div key={group.label}>
            {!collapsed && (
              <p className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/50">
                {group.label}
              </p>
            )}
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const active =
                  item.to === "/app"
                    ? pathname === "/app"
                    : pathname === item.to || pathname.startsWith(item.to + "/");
                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    className={cn(
                      "flex items-center gap-3 rounded-md px-2 py-1.5 text-sm transition-colors",
                      active
                        ? "bg-sidebar-accent text-sidebar-accent-foreground"
                        : "text-sidebar-foreground/80 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
                      collapsed && "justify-center",
                    )}
                    title={collapsed ? item.label : undefined}
                  >
                    <item.icon className="size-4 shrink-0" />
                    {!collapsed && (
                      <>
                        <span className="truncate">{item.label}</span>
                        {item.badge && (
                          <span className="ml-auto rounded bg-sidebar-accent px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-sidebar-foreground/60">
                            {item.badge}
                          </span>
                        )}
                      </>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {!collapsed && (
        <div className="p-3 border-t border-sidebar-border">
          <div className="rounded-md bg-sidebar-accent/50 p-3 text-xs text-sidebar-foreground/80">
            <div className="flex items-center gap-2 font-medium text-sidebar-foreground">
              <Sparkles className="size-3.5" /> IA Assistant
            </div>
            <p className="mt-1 text-sidebar-foreground/60">
              Próximamente: asistentes contable, comercial y de inventarios.
            </p>
          </div>
        </div>
      )}
    </>
  );
}

function OnboardingBanner() {
  return (
    <div className="mb-6 rounded-xl border border-primary/20 bg-primary/5 p-5 flex flex-col sm:flex-row sm:items-center gap-4">
      <div className="grid size-10 place-items-center rounded-lg bg-primary text-primary-foreground">
        <Building2 className="size-5" />
      </div>
      <div className="flex-1">
        <p className="font-medium">Crea tu primera empresa</p>
        <p className="text-sm text-muted-foreground">
          Necesitas al menos una empresa para empezar a operar el ERP. Como primer usuario, serás el super administrador.
        </p>
      </div>
      <Link
        to="/app/empresas"
        className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition"
      >
        Crear empresa
      </Link>
    </div>
  );
}
