# Fase 6.1 - Motor contable base

## Objetivo

Fortalecer la columna vertebral contable del ERP antes de automatizar ventas, POS, compras, inventario, caja y tesoreria.

## Alcance implementado

Nueva migracion:

- `supabase/migrations/20260706090000_accounting_engine_foundation.sql`

Incluye:

- Periodos contables mensuales.
- Centros de costo.
- Tipos de comprobante contable.
- Mapeos contables para futuras automatizaciones.
- Relacion de asientos con periodo, comprobante y centro de costo.
- Validacion centralizada de asientos por RPC.
- Cierre y reapertura controlada de periodos.
- Balance de prueba y mayor auxiliar base.

## RPCs principales

- `seed_accounting_foundation(company)`: inicializa plan, comprobantes, centros y periodo actual.
- `ensure_accounting_period(company, date)`: crea o retorna periodo mensual.
- `assert_accounting_period_open(company, date)`: bloquea asientos en periodos cerrados.
- `create_journal_entry(...)`: crea asiento validado con lineas.
- `confirm_journal_entry(entry)`: confirma asiento cuadrado y con cuentas imputables.
- `close_accounting_period(period, notes)`: cierra periodo si no hay asientos borrador.
- `reopen_accounting_period(period)`: reabre periodo no bloqueado.
- `report_trial_balance(company, from, to)`: balance de prueba.
- `report_general_ledger(company, account, from, to)`: mayor auxiliar.

## Controles

- Solo `accounting.operate` puede crear, confirmar, cerrar o reabrir.
- `accounting.view` permite consultar periodos, centros, balance y libro.
- No se confirman asientos descuadrados.
- No se confirman asientos en periodos cerrados.
- Solo se aceptan cuentas activas e imputables.
- Los centros de costo se validan contra la empresa.

## UI

En `Contabilidad` se agregaron:

- Periodos contables.
- Centros de costo.
- Balance de prueba.
- Asiento manual usando RPC central.
- Menu protegido con `accounting.view`.

## Siguiente fase

Fase 6.2: integracion automatica contable.

Prioridad sugerida:

1. POS y ventas.
2. Compras y recepciones.
3. Tesoreria, cobros y pagos.
4. Inventario y costo de venta.
5. Nomina y gastos.
