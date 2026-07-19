# Fase 6.4 - Cierres financieros, bloqueo de periodos y reversos

## Objetivo

Evitar que el ERP modifique informacion operativa o contable en periodos cerrados, y permitir correcciones mediante reversos trazables en periodos abiertos.

## Alcance implementado

Nueva migracion:

- `supabase/migrations/20260706123000_financial_closures_period_locks.sql`

Vista actualizada:

- `src/routes/app.contabilidad.tsx`

## Bloqueo por periodo

Se agregaron triggers centralizados sobre:

- `sales_orders`
- `purchase_receipts`
- `inventory_movements`
- `treasury_transactions`
- `journal_entries`

Cada `INSERT` o `UPDATE` valida que la fecha del documento pertenezca a un periodo contable `abierto`. Si el periodo esta `cerrado` o `bloqueado`, la operacion se detiene en base de datos.

## Cierre financiero

`close_accounting_period(period, notes)` ahora valida:

- Que el periodo exista.
- Que el usuario tenga `accounting.operate`.
- Que el periodo este abierto.
- Que no existan asientos en borrador.
- Que no existan asientos confirmados descuadrados.
- Registra evento de auditoria.

## Bloqueo definitivo

`lock_accounting_period(period, notes)`:

- Cierra el periodo si aun esta abierto.
- Lo marca como `bloqueado`.
- Impide reapertura posterior.
- Registra evento de auditoria.

## Reapertura controlada

`reopen_accounting_period(period, reason)`:

- Solo aplica a periodos cerrados.
- No permite reabrir periodos bloqueados.
- Registra el motivo en la bitacora.

## Reversos controlados

`reverse_journal_entry(entry, date, reason)`:

- Solo reversa asientos confirmados.
- Crea un asiento inverso en un periodo abierto.
- No modifica el asiento original cerrado.
- Evita crear mas de un reverso activo para el mismo asiento.
- Registra evento de auditoria.

## Auditoria

Nueva tabla:

- `accounting_period_events`

Eventos principales:

- `period_closed`
- `period_locked`
- `period_reopened`
- `journal_reversed`

Reporte:

- `report_accounting_period_events(company, period)`

## UI

En Contabilidad:

- Periodos permite cerrar, reabrir y bloquear.
- Se muestra bitacora de eventos recientes.
- Libro diario permite reversar asientos confirmados.

## Consideraciones de despliegue

La migracion usa `DROP TRIGGER IF EXISTS` para reemplazar triggers por version controlada. No elimina informacion de negocio.

## Siguiente fase recomendada

Fase 7: documentos comerciales y facturacion:

1. Cotizaciones, pedidos, remisiones y facturas.
2. Numeracion por tipo de documento.
3. Impuestos y descuentos mas completos.
4. PDF/ticket formal.
5. Flujo de aprobacion y anulacion.
