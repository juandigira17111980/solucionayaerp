# Fase 2 - Modelo profesional de productos

Fecha: 2026-07-05

## Objetivo

Separar el catalogo en tres comportamientos operativos:

- Producto: se vende, se compra y controla inventario.
- Servicio: se vende o compra, pero no genera stock, kardex ni movimientos de inventario.
- Producto de consumo: se compra y controla inventario; queda no vendible por defecto para uso interno.

## Cambios implementados

- Se agrego `product_type` con valores `physical`, `service`, `consumable`.
- Se agregaron banderas operativas:
  - `tracks_inventory`
  - `is_sellable`
  - `is_purchasable`
- Se agrego constraint para impedir inconsistencias:
  - servicios siempre `tracks_inventory = false`
  - productos y consumibles siempre `tracks_inventory = true`
- Ventas y POS solo cargan productos vendibles.
- Compras solo carga productos comprables.
- Inventarios, kardex y lotes solo cargan productos que controlan inventario.

## Reglas criticas en base de datos

- `confirm_inventory_movement` rechaza cualquier linea cuyo producto no controle inventario.
- `confirm_sales_order` permite vender servicios sin crear salida de inventario.
- `confirm_sales_order` crea movimiento de inventario solo para lineas con `tracks_inventory = true`.
- `confirm_purchase_receipt` genera CxP para servicios, pero solo crea entrada de inventario para productos inventariables.
- Reportes de bajo stock y sugerencias de reorden excluyen servicios.

## Impacto operativo

- Una venta mixta de productos y servicios confirma correctamente.
- Una venta solo de servicios confirma sin movimiento de inventario.
- Una compra/recepcion de servicios afecta CxP, pero no stock.
- Un movimiento manual de inventario nunca puede usar servicios.

## Archivos principales

- `supabase/migrations/20260705201000_product_types_inventory_rules.sql`
- `src/routes/app.productos.tsx`
- `src/routes/app.ventas.tsx`
- `src/routes/app.pos.tsx`
- `src/routes/app.compras.tsx`
- `src/routes/app.inventarios.tsx`
- `src/integrations/supabase/types.ts`

## Pendiente recomendado

La siguiente fase natural es POS/barcode:

- lectura por codigo de barras desde teclado/scanner/camara,
- busqueda exacta por barcode antes de busqueda difusa,
- control visual de stock disponible por bodega,
- validacion previa de stock para productos inventariables antes de confirmar.
