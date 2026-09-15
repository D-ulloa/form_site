# TASK-45-05 — Pruebas, compatibilidad y rollout

- Estado: `implemented` (verificado localmente y migraciones aplicadas en desarrollo el 2026-09-12; despliegue y smoke tests alojados pendientes)
- SPEC: [SPEC-45](./SPEC-45-dashboard-personal-asignacion-y-rechazo-de-arreglos.md)
- Dependencias: TASK-45-01/02/03/04 integradas; PostgreSQL/Supabase desechable, browser y verificación de dependencias de assets en el entorno de entrega.
- Secuencia: preparar fixtures temprano; cerrar solo con el flujo completo comprobado y decisiones de producto reflejadas consistentemente en los documentos y la implementación.

## Resultado

Demostrar que registro/teléfono, asignación/rechazo, visibilidad personal y actualización del inquilino cumplen SPEC-45 con persistencia real, sin confundir evidencias locales y despliegue.

## Alcance

- Harnesses implementados: `supabase/tests/spec45_setup.sql`, `spec45_personal_assignments.sql` y `spec45_browser_fixtures.sql`; suite de upgrade y conexiones concurrentes en backend.
- Fixtures de organizaciones A/B, varias propiedades, dos inquilinos en una propiedad, dos personales en A y otro en B, miembros inactivos, invitación pendiente, solicitudes legacy y más de una página de datos.
- Pruebas browser para incorporación/contacto, gestor, inquilino y personal con sesiones separadas y API/RPC reales.
- Evidencia local en `docs/06-testing/spec45-personal-assignments.md`; runbook en `docs/03-operation/spec45-personal-assignments-runbook.md`.
- Migración aditiva, activación compatible, inventario de datos y recuperación que preserve información.

## Matriz mínima

| Caso | Resultado verificable |
| --- | --- |
| Nueva cuenta, cuenta existente y Google | Primera incorporación inquilino exige teléfono y guarda perfil/propiedad/consumo juntos. |
| Invitación pendiente y adaptador antiguo | No evaden teléfono; recuperación de commits anteriores mantiene identidad y datos. |
| Inquilino previo sin teléfono | Historial, creación/envío y reactivación disponibles sin formulario ni bloqueo retroactivo. |
| Identidad en A/B | Teléfonos y membresías independientes; registrar A no modifica B. |
| Gestor asigna | Una sola orden, responsable activo de A, `in_progress` y auditoría en el mismo commit. |
| Target inválido | Personal inactivo, invitación pendiente, otro rol o B rechazados. |
| Personal 1/2 | Cada uno ve solo sus órdenes; conocer una propiedad/ID/cursor no concede otras. |
| Contactos por audiencia | Gestor y personal asignado ven al autor; viewer/co-inquilinos no reciben PII. |
| Reasignar/quitar/cerrar | Acceso anterior revocado en lista, detalle, señales y nuevos enlaces. |
| Rechazar/reabrir | `rejected` sin responsable, visible al inquilino; reapertura a `open` sin asignación. |
| Concurrencia/auditoría | Conflicto recuperable y rollback completo, sin doble responsable ni estado parcial. |
| Dos gestores versus baja | Serialización válida, target revalidado y ausencia de deadlock no recuperado. |
| Tres sesiones visibles | Convergencia automática de estado/asignación en el umbral propuesto. |
| Desconexión/contexto/respuesta tardía | Recuperación canónica sin reponer contactos u órdenes revocadas. |
| Archivos | Asociación exacta/verificada, permiso por asignación y TTL real documentado. |
| Upgrade y regresiones | Datos existentes preservados; invitaciones, propiedades, roles, shell y assets mantienen sus garantías. |

## Criterios de cierre

- Ejecutar matriz sobre base real, incluyendo grants/RLS bajo roles browser y acceso privilegiado por adaptadores de servicio; mocks solos no acreditan denegaciones.
- Upgrade desde SPEC-44 y pruebas de rollback no inventan contactos/responsables ni modifican migraciones anteriores.
- Ejecutar checks generales de la guía y regresiones SPEC-40/42/43/44; actualizar únicamente las expectativas expresamente sustituidas por SPEC-45.
- Browser en `1280×800`, `390×844`, `320×740`, con teclado/foco, consola limpia y sin overflow; usar datos sintéticos.
- Registrar latencia de actualización entre sesiones, reconexión, segunda página cargada y funcionamiento entre instancias del backend.
- Comparar historia migratoria del destino antes de aplicar cambios; documentar conteos agregados sin teléfonos, correos, credenciales o URLs firmadas.
- Desplegar lectores compatibles con los cinco estados antes de habilitar rechazo y activar la captura obligatoria cuando onboarding/API estén listos.
- Cualquier gate heredado de SPEC-31/POL-09 y prueba de Storage alojado permanece explícito hasta verificarse; no se acredita por esta redacción o por un fixture local.
- Evidencia distingue checks locales, migración aplicada, configuración, backend/frontend desplegados y smoke test alojado. No marcar como ejecutado lo pendiente.
- Recuperación deshabilita acciones nuevas si es necesario, mantiene lectura de `rejected` y conserva órdenes, contacto y auditoría; no revierte destructivamente el esquema.

## Evidencia requerida

- Comandos/resultados/entornos reproducibles, capturas sintéticas y limitaciones reales en la documentación de pruebas.
- Trazabilidad desde los 14 criterios de aceptación de SPEC-45 a tests SQL, servicio/HTTP y browser.
- Matriz de grants/RPC ejecutables, decisiones finales de producto y guía de activación/recuperación revisada.

## Referencias

- [Guía de implementación](./IMPLEMENTATION-GUIDE.md), sección 7.
- [TASK-45-01](./TASK-45-01-telefono-e-incorporacion-de-inquilinos.md).
- [TASK-45-02](./TASK-45-02-persistencia-asignacion-y-rechazo.md).
- [TASK-45-03](./TASK-45-03-dashboard-personal-y-archivos.md).
- [TASK-45-04](./TASK-45-04-gestion-interna-y-actualizacion-compartida.md).

## Evidencia de entrega

Implementación y checks locales registrados en [pruebas SPEC-45](../../../06-testing/spec45-personal-assignments.md). Las dos migraciones se aplicaron y verificaron en desarrollo `multi-tenant` el 2026-09-12. El despliegue de aplicaciones y los smoke tests alojados siguen pendientes según el [runbook](../../../03-operation/spec45-personal-assignments-runbook.md).
