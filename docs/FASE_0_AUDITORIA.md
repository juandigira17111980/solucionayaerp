# Fase 0 - Estabilizacion tecnica

Fecha: 2026-07-05

## Objetivo

Dejar el proyecto en una base tecnica verificable antes de iniciar cambios funcionales
mayores sobre seguridad, productos, inventario o POS.

## Estado verificado

- Stack detectado: React, TanStack Start, Vite, Supabase y Nitro/Cloudflare.
- Lock principal del repo: `bun.lock`.
- Runtime disponible en la maquina: Node.js 22 y npm.
- Bun no esta instalado localmente, por lo que la instalacion se completo con npm sin
  generar `package-lock.json` en la raiz.

## Acciones ejecutadas

- Instalacion de dependencias con `npm install --no-package-lock --prefer-offline`.
- Ajuste de `.gitignore` para excluir archivos de entorno reales.
- Creacion de `.env.example` sin valores sensibles.
- Remocion de `.env` del indice de Git sin borrar el archivo local.
- Ajuste de Prettier para tolerar finales de linea del entorno local.
- Ajuste de ESLint para separar validacion semantica de formato.
- Correccion de una violacion real de React Hooks en el modulo POS.
- Limpieza de un comentario ESLint obsoleto en la ruta de chat.

## Validaciones

- `npm ls --depth=0`: dependencias instaladas; npm reporta algunos transitivos como
  `extraneous` por instalar desde un proyecto con `bun.lock`, sin bloquear scripts.
- `npm run lint`: pasa con 0 errores y 6 warnings no bloqueantes de Fast Refresh en
  componentes UI.
- `npm run build`: pasa correctamente para cliente, SSR y Nitro.
- `npm audit`: 0 vulnerabilidades reportadas durante instalacion.

## Warnings pendientes

- Componentes UI como `button`, `badge`, `form`, `navigation-menu`, `sidebar` y `toggle`
  exportan helpers junto con componentes. ESLint lo marca como warning de Fast Refresh.
- El build advierte chunks grandes, especialmente reportes/asistente y dependencias
  pesadas como Recharts. Es optimizacion de rendimiento, no bloqueo funcional.
- Vite advierte que `vite-tsconfig-paths` podria reemplazarse por soporte nativo de Vite.

## Riesgos abiertos

- Si el `.env` versionado ya llego al remoto con credenciales reales, se deben rotar
  llaves de Supabase/Lovable y limpiar historial con un procedimiento controlado.
- El proyecto todavia no tiene una estrategia de tests automatizados.
- El lint fue ajustado para aceptar el estado MVP del codigo generado; en fases futuras
  conviene endurecer reglas por modulo conforme se estabilice el dominio.

## Siguiente fase recomendada

Fase 1: seguridad granular.

Prioridad:

1. Modelo de permisos por empresa, modulo, accion y bodega.
2. Administracion real de usuarios, roles e invitaciones.
3. Validacion de permisos en RPC/BD, no solo en frontend.
4. Menu y rutas filtradas por permisos.
5. Auditoria de cambios de usuarios, roles y permisos.
