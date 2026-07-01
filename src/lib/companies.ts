import { supabase } from "@/integrations/supabase/client";

export type Company = {
  id: string;
  tax_id: string;
  legal_name: string;
  trade_name: string | null;
  currency_code: string;
  is_active: boolean;
};

const STORAGE_KEY = "sya:active_company";

export function getActiveCompanyId(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(STORAGE_KEY);
}

export function setActiveCompanyId(id: string | null) {
  if (typeof window === "undefined") return;
  if (id) window.localStorage.setItem(STORAGE_KEY, id);
  else window.localStorage.removeItem(STORAGE_KEY);
}

export async function fetchMyCompanies(): Promise<Company[]> {
  const { data, error } = await supabase
    .from("companies")
    .select("id, tax_id, legal_name, trade_name, currency_code, is_active")
    .order("legal_name", { ascending: true });
  if (error) throw error;
  return (data ?? []) as Company[];
}
