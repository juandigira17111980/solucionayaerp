import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchMyCompanies, getActiveCompanyId, setActiveCompanyId, type Company } from "@/lib/companies";

export function useCompanies() {
  return useQuery({
    queryKey: ["my-companies"],
    queryFn: fetchMyCompanies,
    staleTime: 30_000,
  });
}

export function useActiveCompany() {
  const { data: companies, isLoading } = useCompanies();
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    setActiveId(getActiveCompanyId());
  }, []);

  useEffect(() => {
    if (!companies || companies.length === 0) return;
    const stored = getActiveCompanyId();
    if (stored && companies.some((c) => c.id === stored)) {
      setActiveId(stored);
      return;
    }
    const first = companies[0].id;
    setActiveCompanyId(first);
    setActiveId(first);
  }, [companies]);

  const activeCompany: Company | undefined = companies?.find((c) => c.id === activeId);

  return {
    companies: companies ?? [],
    activeCompany,
    activeCompanyId: activeId,
    setActiveCompany: (id: string) => {
      setActiveCompanyId(id);
      setActiveId(id);
    },
    isLoading,
  };
}
