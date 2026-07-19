import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { useActiveCompany } from "@/hooks/use-active-company";
import { hasPermission, type PermissionMode, type PermissionRequirement } from "@/lib/permissions";

const sb = supabase as any;

export function usePermissions(companyId?: string | null) {
  const { activeCompanyId } = useActiveCompany();
  const resolvedCompanyId = companyId ?? activeCompanyId;

  const query = useQuery({
    queryKey: ["my-permissions", resolvedCompanyId],
    enabled: !!resolvedCompanyId,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await sb.rpc("get_my_permissions", { _company_id: resolvedCompanyId });
      if (error) throw error;
      return new Set<string>((data ?? []).map((row: any) => row.permission_code));
    },
  });

  const granted = query.data ?? new Set<string>();

  return {
    ...query,
    companyId: resolvedCompanyId,
    granted,
    can: (requirement?: PermissionRequirement, mode: PermissionMode = "any") =>
      hasPermission(granted, requirement, mode),
  };
}
