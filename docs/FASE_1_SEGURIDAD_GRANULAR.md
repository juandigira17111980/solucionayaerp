# Fase 1 - Seguridad granular

Fecha: 2026-07-05

## Objetivo

Agregar una base profesional de seguridad para operar el ERP como sistema
multiempresa y multibodega, con permisos granulares por modulo, accion, usuario
y bodega.

## Alcance implementado

- Catalogo central de permisos (`permissions`).
- Permisos por rol (`role_permissions`).
- Excepciones directas por usuario (`user_permissions`), con soporte para
  permitir o denegar permisos especificos.
- Acceso por bodega/punto de venta (`user_warehouse_access`) con niveles
  `can_view` y `can_operate`.
- Invitaciones funcionales (`security_invitations`) para controlar altas de
  usuarios sin crear credenciales desde el cliente.
- Funciones seguras:
  - `can_manage_company_security(company_id)`
  - `has_permission(user_id, company_id, permission_code)`
  - `can_access_warehouse(user_id, company_id, warehouse_id, operate)`
  - `log_security_event(company_id, action, entity, entity_id, changes)`
- Pantalla `/app/seguridad` convertida en panel operativo.

## Decisiones de seguridad

- No se modifica el flujo de login/auth.
- No se crean usuarios de Supabase Auth desde el cliente.
- `super_admin` queda reservado como rol global. No debe asignarse como rol de
  empresa desde la UI.
- La administracion de seguridad requiere rol `admin`, rol `super_admin` o
  permiso directo `security.manage`.
- Las funciones `SECURITY DEFINER` validan `auth.uid()` y pertenencia antes de
  exponer datos o ejecutar operaciones.

## Modelo de permisos base

Los permisos siguen el formato:

```text
modulo.accion
```

Ejemplos:

- `security.manage`
- `warehouses.manage`
- `inventory.operate`
- `sales.operate`
- `pos.operate`
- `reports.view`

## Flujo de autorizacion

1. Si el usuario no pertenece a la empresa, no tiene permiso.
2. Si el usuario tiene `super_admin` global, puede todo.
3. Si existe una excepcion directa con `effect=false`, se deniega.
4. Si existe una excepcion directa con `effect=true`, se permite.
5. Si algun rol del usuario tiene el permiso por plantilla global o por empresa,
   se permite.
6. Si nada aplica, se deniega.

## Pantalla de Seguridad

La pantalla permite:

- Ver miembros de la empresa.
- Asignar roles por empresa.
- Ver catalogo de permisos por modulo.
- Crear excepciones por usuario.
- Asignar acceso por bodega.
- Registrar invitaciones.
- Registrar eventos en `audit_logs` usando `log_security_event`.

## Pendiente para cerrar seguridad de punta a punta

Esta fase crea la base. La siguiente capa es aplicar estos permisos en cada
modulo:

- Filtrar menu lateral por permisos.
- Bloquear rutas si falta permiso.
- Ajustar policies/RPC de inventario, ventas, compras, POS, tesoreria y
  contabilidad para validar `has_permission`.
- Aplicar `can_access_warehouse` en POS, inventario, ventas y compras.
- Crear pruebas QA por rol.

## Riesgos abiertos

- Las policies antiguas basadas en `is_company_member` siguen existiendo para no
  romper el MVP. Deben endurecerse modulo por modulo.
- El rol `admin` conserva mucho poder operativo. En una fase posterior conviene
  diferenciar administrador de empresa vs administrador del sistema.
- Las invitaciones registran intencion operativa, pero aun no envian email ni
  crean usuarios auth automaticamente.
