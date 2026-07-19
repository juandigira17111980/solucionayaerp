# Fase 7 - Documentos comerciales y facturacion

## Objetivo

Formalizar el flujo comercial previo y posterior a la venta:

- Cotizaciones.
- Pedidos.
- Remisiones.
- Facturas.
- Numeracion documental por empresa y tipo.
- Payload de impresion para PDF/ticket.
- Conversion documental controlada.
- Anulaciones con motivo y bitacora.

## Modelo operativo

Los documentos comerciales viven en `commercial_documents` y sus lineas en `commercial_document_lines`.

La numeracion es independiente por empresa y tipo:

- `COT-000001` para cotizaciones.
- `PED-000001` para pedidos.
- `REM-000001` para remisiones.
- `FAC-000001` para facturas comerciales.

Cada documento tiene estado:

- `borrador`: editable/pendiente de emitir.
- `emitido`: documento formalizado.
- `convertido`: ya genero el siguiente documento del flujo.
- `anulado`: cancelado con motivo.

## Flujo soportado

Conversiones permitidas:

- Cotizacion a pedido.
- Cotizacion a factura.
- Pedido a remision.
- Pedido a factura.
- Remision a factura.

Las cotizaciones, pedidos y remisiones no mueven inventario ni contabilidad por si solas. Esto evita duplicar movimientos antes de la factura.

Cuando una factura comercial se emite, el sistema crea una `sales_order`, inserta sus lineas y llama `confirm_sales_order`. Ese flujo ya valida:

- Permisos granulares de venta.
- Acceso operativo a bodega.
- Periodo contable abierto.
- Producto vendible.
- Stock por bodega para productos con inventario.
- Salida de inventario.
- CxC cuando el pago es credito.
- Asiento contable automatico.

## Seguridad y cierres

La fase respeta el modelo Lovable + VPS:

- SQL versionado como migracion Supabase/Postgres.
- Sin secretos embebidos.
- RLS por empresa, permiso y bodega.
- RPCs `SECURITY DEFINER` con `search_path = public`.
- Bloqueo por periodo contable usando `assert_period_open_for_operation`.
- Sin reescritura de historial Git.

Permisos aplicados:

- `sales.view`, `sales.operate` y `reports.view` para consulta.
- `sales.operate` para crear, emitir, convertir y anular.

## Impresion PDF/ticket

`get_commercial_document_payload(document_id)` entrega un JSON estructurado con:

- Datos de empresa.
- Datos de cliente.
- Bodega.
- Encabezado documental.
- Lineas.
- Totales.
- Notas y terminos.

La interfaz muestra una vista imprimible basica desde Ventas > Documentos. Ese payload queda listo para una fase posterior de PDF formal con plantilla empresarial, logo, resolucion DIAN si aplica y formato POS/tamano carta.

## Anulaciones

Se permite anular documentos `borrador` o `emitido` que no hayan creado venta confirmada.

Si una factura ya creo una venta, la anulacion directa se bloquea. Ese caso debe manejarse con nota credito o reverso controlado para no romper inventario, CxC ni contabilidad.

## Siguiente mejora recomendada

Fase 7.1: facturacion fiscal avanzada:

- Plantillas PDF profesionales por tipo documental.
- Parametrizacion de prefijos y rangos.
- Resoluciones fiscales por empresa.
- Nota credito y nota debito.
- Reverso fiscal/contable completo.
- Email/WhatsApp de documentos.
- Auditoria de cambios de lineas antes de emitir.
