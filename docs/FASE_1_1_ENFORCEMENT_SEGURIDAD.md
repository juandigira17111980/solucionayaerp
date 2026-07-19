# Fase 1.1 - Enforcement real de seguridad granular

## Objetivo

Hacer que los permisos creados en Fase 1 se apliquen en la operacion real del ERP:

- Menu lateral por permisos.
- Bloqueo de rutas por URL directa.
- Acciones criticas ocultas si el usuario no tiene permiso operativo.
- Endpoint IA protegido por `ai.use`.
- RLS por modulo y acceso por bodega en tablas criticas.

## Frontend

Se crearon:

- `src/lib/permissions.ts`: catalogo tipado de permisos y mapa ruta -> permiso.
- `src/hooks/use-permissions.tsx`: carga permisos efectivos con `get_my_permissions`.
- `src/components/erp/permission-gate.tsx`: componentes `Can` y `PermissionGate`.

Se aplico enforcement en:

- `src/routes/app.tsx`: menu filtrado y bloqueo de rutas.
- `src/routes/app.ventas.tsx`: crear/confirmar ventas requiere `sales.operate`.
- `src/routes/app.compras.tsx`: crear ordenes, crear recepciones y confirmar recepciones requiere `purchases.operate`.
- `src/routes/app.inventarios.tsx`: crear/confirmar/anular movimientos y crear lotes requiere `inventory.operate`.
- `src/routes/api/chat.ts`: el endpoint del asistente exige `ai.use`.

## Base de datos

Se agrego la migracion:

- `supabase/migrations/20260705182500_enforce_granular_permissions.sql`

Incluye:

- RPC `get_my_permissions(_company_id)` para obtener permisos efectivos.
- Reemplazo de policies heredadas basadas solo en membresia por policies basadas en:
  - permiso de lectura del modulo;
  - permiso operativo del modulo;
  - acceso granular a bodega con `can_access_warehouse`.

Tablas endurecidas:

- Bodegas.
- Productos, categorias, marcas y terceros.
- Stock, movimientos, lineas de movimiento y kardex.
- Ordenes y recepciones de compra.
- Ordenes de venta y lineas.
- Sesiones POS.
- CxC y CxP.

## Criterio de seguridad

Los permisos de lectura no autorizan mutacion. Las acciones operativas usan permisos `*.operate` o `*.manage`.

El acceso por bodega se aplica en stock, kardex, movimientos, compras, ventas y POS cuando la tabla tiene `warehouse_id` o bodegas origen/destino.

## Pendiente tecnico controlado

Algunas RPC `SECURITY DEFINER` historicas siguen existiendo y deben revisarse en la siguiente subfase para cambiar sus validaciones internas de `is_company_member` a `has_permission`.

Prioridad alta:

- `report_*`: exigir `reports.view`.
- `confirm_sales_order`: exigir `sales.operate` o `pos.operate`.
- `confirm_inventory_movement`: exigir `inventory.operate`.
- `confirm_purchase_receipt`: exigir `purchases.operate`.
- `close_pos_session`: exigir `pos.operate`.

La app ya bloquea esas rutas/acciones desde frontend y RLS cubre tablas criticas, pero para produccion estricta se debe cerrar tambien cada RPC `SECURITY DEFINER`.

Estado: abordado en `docs/FASE_1_2_HARDENING_RPCS.md` mediante la migracion `supabase/migrations/20260705192000_harden_security_definer_rpcs.sql`.

## Nota de arquitectura Lovable/VPS

Esta fase fue implementada sobre el stack actual del repo: React/TanStack + Supabase.

Con la decision aclarada, el objetivo no es Laravel. El objetivo es Lovable + VPS. Por tanto, esta fase sigue siendo valida como parte del stack actual: Lovable/TanStack/Supabase, preparando el proyecto para que luego pueda desplegarse en un VPS limpio.

La preparacion VPS debe hacerse sin romper compatibilidad con Lovable y sin introducir otro framework backend por defecto.

Referencia: `docs/DECISION_ARQUITECTURA_LOVABLE_VPS.md`.

## Validacion

- `npm run lint`: OK.
- `npm run build`: OK.
