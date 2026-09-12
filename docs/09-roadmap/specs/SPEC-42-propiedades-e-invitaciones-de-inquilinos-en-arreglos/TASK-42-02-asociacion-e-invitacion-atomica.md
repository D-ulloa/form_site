# TASK-42-02 — Asociación de propiedad e invitación atómica de inquilinos

- Estado: `implemented` — verificado localmente y migraciones aplicadas a la rama Supabase de desarrollo `multi-tenant` el 2026-09-12; despliegue de la aplicación pendiente.
- SPEC: [SPEC-42](./SPEC-42-propiedades-e-invitaciones-de-inquilinos-en-arreglos.md)
- Dependencias: propiedad/capacidades de `TASK-42-01`; membresías, identidad e invitaciones de SPEC-26/35/37/40 y sus correcciones vigentes.
- Paralelización: puede avanzar junto con `TASK-42-03` después de fijar los contratos; bloquea las pruebas integrales de `TASK-42-04`.

## Resultado

Generar una invitación `inquilino` vinculada a una propiedad persistida y completar su aceptación con membresía, asociación, consumo de invitación y auditoría en una única transacción. Permitir también que un administrador asocie a un inquilino activo previo sin propiedad.

## Alcance

- Referencias `arrangement_property_id` en invitaciones y membresías, o representación equivalente con una propiedad por membresía y múltiples miembros por propiedad.
- Integridad compuesta por organización y guards para nuevas incorporaciones/transiciones después del corte.
- Emisión idempotente desde propiedad usando el servicio de invitaciones, tokens y recibo manual existentes.
- Registro/resolución de invitación con propiedad validada y proyección mínima de ID/nombre.
- Aceptación transaccional para identidad nueva o existente, incluida reactivación autorizada sin sobrescribir otra propiedad.
- Rotación, reenvío/reemplazo, revocación, expiración e invalidación de handoffs que preservan la asociación correcta.
- Consulta paginada de inquilinos/invitaciones por propiedad y de candidatos activos sin propiedad.
- Asociación directa con versión esperada, permisos de gestión y auditoría.
- Compatibilidad de invitaciones generales, aceptación legacy, cambios de rol y transferencias de ownership que puedan producir `inquilino`.

## Criterios de cierre

- La invitación guarda propiedad, organización y rol antes de devolver un enlace utilizable; no crea una membresía activa.
- Solo gestores autorizados emiten/asocian. Un rechazo de propiedad, permisos o correo ocurre antes de efectos de aprovisionamiento de identidad.
- El flujo fija `inquilino` server-side y valida la propiedad dentro de la organización; el invitado no puede sustituir ninguno de esos datos.
- Una identidad existente sin membresía en la organización puede aceptar sin duplicar cuenta; una membresía activa no cambia de rol mediante una invitación.
- Registro y aceptación rechazan una invitación inquilino sin propiedad válida. El registro de Auth sigue separado de la incorporación y no crea una membresía a medias.
- La aceptación guarda membresía activa con su propiedad, consumo de invitación/handoff y auditoría atómicamente. Un fallo inyectado revierte todas esas escrituras.
- Múltiples inquilinos pueden compartir propiedad; cada membresía tiene una sola propiedad dentro de su organización y no se modifica su identidad global.
- Reintentos y carreras no duplican invitaciones válidas o asociaciones ni reasignan a otra propiedad silenciosamente.
- Rotación/reemplazo conserva propiedad/rol, revocación y expiración bloquean la aceptación, y los handoffs anteriores dejan de servir cuando corresponde.
- Un enlace perdido se recupera mediante rotación explícita. No se almacenan tokens/enlaces crudos para reproducir una respuesta.
- Un inquilino activo previo sin propiedad se puede asociar con versión esperada. Mismo destino es seguro; otra propiedad o una versión incompatible produce conflicto sin mutación.
- Asociación directa no cambia rol ni reactiva membresías. Una reactivación por invitación no sobrescribe una referencia previa distinta.
- Los caminos generales/legacy y las transiciones hacia `inquilino` requieren propiedad o rechazan la operación antes de cambiar la membresía; no existe un bypass desde RPC anteriores.
- Los roles de otras invitaciones conservan su comportamiento y no reciben una propiedad implícita.
- Las filas previas sin propiedad se conservan y se identifican para asociación/reemplazo explícitos. Suspensión/remoción conserva referencia sin conservar acceso.
- Las respuestas para lectura limitada y para invitado no exponen otros inquilinos, tokens, metadatos internos ni datos ajenos.

## Evidencia requerida para cierre

- Pruebas unitarias/HTTP de emisión, registro, aceptación, asociación directa, validación de campos y límites de capacidades.
- Pruebas de PostgreSQL real sobre FKs, varias membresías por propiedad, aislamiento A/B y las entradas ejecutables de aceptación.
- Pruebas transaccionales de fallo de asociación/auditoría y concurrencia entre aceptación, revocación, asociación y suspensión.
- Pruebas de compatibilidad con invitación general, rol por PATCH, transferencia de ownership, último owner y filas legacy sin propiedad.
- Demostración de recuperación de pérdida de respuesta sin duplicación, exposición de token ni reactivación posterior indebida.
- Contratos definitivos de proyecciones/errores y resultados reproducibles enlazados desde la evidencia de SPEC-42.

## Referencias

- [Evidencia local y comandos reproducibles](../../../06-testing/spec42-property-invitations.md): suites backend/frontend, SQL real, seis carreras y recorrido browser con persistencia.
- [Runbook de migración, filas legacy y recuperación](../../../03-operation/spec42-property-invitations-runbook.md). El inventario y ambas migraciones se completaron en desarrollo; el despliegue y los smoke tests alojados permanecen pendientes. [Evidencia de la migración](../../../06-testing/spec42-property-invitations.md#development-migration--2026-09-12).

- [Guía de implementación](./IMPLEMENTATION-GUIDE.md), secciones 2 a 4 y 7.
- [TASK-42-01](./TASK-42-01-propiedades-minimas-y-api.md).
- [TASK-42-04](./TASK-42-04-pruebas-compatibilidad-y-rollout.md).
