# Fase 6.2 - Integracion contable automatica

## Objetivo

Conectar los movimientos operativos confirmados con asientos contables automaticos, controlados e idempotentes.

## Alcance implementado

Nueva migracion:

- `supabase/migrations/20260706103000_accounting_automation_integration.sql`

Integra:

- POS y ventas.
- Compras y recepciones.
- Tesoreria: cobros, pagos, transferencias y ajustes.
- Inventario: ajustes y movimientos manuales con impacto de valor.

## Diseno tecnico

La integracion usa una capa central:

- `accounting_account_mappings`: mapeos configurables por empresa.
- `ensure_accounting_automation_defaults`: crea mapeos base si no existen.
- `resolve_accounting_account`: resuelve cuenta por clave y fallback PUC.
- `create_system_journal_entry`: genera asiento confirmado sin exigir permiso contable al usuario operativo.

Los asientos son idempotentes por:

- `journal_entries.company_id`
- `journal_entries.source_type`
- `journal_entries.source_id`

Si ya existe un asiento no anulado para el origen, la funcion retorna el asiento existente y no duplica contabilidad.

## Mapeos base

- `cash.efectivo` -> `1105`
- `cash.tarjeta` -> `1110`
- `cash.transferencia` -> `1110`
- `ar.customers` -> `1305`
- `inventory.stock` -> `1435`
- `ap.suppliers` -> `2205`
- `tax.payable` -> `2408`
- `sales.revenue` -> `4135`
- `expense.default` -> `5195`
- `cogs.merchandise` -> `6135`

## Reglas contables base

Ventas/POS:

- Debita caja, bancos o clientes segun medio de pago.
- Acredita ingresos y, si aplica, impuestos.
- Registra costo de venta contra inventario cuando el producto controla stock.
- Los servicios facturan ingreso, pero no mueven inventario ni costo de inventario.

Compras:

- Debita inventario para productos con stock.
- Debita gasto base para servicios o consumos sin stock.
- Acredita proveedores.

Tesoreria:

- Cobros: debita caja/banco y acredita CxC o ingreso no aplicado.
- Pagos: debita CxP o gasto no aplicado y acredita caja/banco.
- Transferencias: debita cuenta destino y acredita cuenta origen.
- Ajustes: registra contrapartida de ingreso o gasto.

Inventario:

- Ajustes positivos: debitan inventario y acreditan contrapartida.
- Ajustes negativos/salidas manuales: debitan gasto y acreditan inventario.
- Traslados no generan asiento porque no cambian el valor contable total.
- Movimientos originados por ventas o compras no se duplican: quedan contabilizados desde venta/compra.

## Controles

- Los usuarios operativos no necesitan `accounting.operate` para generar asientos automaticos.
- Ventas/POS requieren `sales.operate` o `pos.operate`.
- Compras requieren `purchases.operate`.
- Tesoreria requiere `treasury.operate`.
- Inventario requiere `inventory.operate`.
- El periodo contable debe estar abierto.
- Las cuentas deben estar activas e imputables.
- No se permite generar asientos descuadrados.

## Siguiente fase

Fase 6.3: reportes financieros profesionales:

1. Balance general.
2. Estado de resultados.
3. Libro diario filtrable.
4. Mayor por cuenta.
5. Auxiliares por tercero.
6. Conciliacion CxC/CxP contra asientos.
