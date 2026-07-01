
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT tc.constraint_name, tc.table_name
    FROM information_schema.table_constraints tc
    WHERE tc.table_schema='public' AND tc.constraint_type='FOREIGN KEY'
      AND tc.table_name IN (
        'pos_sessions','sales_orders','sales_order_lines','purchase_orders','purchase_order_lines',
        'purchase_receipts','purchase_receipt_lines','inventory_movements','inventory_movement_lines',
        'stock','kardex','accounts_receivable','accounts_payable','treasury_transactions','expenses',
        'payroll_periods','payroll_items','products','third_parties','warehouses','bank_accounts',
        'journal_entries','journal_entry_lines','chart_of_accounts','product_categories','brands',
        'product_lots','employees','departments','cities','audit_logs','ai_conversations','ai_messages',
        'user_companies','user_roles','payment_applications','companies'
      )
  LOOP
    EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT %I', r.table_name, r.constraint_name);
  END LOOP;
END $$;

ALTER TABLE public.user_companies ADD CONSTRAINT user_companies_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.user_roles ADD CONSTRAINT user_roles_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;

ALTER TABLE public.departments ADD CONSTRAINT departments_country_id_fkey FOREIGN KEY (country_id) REFERENCES public.countries(id) ON DELETE CASCADE;
ALTER TABLE public.cities ADD CONSTRAINT cities_department_id_fkey FOREIGN KEY (department_id) REFERENCES public.departments(id) ON DELETE CASCADE;

ALTER TABLE public.brands ADD CONSTRAINT brands_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.product_categories ADD CONSTRAINT product_categories_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.product_categories ADD CONSTRAINT product_categories_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.product_categories(id) ON DELETE SET NULL;
ALTER TABLE public.products ADD CONSTRAINT products_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.products ADD CONSTRAINT products_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.product_categories(id) ON DELETE SET NULL;
ALTER TABLE public.products ADD CONSTRAINT products_brand_id_fkey FOREIGN KEY (brand_id) REFERENCES public.brands(id) ON DELETE SET NULL;
ALTER TABLE public.products ADD CONSTRAINT products_uom_id_fkey FOREIGN KEY (uom_id) REFERENCES public.units_of_measure(id) ON DELETE SET NULL;
ALTER TABLE public.product_lots ADD CONSTRAINT product_lots_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.product_lots ADD CONSTRAINT product_lots_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;
ALTER TABLE public.third_parties ADD CONSTRAINT third_parties_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;

ALTER TABLE public.warehouses ADD CONSTRAINT warehouses_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.stock ADD CONSTRAINT stock_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.stock ADD CONSTRAINT stock_warehouse_id_fkey FOREIGN KEY (warehouse_id) REFERENCES public.warehouses(id) ON DELETE CASCADE;
ALTER TABLE public.stock ADD CONSTRAINT stock_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;

ALTER TABLE public.inventory_movements ADD CONSTRAINT inventory_movements_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.inventory_movements ADD CONSTRAINT inventory_movements_wh_from_fkey FOREIGN KEY (warehouse_from_id) REFERENCES public.warehouses(id) ON DELETE SET NULL;
ALTER TABLE public.inventory_movements ADD CONSTRAINT inventory_movements_wh_to_fkey FOREIGN KEY (warehouse_to_id) REFERENCES public.warehouses(id) ON DELETE SET NULL;
ALTER TABLE public.inventory_movements ADD CONSTRAINT inventory_movements_third_party_id_fkey FOREIGN KEY (third_party_id) REFERENCES public.third_parties(id) ON DELETE SET NULL;
ALTER TABLE public.inventory_movement_lines ADD CONSTRAINT iml_movement_id_fkey FOREIGN KEY (movement_id) REFERENCES public.inventory_movements(id) ON DELETE CASCADE;
ALTER TABLE public.inventory_movement_lines ADD CONSTRAINT iml_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE RESTRICT;
ALTER TABLE public.inventory_movement_lines ADD CONSTRAINT iml_lot_id_fkey FOREIGN KEY (lot_id) REFERENCES public.product_lots(id) ON DELETE SET NULL;

