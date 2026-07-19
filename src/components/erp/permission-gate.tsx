import type { ReactNode } from "react";
import { LockKeyhole } from "lucide-react";

import { EmptyState } from "@/components/erp/page-header";
import { useActiveCompany } from "@/hooks/use-active-company";
import { usePermissions } from "@/hooks/use-permissions";
import type { PermissionMode, PermissionRequirement } from "@/lib/permissions";

export function PermissionGate({
  permission,
  mode = "any",
  children,
  fallback,
}: {
  permission: PermissionRequirement;
  mode?: PermissionMode;
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const { activeCompanyId } = useActiveCompany();
  const permissions = usePermissions(activeCompanyId);
  const allowed = permissions.can(permission, mode);

  if (!activeCompanyId) return <>{children}</>;
  if (permissions.isLoading) {
    return (
      <EmptyState
        icon={LockKeyhole}
        title="Validando permisos"
        description="Estamos verificando tu acceso para esta empresa."
      />
    );
  }
  if (!allowed) {
    return (
      <>
        {fallback ?? (
          <EmptyState
            icon={LockKeyhole}
            title="Acceso restringido"
            description="Tu usuario no tiene permisos para abrir este módulo en la empresa activa."
          />
        )}
      </>
    );
  }
  return <>{children}</>;
}

export function Can({
  permission,
  mode = "any",
  children,
  fallback = null,
}: {
  permission: PermissionRequirement;
  mode?: PermissionMode;
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const permissions = usePermissions();
  if (permissions.isLoading) return null;
  return permissions.can(permission, mode) ? <>{children}</> : <>{fallback}</>;
}
