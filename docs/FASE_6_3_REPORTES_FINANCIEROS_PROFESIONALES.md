# Fase 6.3 - Reportes financieros profesionales

## Objetivo

Convertir la contabilidad generada por el ERP en informacion financiera consultable, trazable y auditable.

## Alcance implementado

Nueva migracion:

- `supabase/migrations/20260706113000_professional_financial_reports.sql`

Vista actualizada:

- `src/routes/app.contabilidad.tsx`

## Reportes SQL

- `report_financial_position(company, to)`: balance general a una fecha de corte.
- `report_income_statement(company, from, to)`: estado de resultados por periodo.
- `report_journal_book(company, from, to, source_type)`: libro diario detallado por origen.
- `report_account_ledger(company, account, from, to)`: mayor por cuenta con saldo inicial.
- `report_third_party_ledger(company, third_party, from, to)`: auxiliar por tercero y cuenta.
- `report_ar_ap_reconciliation(company, to)`: conciliacion entre CxC/CxP operativo y contabilidad.

## UI agregada en Contabilidad

- Estados financieros.
- Libro diario mejorado.
- Mayor por cuenta.
- Auxiliares por tercero.
- Conciliacion CxC/CxP.

## Controles

- Todos los reportes requieren `accounting.view`.
- Los reportes se basan en asientos confirmados.
- Balance general incluye utilidad acumulada del ejercicio.
- Estado de resultados separa ingresos, costos, gastos, utilidad bruta y utilidad operacional.
- Conciliacion compara saldos operativos contra cuentas contables base `1305` y `2205`.

## Consideraciones

- Los reportes dependen de que Fase 6.2 genere asientos automaticos correctamente.
- Las conciliaciones por tercero requieren que los asientos automaticos incluyan `third_party_id`.
- En una siguiente fase conviene agregar exportacion a Excel/PDF y filtros avanzados por centro de costo, bodega y comprobante.

## Siguiente fase recomendada

Fase 6.4: cierres financieros y bloqueo de periodos.

Prioridad:

1. Cierre mensual formal.
2. Validacion de asientos descuadrados o borradores.
3. Bloqueo operativo de ventas/compras/tesoreria/inventario en periodos cerrados.
4. Reversos controlados.
5. Bitacora/auditoria de cierre.