ALTER TABLE public.kardex ADD CONSTRAINT kardex_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.kardex ADD CONSTRAINT kardex_warehouse_id_fkey FOREIGN KEY (warehouse_id) REFERENCES public.warehouses(id) ON DELETE CASCADE;
ALTER TABLE public.kardex ADD CONSTRAINT kardex_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;
ALTER TABLE public.kardex ADD CONSTRAINT kardex_lot_id_fkey FOREIGN KEY (lot_id) REFERENCES public.product_lots(id) ON DELETE SET NULL;
ALTER TABLE public.kardex ADD CONSTRAINT kardex_movement_id_fkey FOREIGN KEY (movement_id) REFERENCES public.inventory_movements(id) ON DELETE CASCADE;
ALTER TABLE public.kardex ADD CONSTRAINT kardex_movement_line_id_fkey FOREIGN KEY (movement_line_id) REFERENCES public.inventory_movement_lines(id) ON DELETE CASCADE;

ALTER TABLE public.purchase_orders ADD CONSTRAINT po_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.purchase_orders ADD CONSTRAINT po_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.third_parties(id) ON DELETE RESTRICT;
ALTER TABLE public.purchase_orders ADD CONSTRAINT po_warehouse_id_fkey FOREIGN KEY (warehouse_id) REFERENCES public.warehouses(id) ON DELETE SET NULL;
ALTER TABLE public.purchase_order_lines ADD CONSTRAINT pol_po_id_fkey FOREIGN KEY (purchase_order_id) REFERENCES public.purchase_orders(id) ON DELETE CASCADE;
ALTER TABLE public.purchase_order_lines ADD CONSTRAINT pol_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE RESTRICT;
ALTER TABLE public.purchase_receipts ADD CONSTRAINT pr_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.purchase_receipts ADD CONSTRAINT pr_po_id_fkey FOREIGN KEY (purchase_order_id) REFERENCES public.purchase_orders(id) ON DELETE SET NULL;
ALTER TABLE public.purchase_receipts ADD CONSTRAINT pr_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.third_parties(id) ON DELETE RESTRICT;
ALTER TABLE public.purchase_receipts ADD CONSTRAINT pr_warehouse_id_fkey FOREIGN KEY (warehouse_id) REFERENCES public.warehouses(id) ON DELETE SET NULL;
ALTER TABLE public.purchase_receipts ADD CONSTRAINT pr_inv_mov_id_fkey FOREIGN KEY (inventory_movement_id) REFERENCES public.inventory_movements(id) ON DELETE SET NULL;
ALTER TABLE public.purchase_receipt_lines ADD CONSTRAINT prl_receipt_id_fkey FOREIGN KEY (receipt_id) REFERENCES public.purchase_receipts(id) ON DELETE CASCADE;
ALTER TABLE public.purchase_receipt_lines ADD CONSTRAINT prl_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE RESTRICT;
ALTER TABLE public.purchase_receipt_lines ADD CONSTRAINT prl_pol_id_fkey FOREIGN KEY (purchase_order_line_id) REFERENCES public.purchase_order_lines(id) ON DELETE SET NULL;

ALTER TABLE public.sales_orders ADD CONSTRAINT so_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.sales_orders ADD CONSTRAINT so_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.third_parties(id) ON DELETE SET NULL;
ALTER TABLE public.sales_orders ADD CONSTRAINT so_warehouse_id_fkey FOREIGN KEY (warehouse_id) REFERENCES public.warehouses(id) ON DELETE SET NULL;
ALTER TABLE public.sales_orders ADD CONSTRAINT so_pos_session_id_fkey FOREIGN KEY (pos_session_id) REFERENCES public.pos_sessions(id) ON DELETE SET NULL;
ALTER TABLE public.sales_order_lines ADD CONSTRAINT sol_so_id_fkey FOREIGN KEY (sales_order_id) REFERENCES public.sales_orders(id) ON DELETE CASCADE;
ALTER TABLE public.sales_order_lines ADD CONSTRAINT sol_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE RESTRICT;

ALTER TABLE public.pos_sessions ADD CONSTRAINT pos_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.pos_sessions ADD CONSTRAINT pos_warehouse_id_fkey FOREIGN KEY (warehouse_id) REFERENCES public.warehouses(id) ON DELETE RESTRICT;

ALTER TABLE public.accounts_receivable ADD CONSTRAINT ar_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.accounts_receivable ADD CONSTRAINT ar_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.third_parties(id) ON DELETE RESTRICT;
ALTER TABLE public.accounts_receivable ADD CONSTRAINT ar_sales_order_id_fkey FOREIGN KEY (sales_order_id) REFERENCES public.sales_orders(id) ON DELETE SET NULL;
ALTER TABLE public.accounts_payable ADD CONSTRAINT ap_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.accounts_payable ADD CONSTRAINT ap_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.third_parties(id) ON DELETE RESTRICT;
ALTER TABLE public.accounts_payable ADD CONSTRAINT ap_receipt_id_fkey FOREIGN KEY (receipt_id) REFERENCES public.purchase_receipts(id) ON DELETE SET NULL;

