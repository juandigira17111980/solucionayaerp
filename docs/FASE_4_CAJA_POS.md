# Fase 4 - Caja, pagos y cierre POS profesional

## Objetivo

Cerrar el ciclo operativo del POS despues de validar stock y vender: pagos mixtos, arqueo por medio de pago, diferencias documentadas, historial de turnos, recibo basico y reportes por turno, usuario y bodega.

## Base de datos

Nueva migracion:

- `supabase/migrations/20260705223000_pos_cash_payments_closure.sql`

Cambios principales:

- `pos_sale_payments`: registra cada medio de pago de una venta POS.
- `pos_session_closure_lines`: registra esperado, contado y diferencia por medio de pago.
- `pos_sessions.closing_notes`: observaciones del cierre.
- `sales_orders.receipt_payload`: snapshot basico para recibo/auditoria.

Funciones RPC:

- `process_pos_sale(session, customer, payments, items)`: procesa ventas con multiples pagos.
- `process_pos_sale(session, customer, payment_method, items)`: wrapper compatible con flujo anterior.
- `close_pos_session(session, counts, notes)`: cierra caja con arqueo por medio.
- `close_pos_session(session, counted)`: wrapper compatible con cierre anterior.
- `report_pos_session_summary(session)`: resumen por medio de pago para cierre e historial.
- `report_pos_sessions_history(company)`: historial auditado por turno, usuario y bodega.

## Reglas operativas

- La suma de pagos debe coincidir con el total de la venta.
- El pago a credito exige cliente.
- El efectivo de venta mixta incrementa el esperado de caja.
- El cierre guarda diferencia documentada por medio de pago.
- Los reportes respetan `pos.operate` y acceso operativo a la bodega.

## Interfaz POS

Pantalla de terminal:

- Cobro con multiples medios: efectivo, tarjeta, transferencia y credito.
- Referencia por medio de pago para voucher, banco o nota.
- Bloqueo si la suma pagada no cuadra con el total.
- Recibo basico de ultima venta con desglose de productos y pagos.

Pantalla de turnos:

- Historial de turnos POS.
- Estado abierto/cerrado.
- Ventas, contado y diferencia por turno.
- Resumen por bodega.
- Detalle por medio de pago, usuario y notas de cierre.

## Siguiente fase recomendada

Fase 5: Compras e inventario avanzado.

Prioridades:

- Recepciones parciales.
- Devoluciones de compra y venta.
- Traslados entre bodegas.
- Ajustes con motivo y autorizacion.
- Lotes, vencimientos y trazabilidad multi-bodega.
