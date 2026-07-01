
CREATE OR REPLACE FUNCTION public.seed_demo_data(_company_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  uid uuid := auth.uid();
  co_country uuid;
  co_dept uuid;
  co_city uuid;
  uom_und uuid;
  uom_kg uuid;
  cat_bebidas uuid;
  cat_snacks uuid;
  cat_aseo uuid;
  brand_a uuid;
  brand_b uuid;
  wh_main uuid;
  wh_pos uuid;
  sup1 uuid; sup2 uuid;
  cus1 uuid; cus2 uuid; cus3 uuid;
  bank_caja uuid; bank_bco uuid;
  emp1 uuid; emp2 uuid;
  p1 uuid; p2 uuid; p3 uuid; p4 uuid; p5 uuid;
  po_id uuid; po_doc text;
  rec_id uuid; rec_doc text;
  ap_id uuid;
  so_id uuid; so_doc text;
  pos_id uuid; pos_doc text;
  so_pos_id uuid;
  tx_id uuid; tx_doc text;
  ar_id uuid;
  exp_id uuid; exp_doc text;
  pay_id uuid; pay_doc text;
  gasto_acc uuid;
BEGIN
  IF NOT public.is_company_member(uid, _company_id) THEN
    RAISE EXCEPTION 'Sin permisos sobre esta empresa';
  END IF;

  IF EXISTS (SELECT 1 FROM public.products WHERE company_id=_company_id AND sku='DEMO-001') THEN
    RETURN jsonb_build_object('ok', true, 'already_seeded', true);
  END IF;

  PERFORM public.seed_chart_of_accounts(_company_id);
  SELECT id INTO gasto_acc FROM public.chart_of_accounts WHERE company_id=_company_id AND code='5135' LIMIT 1;

  SELECT id INTO co_country FROM public.countries WHERE name='Colombia' LIMIT 1;
  SELECT id INTO co_dept FROM public.departments WHERE country_id=co_country LIMIT 1;
  SELECT id INTO co_city FROM public.cities WHERE department_id=co_dept LIMIT 1;

  SELECT id INTO uom_und FROM public.units_of_measure WHERE code='UND' LIMIT 1;
  SELECT id INTO uom_kg  FROM public.units_of_measure WHERE code='KG'  LIMIT 1;

  -- Categorías (insert por separado para no violar single-row RETURNING)
  INSERT INTO public.product_categories(company_id, name, code) VALUES (_company_id, 'Bebidas', 'BEB') RETURNING id INTO cat_bebidas;
  INSERT INTO public.product_categories(company_id, name, code) VALUES (_company_id, 'Snacks',  'SNK') RETURNING id INTO cat_snacks;
  INSERT INTO public.product_categories(company_id, name, code) VALUES (_company_id, 'Aseo',    'ASE') RETURNING id INTO cat_aseo;

  INSERT INTO public.brands(company_id, name) VALUES (_company_id,'Marca A') RETURNING id INTO brand_a;
  INSERT INTO public.brands(company_id, name) VALUES (_company_id,'Marca B') RETURNING id INTO brand_b;

  INSERT INTO public.warehouses(company_id, code, name, warehouse_type, address, city_id)
    VALUES (_company_id,'BOD-01','Bodega Principal','bodega','Calle 10 #5-20', co_city)
    RETURNING id INTO wh_main;
  INSERT INTO public.warehouses(company_id, code, name, warehouse_type, address, city_id)
    VALUES (_company_id,'PV-01','Punto de Venta Centro','punto_venta','Cra 7 #12-45', co_city)
    RETURNING id INTO wh_pos;

  INSERT INTO public.third_parties(company_id, document_type, document_number, legal_name, trade_name, is_supplier, email, phone, payment_terms_days, city_id)
    VALUES (_company_id,'NIT','900111222','Distribuidora Andina S.A.','Distri Andina', true,'ventas@andina.co','3011112222',30, co_city)
    RETURNING id INTO sup1;
  INSERT INTO public.third_parties(company_id, document_type, document_number, legal_name, trade_name, is_supplier, email, phone, payment_terms_days, city_id)
    VALUES (_company_id,'NIT','900333444','Aseo Total Ltda.','Aseo Total', true,'contacto@aseototal.co','3023334444',15, co_city)
    RETURNING id INTO sup2;

  INSERT INTO public.third_parties(company_id, document_type, document_number, legal_name, trade_name, is_client, email, phone, credit_limit, payment_terms_days, city_id)
    VALUES (_company_id,'NIT','800555666','Supermercado La Esquina','La Esquina', true,'compras@esquina.co','3105556666',5000000,30, co_city)
    RETURNING id INTO cus1;
  INSERT INTO public.third_parties(company_id, document_type, document_number, legal_name, trade_name, is_client, email, phone, credit_limit, payment_terms_days, city_id)
    VALUES (_company_id,'CC','1020304050','Juan Pérez','Juan Pérez', true,'juan@mail.com','3117778888',1000000,15, co_city)
    RETURNING id INTO cus2;
  INSERT INTO public.third_parties(company_id, document_type, document_number, legal_name, trade_name, is_client, email, phone, city_id)
    VALUES (_company_id,'CC','9999999','Consumidor Final','Consumidor Final', true, null, null, co_city)
    RETURNING id INTO cus3;

  INSERT INTO public.bank_accounts(company_id, name, kind, currency, opening_balance, current_balance)
    VALUES (_company_id,'Caja General','caja','COP',500000,500000) RETURNING id INTO bank_caja;
  INSERT INTO public.bank_accounts(company_id, name, kind, bank_name, account_number, currency, opening_balance, current_balance)
    VALUES (_company_id,'Bancolombia Corriente','banco','Bancolombia','1234567890','COP',20000000,20000000) RETURNING id INTO bank_bco;

  INSERT INTO public.employees(company_id, code, document_number, full_name, email, phone, position, department, hire_date, base_salary, payment_method, bank_account, status)
    VALUES (_company_id,'EMP-001','111111','María López','maria@empresa.co','3001110001','Cajera','Ventas',CURRENT_DATE-365,1400000,'transferencia','1234-5678','activo')
    RETURNING id INTO emp1;
  INSERT INTO public.employees(company_id, code, document_number, full_name, email, phone, position, department, hire_date, base_salary, payment_method, bank_account, status)
    VALUES (_company_id,'EMP-002','222222','Carlos Ramírez','carlos@empresa.co','3001110002','Bodeguero','Operaciones',CURRENT_DATE-200,1500000,'transferencia','8765-4321','activo')
    RETURNING id INTO emp2;

  INSERT INTO public.products(company_id, sku, barcode, name, category_id, brand_id, uom_id, cost_price, sale_price, tax_rate, min_stock)
    VALUES (_company_id,'DEMO-001','7700001','Gaseosa 1.5L', cat_bebidas, brand_a, uom_und, 3500, 5500, 19, 20) RETURNING id INTO p1;
  INSERT INTO public.products(company_id, sku, barcode, name, category_id, brand_id, uom_id, cost_price, sale_price, tax_rate, min_stock)
    VALUES (_company_id,'DEMO-002','7700002','Agua 600ml', cat_bebidas, brand_a, uom_und, 1200, 2000, 19, 40) RETURNING id INTO p2;
  INSERT INTO public.products(company_id, sku, barcode, name, category_id, brand_id, uom_id, cost_price, sale_price, tax_rate, min_stock)
    VALUES (_company_id,'DEMO-003','7700003','Papas 45g', cat_snacks, brand_b, uom_und, 1800, 3000, 19, 30) RETURNING id INTO p3;
  INSERT INTO public.products(company_id, sku, barcode, name, category_id, brand_id, uom_id, cost_price, sale_price, tax_rate, min_stock)
    VALUES (_company_id,'DEMO-004','7700004','Chocolatina 40g', cat_snacks, brand_b, uom_und, 900, 1800, 19, 50) RETURNING id INTO p4;
  INSERT INTO public.products(company_id, sku, barcode, name, category_id, brand_id, uom_id, cost_price, sale_price, tax_rate, min_stock)
    VALUES (_company_id,'DEMO-005','7700005','Detergente 1kg', cat_aseo, brand_a, uom_kg, 8000, 13000, 19, 10) RETURNING id INTO p5;

  po_doc := public.next_purchase_number(_company_id,'order');
  INSERT INTO public.purchase_orders(company_id, doc_number, supplier_id, warehouse_id, order_date, expected_date, status, created_by)
    VALUES (_company_id, po_doc, sup1, wh_main, CURRENT_DATE-20, CURRENT_DATE-15, 'aprobada', uid) RETURNING id INTO po_id;
  INSERT INTO public.purchase_order_lines(purchase_order_id, product_id, quantity, unit_cost, tax_percent) VALUES
    (po_id, p1, 100, 3500, 19),(po_id, p2, 200, 1200, 19),(po_id, p3, 150, 1800, 19),(po_id, p4, 300, 900, 19);
  PERFORM public.recalc_purchase_order_totals(po_id);

  rec_doc := public.next_purchase_number(_company_id,'receipt');
  INSERT INTO public.purchase_receipts(company_id, doc_number, purchase_order_id, supplier_id, warehouse_id,
    receipt_date, supplier_invoice, invoice_date, due_date, status, created_by)
    VALUES (_company_id, rec_doc, po_id, sup1, wh_main, CURRENT_DATE-15, 'FV-9001', CURRENT_DATE-15, CURRENT_DATE+15, 'borrador', uid)
    RETURNING id INTO rec_id;
  INSERT INTO public.purchase_receipt_lines(receipt_id, purchase_order_line_id, product_id, quantity, unit_cost)
    SELECT rec_id, id, product_id, quantity, unit_cost FROM public.purchase_order_lines WHERE purchase_order_id=po_id;
  ap_id := public.confirm_purchase_receipt(rec_id);

  po_doc := public.next_purchase_number(_company_id,'order');
  INSERT INTO public.purchase_orders(company_id, doc_number, supplier_id, warehouse_id, order_date, status, created_by)
    VALUES (_company_id, po_doc, sup2, wh_main, CURRENT_DATE-10, 'aprobada', uid) RETURNING id INTO po_id;
  INSERT INTO public.purchase_order_lines(purchase_order_id, product_id, quantity, unit_cost, tax_percent)
    VALUES (po_id, p5, 40, 8000, 19);
  PERFORM public.recalc_purchase_order_totals(po_id);
  rec_doc := public.next_purchase_number(_company_id,'receipt');
  INSERT INTO public.purchase_receipts(company_id, doc_number, purchase_order_id, supplier_id, warehouse_id,
    receipt_date, supplier_invoice, due_date, status, created_by)
    VALUES (_company_id, rec_doc, po_id, sup2, wh_main, CURRENT_DATE-9, 'FV-2201', CURRENT_DATE-2, 'borrador', uid)
    RETURNING id INTO rec_id;
  INSERT INTO public.purchase_receipt_lines(receipt_id, purchase_order_line_id, product_id, quantity, unit_cost)
    SELECT rec_id, id, product_id, quantity, unit_cost FROM public.purchase_order_lines WHERE purchase_order_id=po_id;
  PERFORM public.confirm_purchase_receipt(rec_id);

  DECLARE mv_id uuid; mv_doc text;
  BEGIN
    mv_doc := public.next_movement_number(_company_id,'traslado');
    INSERT INTO public.inventory_movements(company_id, doc_number, movement_type, warehouse_from_id, warehouse_to_id, movement_date, notes, status, created_by)
      VALUES (_company_id, mv_doc, 'traslado', wh_main, wh_pos, CURRENT_DATE-8, 'Surtido PV', 'borrador', uid) RETURNING id INTO mv_id;
    INSERT INTO public.inventory_movement_lines(movement_id, product_id, quantity, unit_cost) VALUES
      (mv_id, p1, 30, 0),(mv_id, p2, 80, 0),(mv_id, p3, 60, 0),(mv_id, p4, 120, 0),(mv_id, p5, 10, 0);
    PERFORM public.confirm_inventory_movement(mv_id);
  END;

  so_doc := public.next_sales_number(_company_id,'sale');
  INSERT INTO public.sales_orders(company_id, doc_number, customer_id, warehouse_id, channel, order_date, due_date, payment_method, status, created_by)
    VALUES (_company_id, so_doc, cus1, wh_main, 'venta', CURRENT_DATE-5, CURRENT_DATE+25, 'credito','borrador', uid)
    RETURNING id INTO so_id;
  INSERT INTO public.sales_order_lines(sales_order_id, product_id, quantity, unit_price, tax_percent) VALUES
    (so_id, p1, 20, 5500, 19),(so_id, p2, 50, 2000, 19),(so_id, p3, 30, 3000, 19);
  UPDATE public.sales_orders SET
    subtotal = (SELECT COALESCE(SUM(quantity*unit_price),0) FROM public.sales_order_lines WHERE sales_order_id=so_id),
    tax_amount = (SELECT COALESCE(SUM(quantity*unit_price*tax_percent/100.0),0) FROM public.sales_order_lines WHERE sales_order_id=so_id)
    WHERE id=so_id;
  UPDATE public.sales_orders SET total = subtotal + tax_amount - discount_amount, balance = subtotal + tax_amount - discount_amount WHERE id=so_id;
  ar_id := public.confirm_sales_order(so_id);

  pos_doc := public.next_sales_number(_company_id,'pos');
  INSERT INTO public.pos_sessions(company_id, doc_number, cashier_id, warehouse_id, opened_at, opening_amount, status)
    VALUES (_company_id, pos_doc, uid, wh_pos, now()- interval '4 hours', 200000, 'abierta') RETURNING id INTO pos_id;

  so_doc := public.next_sales_number(_company_id,'sale');
  INSERT INTO public.sales_orders(company_id, doc_number, customer_id, warehouse_id, pos_session_id, channel, order_date, payment_method, status, created_by)
    VALUES (_company_id, so_doc, cus3, wh_pos, pos_id, 'pos', CURRENT_DATE, 'efectivo','borrador', uid) RETURNING id INTO so_pos_id;
  INSERT INTO public.sales_order_lines(sales_order_id, product_id, quantity, unit_price, tax_percent) VALUES
    (so_pos_id, p4, 5, 1800, 19),(so_pos_id, p2, 3, 2000, 19);
  UPDATE public.sales_orders SET
    subtotal = (SELECT COALESCE(SUM(quantity*unit_price),0) FROM public.sales_order_lines WHERE sales_order_id=so_pos_id),
    tax_amount = (SELECT COALESCE(SUM(quantity*unit_price*tax_percent/100.0),0) FROM public.sales_order_lines WHERE sales_order_id=so_pos_id)
    WHERE id=so_pos_id;
  UPDATE public.sales_orders SET total = subtotal + tax_amount, balance = 0, paid_amount = subtotal + tax_amount WHERE id=so_pos_id;
  PERFORM public.confirm_sales_order(so_pos_id);

  so_doc := public.next_sales_number(_company_id,'sale');
  INSERT INTO public.sales_orders(company_id, doc_number, customer_id, warehouse_id, pos_session_id, channel, order_date, payment_method, status, created_by)
    VALUES (_company_id, so_doc, cus2, wh_pos, pos_id, 'pos', CURRENT_DATE, 'tarjeta','borrador', uid) RETURNING id INTO so_pos_id;
  INSERT INTO public.sales_order_lines(sales_order_id, product_id, quantity, unit_price, tax_percent) VALUES
    (so_pos_id, p1, 2, 5500, 19),(so_pos_id, p5, 1, 13000, 19);
  UPDATE public.sales_orders SET
    subtotal = (SELECT COALESCE(SUM(quantity*unit_price),0) FROM public.sales_order_lines WHERE sales_order_id=so_pos_id),
    tax_amount = (SELECT COALESCE(SUM(quantity*unit_price*tax_percent/100.0),0) FROM public.sales_order_lines WHERE sales_order_id=so_pos_id)
    WHERE id=so_pos_id;
  UPDATE public.sales_orders SET total = subtotal + tax_amount, balance = 0, paid_amount = subtotal + tax_amount WHERE id=so_pos_id;
  PERFORM public.confirm_sales_order(so_pos_id);

  PERFORM public.close_pos_session(pos_id,
    (SELECT opening_amount + expected_amount FROM public.pos_sessions WHERE id=pos_id));

  DECLARE ap2 uuid; ap2_bal numeric;
  BEGIN
    SELECT id, balance INTO ap2, ap2_bal FROM public.accounts_payable
      WHERE company_id=_company_id AND supplier_id=sup2 AND balance>0 LIMIT 1;
    IF ap2 IS NOT NULL THEN
      tx_doc := public.next_treasury_number(_company_id,'pago');
      INSERT INTO public.treasury_transactions(company_id, doc_number, txn_type, bank_account_id, third_party_id, txn_date, payment_method, amount, reference, status, created_by)
        VALUES (_company_id, tx_doc, 'pago', bank_bco, sup2, CURRENT_DATE-1, 'transferencia', ap2_bal, 'Pago CxP aseo', 'borrador', uid)
        RETURNING id INTO tx_id;
      INSERT INTO public.payment_applications(treasury_txn_id, ap_id, amount) VALUES (tx_id, ap2, ap2_bal);
      PERFORM public.confirm_treasury_transaction(tx_id);
    END IF;
  END;

  DECLARE arow uuid; abal numeric;
  BEGIN
    SELECT id, balance INTO arow, abal FROM public.accounts_receivable
      WHERE company_id=_company_id AND customer_id=cus1 AND balance>0 LIMIT 1;
    IF arow IS NOT NULL THEN
      tx_doc := public.next_treasury_number(_company_id,'cobro');
      INSERT INTO public.treasury_transactions(company_id, doc_number, txn_type, bank_account_id, third_party_id, txn_date, payment_method, amount, reference, status, created_by)
        VALUES (_company_id, tx_doc, 'cobro', bank_bco, cus1, CURRENT_DATE, 'transferencia', round(abal/2,2), 'Abono cliente', 'borrador', uid)
        RETURNING id INTO tx_id;
      INSERT INTO public.payment_applications(treasury_txn_id, ar_id, amount) VALUES (tx_id, arow, round(abal/2,2));
      PERFORM public.confirm_treasury_transaction(tx_id);
    END IF;
  END;

  exp_doc := public.next_accounting_number(_company_id,'expense');
  INSERT INTO public.expenses(company_id, doc_number, supplier_id, expense_account_id, category, expense_date, due_date,
    supplier_invoice, description, subtotal, tax_amount, total, payment_method, currency, status, created_by)
    VALUES (_company_id, exp_doc, sup1, gasto_acc, 'Servicios públicos', CURRENT_DATE-3, CURRENT_DATE+12,
      'ENE-4501','Energía eléctrica local', 350000, 66500, 416500, 'credito', 'COP', 'borrador', uid)
    RETURNING id INTO exp_id;
  PERFORM public.confirm_expense(exp_id);

  exp_doc := public.next_accounting_number(_company_id,'expense');
  INSERT INTO public.expenses(company_id, doc_number, expense_account_id, category, expense_date,
    description, subtotal, tax_amount, total, payment_method, bank_account_id, currency, status, created_by)
    VALUES (_company_id, exp_doc, gasto_acc, 'Papelería', CURRENT_DATE-2,
      'Compra útiles oficina', 80000, 15200, 95200, 'transferencia', bank_bco, 'COP', 'borrador', uid)
    RETURNING id INTO exp_id;
  PERFORM public.confirm_expense(exp_id);

  pay_doc := public.next_accounting_number(_company_id,'payroll');
  INSERT INTO public.payroll_periods(company_id, doc_number, name, period_start, period_end, pay_date, frequency, status, created_by)
    VALUES (_company_id, pay_doc, 'Nómina '|| to_char(CURRENT_DATE,'YYYY-MM'), date_trunc('month',CURRENT_DATE)::date,
      (date_trunc('month',CURRENT_DATE) + interval '14 days')::date, CURRENT_DATE, 'quincenal', 'borrador', uid)
    RETURNING id INTO pay_id;
  INSERT INTO public.payroll_items(payroll_period_id, employee_id, base_salary, worked_days, bonuses, overtime,
    health_deduction, pension_deduction) VALUES
    (pay_id, emp1, 1400000, 15, 50000, 20000, round(1400000*0.04,2), round(1400000*0.04,2)),
    (pay_id, emp2, 1500000, 15, 0, 0, round(1500000*0.04,2), round(1500000*0.04,2));
  PERFORM public.liquidate_payroll_period(pay_id);

  RETURN jsonb_build_object('ok', true, 'company_id', _company_id);
END; $function$;
