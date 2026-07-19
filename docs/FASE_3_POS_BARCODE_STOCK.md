# Fase 3 - POS con codigo de barras y validacion de stock

Fecha: 2026-07-05

## Objetivo

Hacer que el punto de venta opere con lectura por codigo de barras/SKU y que valide stock por bodega antes de confirmar una venta.

## Cambios implementados

- El campo de busqueda del POS acepta scanner/teclado/camara que escriba el codigo y envie `Enter`.
- La busqueda exacta prioriza `barcode` y luego `sku`.
- Las tarjetas del POS muestran stock disponible por la bodega del turno.
- Los productos inventariables sin stock quedan deshabilitados en el POS.
- El carrito impide aumentar cantidades por encima del stock disponible.
- El boton `Cobrar` valida el carrito contra Supabase antes de abrir el modal de pago.
- El cobro POS usa una RPC atomica: `process_pos_sale`.

## Reglas nuevas en base de datos

- `validate_pos_stock(company_id, warehouse_id, items)`:
  - valida permiso POS/ventas,
  - valida acceso operativo a bodega,
  - calcula faltantes por producto inventariable.
- `process_pos_sale(session_id, customer_id, payment_method, items)`:
  - valida turno abierto,
  - valida permiso `pos.operate`,
  - valida stock por bodega,
  - crea venta y lineas,
  - confirma venta en la misma transaccion.

## Resultado operativo

- Si el producto es servicio, puede venderse sin stock.
- Si el producto controla inventario, no se puede cobrar si la bodega no tiene disponibilidad suficiente.
- Si dos cajeros compiten por el mismo stock, la validacion final en la RPC evita vender por encima de inventario aunque la UI estuviera desactualizada.

## Archivos principales

- `supabase/migrations/20260705213000_pos_barcode_stock_validation.sql`
- `src/routes/app.pos.tsx`

## Pendiente recomendado

- Soporte de camara nativa con libreria de barcode scanning.
- Impresion/descarga de ticket POS.
- Manejo de pagos mixtos con detalle por medio de pago.