ALTER TABLE public.bank_accounts ADD CONSTRAINT ba_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.treasury_transactions ADD CONSTRAINT tt_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.treasury_transactions ADD CONSTRAINT tt_bank_account_id_fkey FOREIGN KEY (bank_account_id) REFERENCES public.bank_accounts(id) ON DELETE RESTRICT;
ALTER TABLE public.treasury_transactions ADD CONSTRAINT tt_third_party_id_fkey FOREIGN KEY (third_party_id) REFERENCES public.third_parties(id) ON DELETE SET NULL;
ALTER TABLE public.payment_applications ADD CONSTRAINT pa_ar_id_fkey FOREIGN KEY (ar_id) REFERENCES public.accounts_receivable(id) ON DELETE CASCADE;
ALTER TABLE public.payment_applications ADD CONSTRAINT pa_ap_id_fkey FOREIGN KEY (ap_id) REFERENCES public.accounts_payable(id) ON DELETE CASCADE;
ALTER TABLE public.payment_applications ADD CONSTRAINT pa_tx_id_fkey FOREIGN KEY (treasury_txn_id) REFERENCES public.treasury_transactions(id) ON DELETE CASCADE;

ALTER TABLE public.chart_of_accounts ADD CONSTRAINT coa_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.chart_of_accounts ADD CONSTRAINT coa_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.chart_of_accounts(id) ON DELETE SET NULL;
ALTER TABLE public.journal_entries ADD CONSTRAINT je_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.journal_entry_lines ADD CONSTRAINT jel_je_id_fkey FOREIGN KEY (journal_entry_id) REFERENCES public.journal_entries(id) ON DELETE CASCADE;
ALTER TABLE public.journal_entry_lines ADD CONSTRAINT jel_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.chart_of_accounts(id) ON DELETE RESTRICT;
ALTER TABLE public.journal_entry_lines ADD CONSTRAINT jel_third_party_id_fkey FOREIGN KEY (third_party_id) REFERENCES public.third_parties(id) ON DELETE SET NULL;

ALTER TABLE public.expenses ADD CONSTRAINT exp_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.expenses ADD CONSTRAINT exp_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.third_parties(id) ON DELETE SET NULL;
ALTER TABLE public.expenses ADD CONSTRAINT exp_bank_account_id_fkey FOREIGN KEY (bank_account_id) REFERENCES public.bank_accounts(id) ON DELETE SET NULL;
ALTER TABLE public.expenses ADD CONSTRAINT exp_expense_account_id_fkey FOREIGN KEY (expense_account_id) REFERENCES public.chart_of_accounts(id) ON DELETE SET NULL;
ALTER TABLE public.expenses ADD CONSTRAINT exp_ap_id_fkey FOREIGN KEY (ap_id) REFERENCES public.accounts_payable(id) ON DELETE SET NULL;
ALTER TABLE public.expenses ADD CONSTRAINT exp_tx_id_fkey FOREIGN KEY (treasury_txn_id) REFERENCES public.treasury_transactions(id) ON DELETE SET NULL;
ALTER TABLE public.expenses ADD CONSTRAINT exp_je_id_fkey FOREIGN KEY (journal_entry_id) REFERENCES public.journal_entries(id) ON DELETE SET NULL;

ALTER TABLE public.employees ADD CONSTRAINT emp_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.payroll_periods ADD CONSTRAINT pp_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.payroll_periods ADD CONSTRAINT pp_je_id_fkey FOREIGN KEY (journal_entry_id) REFERENCES public.journal_entries(id) ON DELETE SET NULL;
ALTER TABLE public.payroll_items ADD CONSTRAINT pi_period_id_fkey FOREIGN KEY (payroll_period_id) REFERENCES public.payroll_periods(id) ON DELETE CASCADE;
ALTER TABLE public.payroll_items ADD CONSTRAINT pi_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE RESTRICT;

ALTER TABLE public.ai_conversations ADD CONSTRAINT ai_conv_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.ai_messages ADD CONSTRAINT ai_msg_conv_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.ai_conversations(id) ON DELETE CASCADE;

ALTER TABLE public.audit_logs ADD CONSTRAINT audit_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;

NOTIFY pgrst, 'reload schema';
