# TASK-46-04 — Pruebas, compatibilidad y rollout

- Estado: `pending`
- SPEC: [SPEC-46](./SPEC-46-reporte-de-trabajo-y-aceptacion-de-arreglos.md)
- Dependencias: TASK-46-01/02/03 integradas; PostgreSQL/Supabase desechable, browser y transporte de invalidaciones de SPEC-45.
- Secuencia: preparar fixtures desde el inicio y cerrar solo con el flujo completo persistido.

## Resultado

Demostrar con persistencia real que personal puede reportar trabajo y que el inquilino de la propiedad puede aceptar orden + reporte, sin romper estados, permisos, assets, propiedades o vistas existentes.

## Alcance

- `supabase/tests/spec46_setup.sql`, assertions SQL del ciclo y fixtures browser/API, si esos nombres se conservan durante la implementación.
- Organizaciones A/B, varias propiedades, dos inquilinos en una propiedad, dos personales, filas legacy y más de una página.
- Tests de upgrade desde SPEC-45, grants/RLS, DTOs, concurrencia, auditoría, idempotencia y recuperación.
- Browser para personal, inquilino, equipo y viewer en los tres viewports existentes.
- Inventario, activación compatible, evidencia separada de migración/despliegue y recuperación no destructiva.

## Matriz mínima

| Caso | Resultado verificable |
| --- | --- |
| Draft | Guarda texto válido, rechaza inválido y no cambia estado ni expone al tenant. |
| Personal marca terminado | Reporte `submitted`, orden `solved`, asignación retirada y auditoría en un commit. |
| Tenant faltante | Envío bloqueado, draft conservado y sin cambio parcial. |
| Aceptación | Tenant de la propiedad acepta ambos; reporte `accepted`, orden `archived` y etiqueta final. |
| Reintento/carrera | Doble clic, respuesta perdida y dos tenants no duplican eventos ni estados. |
| Actor inválido | Otra propiedad, organización, rol, sesión o membresía suspendida reciben rechazo seguro. |
| Bypass | Ruta genérica no archiva una orden con reporte `submitted`. |
| Legacy | Órdenes sin reporte mantienen lectura y reglas anteriores sin backfill ficticio. |
| Sincronización | Personal, tenant y equipo convergen y recuperan estado después de desconexión. |
| Regresión | SPEC-42/43/44/45, assets, propiedades, invitaciones, filtros, accesibilidad y responsive pasan. |

## Criterios de cierre

- Las pruebas ejercitan base real, RPC/servicio real y roles/grants efectivos; mocks solos no acreditan aislamiento.
- Se verifica rollback al fallar auditoría, locks sin deadlock recuperado y versiones obsoletas sin escrituras perdidas.
- Se prueban respuestas tardías, segunda página, cambio de organización/propiedad y pérdida de acceso.
- Browser usa `1280×800`, `390×844` y `320×740`, teclado/foco, consola limpia y datos sintéticos.
- La documentación distingue checks locales, migración aplicada, configuración, backend/frontend desplegados y smoke tests alojados.
- La recuperación deshabilita nuevas acciones si es necesario, preserva reportes/órdenes/auditoría y no revierte destructivamente el esquema.

## Evidencia requerida

- Comandos, resultados, entorno, fixtures, capturas y limitaciones reproducibles.
- Trazabilidad de los 15 criterios de aceptación de SPEC-46 a SQL, servicio/HTTP y browser.
- Inventario de estados/properties/memberships antes del rollout y runbook actualizado con activación y recuperación.

## Referencias

- [Guía de implementación](./IMPLEMENTATION-GUIDE.md), sección 6.
- [TASK-46-01 — Persistencia y ciclo](./TASK-46-01-persistencia-y-ciclo-de-aceptacion.md).
- [TASK-46-02 — Dashboard personal y reporte](./TASK-46-02-dashboard-personal-y-reporte.md).
- [TASK-46-03 — Aceptación y vistas compartidas](./TASK-46-03-aceptacion-del-inquilino-y-vistas-compartidas.md).
