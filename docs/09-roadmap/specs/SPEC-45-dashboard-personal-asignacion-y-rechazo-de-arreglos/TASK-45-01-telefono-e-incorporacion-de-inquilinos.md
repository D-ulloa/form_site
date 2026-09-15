# TASK-45-01 — Teléfono e incorporación de inquilinos

- Estado: `implemented` (verificado localmente y migraciones aplicadas en desarrollo el 2026-09-12; despliegue y smoke tests alojados pendientes)
- SPEC: [SPEC-45](./SPEC-45-dashboard-personal-asignacion-y-rechazo-de-arreglos.md)
- Dependencias: invitaciones/asociación de SPEC-42, aceptación y perfiles por membresía de SPEC-44; teléfono solo en nuevos registros, confirmado en SPEC-45.
- Secuencia: entrega el contacto y su contrato de lectura a TASK-45-02; no depende de la UI de asignación.

## Resultado

Capturar el teléfono durante la primera incorporación de un inquilino y conservarlo en su membresía, disponible para revisar sus solicitudes. Los inquilinos ya incorporados mantienen su uso de solicitudes sin captura retroactiva ni bloqueo por teléfono faltante.

## Alcance

- Migración aditiva de `inquilino_contact_number`, validación compartida y tratamiento explícito de filas históricas nulas.
- Rama `inquilino_profile` de aceptación; teléfono obligatorio para nueva cuenta, cuenta existente y OAuth antes de completar incorporación.
- Persistencia atómica con membresía, propiedad, invitación/handoff y auditoría, preservando el perfil personal de SPEC-44.
- Inventario/cierre de caminos antiguos de aceptación, recuperación y cambio de rol que pudieran crear un inquilino nuevo sin teléfono.
- Compatibilidad de inquilinos previos sin teléfono: Inicio, lectura de historial, creación/envío y reactivación conservan su funcionamiento.
- Lectura privada del teléfono desde el autor de una solicitud, con nulos explícitos y sin campo de teléfono en el contexto global.

## Secuencia concreta

1. Fijar validación textual y DTO por rol de la sección 2 de la guía; distinguir incorporación inicial y recuperación/reactivación de inquilinos previos desde datos persistidos.
2. Agregar columna/check nullable e inventariar adaptadores token/handoff/recuperación vigentes después de SPEC-44.
3. Extender el núcleo SQL y los adaptadores de aceptación; probar rollback y recuperación sin sobrescribir el teléfono tras un commit perdido.
4. Conectar API y formulario de incorporación. Requerir el campo también después de Google/login; no depender del formulario de contraseña para imponerlo.
5. Verificar que inquilinos previos sin teléfono no reciben formularios/avisos obligatorios ni bloqueos de draft/submit. Rechazar una exención de registro falsificada por cliente.
6. Revisar parsers y serializaciones de membresías/gobernanza para que no divulguen la nueva columna.

## Criterios de cierre

- Teléfono validado y persistido para toda primera incorporación inquilino, incluidas invitaciones emitidas antes de la migración. Recuperación/reactivación de inquilinos previos conserva el teléfono nullable.
- Fallo de validación, propiedad o auditoría no consume la invitación ni deja perfil parcial.
- Adaptadores antiguos no evaden el requisito; recuperación de una aceptación anterior sigue funcionando y no altera el perfil.
- Inquilinos existentes sin teléfono conservan consulta, creación y envío; UI, API y SQL no imponen ese requisito retroactivamente.
- Una identidad en organizaciones A/B conserva teléfonos independientes; nombre/correo/rol/propiedad no vienen del payload de teléfono.
- Aceptaciones/reintentos concurrentes no reemplazan un dato ya guardado; valores ausentes se muestran como ausentes, sin backfill ficticio.
- Personal y los demás roles mantienen sus formularios y permisos; no se cambia el registro de owners de SPEC-41.

## Evidencia requerida

- Tests de validación, HTTP y formulario para límites, formato, trim, errores, cuenta existente y OAuth.
- SQL real: aceptación atómica, upgrade de memberships previos, grants/RLS, invitación pendiente, rollback, recuperación y scope A/B.
- Carrera entre dos aceptaciones con teléfono distinto; draft/submit permitido a inquilino previo sin teléfono, incluido borrador anterior a la migración.

## Referencias

- [Guía de implementación](./IMPLEMENTATION-GUIDE.md), sección 2.
- [TASK-45-02](./TASK-45-02-persistencia-asignacion-y-rechazo.md).
- [TASK-45-05](./TASK-45-05-pruebas-compatibilidad-y-rollout.md).

## Evidencia de entrega

Implementación y checks locales registrados en [pruebas SPEC-45](../../../06-testing/spec45-personal-assignments.md). Las dos migraciones se aplicaron y verificaron en desarrollo `multi-tenant` el 2026-09-12. El despliegue de aplicaciones y los smoke tests alojados siguen pendientes según el [runbook](../../../03-operation/spec45-personal-assignments-runbook.md).
