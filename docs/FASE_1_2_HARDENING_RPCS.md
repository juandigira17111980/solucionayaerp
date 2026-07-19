# Fase 1.2 - Hardening de RPC SECURITY DEFINER

## Objetivo

Cerrar la superficie de seguridad que quedaba pendiente despues de Fase 1.1: funciones `SECURITY DEFINER` que podian ejecutarse con validaciones demasiado amplias basadas solo en membresia de empresa.

El objetivo es que la base de datos valide permisos granulares aunque alguien intente llamar una RPC directamente.

## Migracion

Archivo:

- `supabase/migrations/20260705192000_harden_security_definer_rpcs.sql`

## Funciones auxiliares

Se agregaron:

- `assert_has_permission(_company_id, _permission_code)`
- `assert_any_permission(_company_id, _permission_codes)`

Ambas validan `auth.uid()` y permisos efectivos mediante `has_permission`.

## RPC endurecidas

### Operacion

- `confirm_inventory_movement`
  - Requiere `inventory.operate`.
  - Permite flujo interno controlado desde ventas/POS si el movimiento viene de venta (`VT ...`) y el usuario tiene `sales.operate` o `pos.operate`.
  - Permite flujo interno controlado desde compras si el movimiento viene de recepcion (`REC ...`) y el usuario tiene `purchases.operate`.
  - Valida acceso operativo a bodegas origen/destino.

- `confirm_sales_order`
  - Requiere `sales.operate` o `pos.operate`.
  - Valida acceso operativo a la bodega de venta.

- `close_pos_session`
  - Requiere `pos.operate`.
  - Valida acceso operativo a la bodega del turno.

- `confirm_purchase_receipt`
  - Requiere `purchases.operate`.
  - Valida acceso operativo a la bodega de recepcion.

### Reporteria / BI

Todas estas RPC ahora exigen `reports.view`:

- `report_sales_summary`
- `report_sales_by_day`
- `report_top_products`
- `report_top_customers`
- `report_purchases_summary`
- `report_inventory_value`
- `report_low_stock`
- `report_cashflow_by_day`
- `report_ar_aging`
- `report_ap_aging`
- `report_expenses_by_category`
- `report_pnl`
- `report_reorder_suggestions`
- `report_smart_alerts`

## Correccion incluida

Se ajusto `report_purchases_summary` para usar estados reales del enum de compras:

- `aprobada`
- `parcial`
- `recibida`

El estado `confirmada` no corresponde a `purchase_order_status`.

## Criterio de seguridad

- La membresia de empresa ya no es suficiente para ejecutar RPC criticas.
- Las operaciones transaccionales exigen permisos `*.operate`.
- Los reportes gerenciales exigen `reports.view`.
- Las operaciones con inventario validan bodega cuando aplica.

## Validaciones realizadas

- Busqueda de patrones peligrosos en la migracion:
  - Sin `DELETE FROM`.
  - Sin `TRUNCATE`.
  - Sin `DROP POLICY`.
  - Solo `CREATE OR REPLACE FUNCTION`, `GRANT` y `REVOKE` controlados.
- Busqueda de referencias heredadas:
  - Sin `is_company_member(auth.uid())` dentro de la nueva migracion.
  - Sin `tp.name` / `third_parties.name` inexistente.

## Pendiente

Antes de aplicar en produccion:

- Ejecutar la migracion en staging/Supabase.
- Probar con usuarios que tengan:
  - solo lectura;
  - operacion de ventas;
  - operacion de compras;
  - operacion de inventario;
  - reportes;
  - POS.
