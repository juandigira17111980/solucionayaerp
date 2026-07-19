# Fase 5 - Compras e inventario avanzado

## Objetivo

Fortalecer compras e inventario multi-bodega sin duplicar el modelo existente: recepciones con lote/vencimiento, devoluciones, traslados, ajustes documentados y trazabilidad desde kardex.

## Base de datos

Nueva migracion:

- `supabase/migrations/20260705233000_purchases_inventory_advanced.sql`

Cambios principales:

- `purchase_receipt_lines.lot_code`, `expires_at`, `lot_id`.
- `inventory_movements.source_module`, `source_id`, `reason`.
- Indices para trazabilidad por lote, producto, bodega y origen documental.

RPCs nuevos o reforzados:

- `ensure_product_lot`: crea o reutiliza lote por producto.
- `create_inventory_movement_advanced`: crea movimientos con validacion de permisos, bodega, producto, lote y confirmacion opcional.
- `confirm_purchase_receipt`: version reforzada que crea lotes desde la recepcion y pasa lote al kardex.
- `create_purchase_return`: registra devolucion de compra como salida controlada de inventario.
- `report_inventory_trace`: reporte de trazabilidad por producto, bodega y lote.

## Controles operativos

- Los ajustes requieren motivo documentado.
- Los movimientos criticos pasan por RPC y no por insercion directa desde frontend.
- Las recepciones pueden capturar lote y vencimiento por linea.
- Las devoluciones salen desde la bodega de recepcion y validan stock por la funcion de inventario.
- La trazabilidad se consulta desde kardex, respetando permiso `inventory.view` y acceso a bodega.

## Interfaz

Inventarios:

- Nuevo movimiento usa RPC avanzado.
- Captura lote, vencimiento y serial por linea.
- Motivo obligatorio para ajustes.
- Nueva pestana de trazabilidad multi-bodega.

Compras:

- Recepciones con lote y vencimiento por linea.
- Devolucion desde recepcion confirmada.

## Alcance pendiente recomendado

Para una fase posterior:

- Nota credito proveedor ligada a devolucion.
- Estados de devolucion formal por documento.
- Autorizacion de ajustes por rol o doble aprobacion.
- Stock por lote separado fisicamente, no solo kardex por lote.
- Politicas ABC-XYZ, punto de reorden y sugerido automatico por bodega.
