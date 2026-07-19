import type { LucideIcon } from "lucide-react";

export type PermissionCode =
  | "dashboard.view"
  | "companies.view"
  | "companies.manage"
  | "security.view"
  | "security.manage"
  | "warehouses.view"
  | "warehouses.manage"
  | "masters.view"
  | "masters.manage"
  | "inventory.view"
  | "inventory.operate"
  | "purchases.view"
  | "purchases.operate"
  | "sales.view"
  | "sales.operate"
  | "pos.operate"
  | "treasury.view"
  | "treasury.operate"
  | "accounting.view"
  | "accounting.operate"
  | "payroll.view"
  | "payroll.operate"
  | "reports.view"
  | "ai.use";

export type PermissionMode = "any" | "all";

export type PermissionRequirement = PermissionCode | PermissionCode[];

export type SecuredNavItem = {
  label: string;
  to: string;
  icon: LucideIcon;
  badge?: string;
  permissions?: PermissionRequirement;
  mode?: PermissionMode;
};

export type SecuredNavGroup = {
  label: string;
  items: SecuredNavItem[];
};

export const ROUTE_PERMISSIONS: Record<string, PermissionRequirement> = {
  "/app": "dashboard.view",
  "/app/empresas": "companies.view",
  "/app/seguridad": "security.view",
  "/app/bodegas": "warehouses.view",
  "/app/productos": "masters.view",
  "/app/categorias": "masters.view",
  "/app/marcas": "masters.view",
  "/app/unidades": "masters.view",
  "/app/terceros": "masters.view",
  "/app/geografia": "masters.view",
  "/app/inventarios": "inventory.view",
  "/app/compras": "purchases.view",
  "/app/ventas": "sales.view",
  "/app/pos": "pos.operate",
  "/app/tesoreria": "treasury.view",
  "/app/gastos": "accounting.view",
  "/app/contabilidad": "accounting.view",
  "/app/nomina": "payroll.view",
  "/app/reportes": "reports.view",
  "/app/asistente": "ai.use",
  "/app/alertas": "reports.view",
  "/app/configuracion": "dashboard.view",
};

export function hasPermission(
  granted: Set<string>,
  requirement?: PermissionRequirement,
  mode: PermissionMode = "any",
) {
  if (!requirement) return true;
  const required = Array.isArray(requirement) ? requirement : [requirement];
  if (required.length === 0) return true;
  return mode === "all"
    ? required.every((permission) => granted.has(permission))
    : required.some((permission) => granted.has(permission));
}
