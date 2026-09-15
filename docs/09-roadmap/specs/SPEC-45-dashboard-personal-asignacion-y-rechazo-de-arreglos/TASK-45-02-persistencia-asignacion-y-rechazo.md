# TASK-45-02 — Persistencia, asignación y rechazo

- Estado: `implemented` (verificado localmente y migraciones aplicadas en desarrollo el 2026-09-12; despliegue y smoke tests alojados pendientes)
- SPEC: [SPEC-45](./SPEC-45-dashboard-personal-asignacion-y-rechazo-de-arreglos.md)
- Dependencias: solicitudes/archivos de SPEC-43, membresías personal de SPEC-44 y contrato de contacto de TASK-45-01.
- Secuencia: fija esquema, capacidades, transiciones y API que consumen TASK-45-03/04.

## Resultado

Autorizar y persistir una asignación personal por orden y el rechazo compartido, con contacto del solicitante limitado a sus revisores y acceso personal limitado a órdenes abiertas asignadas.

## Alcance

- Columna/FK compuesta de responsable, índices y constraints, estado `rejected` y asignación nula al cerrar/reabrir.
- Capacidades de lectura personal, gestión de asignación y contacto del solicitante; incremento de versión del registro.
- RPC/servicio/HTTP para selector, asignar, reasignar, quitar asignación, rechazar, listar/detallar y leer archivos asignados.
- DTOs explícitos gestor/viewer/inquilino/personal y cursores versionados por audiencia/scope.
- Auditoría y versión atómicas; compatibilidad de rutas/RPC previos sin bypass de transiciones.
- Generación de invalidaciones a partir de cambios comprometidos, con entrega entre instancias conforme al contrato de TASK-45-04.

## Secuencia concreta

1. Inventariar estados/filas legacy y fijar la matriz de transición de la guía; no asignar responsables por inferencia.
2. Agregar migración posterior a SPEC-44 con FK, índice de personal y constraints coherentes con bajas de membresía y filas previas.
3. Implementar guard personal propio y selector dedicado para gestores. Validar target y scope en SQL; no sumar personal al guard de lectores internos.
4. Implementar las mutaciones con locks compatibles, `expected_version`, auditoría y no-op/reconciliación de respuesta perdida.
5. Sustituir el booleano tenant/interno por audiencias explícitas en los servicios que se amplían y separar proyecciones estrictas.
6. Integrar APIs, cursores, errores, CSRF/origen/rate limits y asociaciones exactas de archivos. Revisar todos los grants/entrypoints supervivientes.

## Criterios de cierre

- Solo owner/admin/member asignan o rechazan; una invitación pendiente, target de otro rol/organización o personal inactivo no es elegible.
- Asignar guarda responsable y `in_progress` juntos; reasignar elimina el acceso del anterior; quitar asignación guarda `open` sin responsable.
- Rechazo solo desde abierto/en proceso, con responsable nulo; reabrir solo a `open`. Estado genérico no elude invariantes.
- Personal solo lee `submitted` abiertas asignadas a su membresía actual; detalle/assets aplican el mismo guard antes de emitir datos/enlaces.
- Contacto corresponde al autor de la orden. Viewer/inquilino no reciben `requester` en DTOs, conflictos, señales ni serialización indirecta.
- Filas legacy siguen legibles internamente sin responsable/contacto inventados; drafts no son asignables ni visibles para personal.
- No-op no duplica eventos; conflicto o fallo de auditoría no deja estado/responsable parcial. Dos gestores no se sobrescriben.
- Roles browser no obtienen acceso directo a tablas/RPC; helpers privados y cursores ajenos no amplían autorización.

## Evidencia requerida

- Matriz servicio/HTTP/SQL por rol, estado de membresía, organización, propiedad, asignación y estado de orden.
- Tests reales de FK/checks/RLS/grants, pagination y DTOs; upgrade desde SPEC-44 con filas legacy.
- Concurrencia: dos asignaciones, asignación/rechazo, asignación/baja y cambio de estado/reasignación; rollback de auditoría.
- Prueba de archivos verificados y denegación por acceso directo a una orden/asset ajenos.

## Referencias

- [Guía de implementación](./IMPLEMENTATION-GUIDE.md), secciones 3–4.
- [TASK-45-03](./TASK-45-03-dashboard-personal-y-archivos.md).
- [TASK-45-04](./TASK-45-04-gestion-interna-y-actualizacion-compartida.md).

## Evidencia de entrega

Implementación y checks locales registrados en [pruebas SPEC-45](../../../06-testing/spec45-personal-assignments.md). Las dos migraciones se aplicaron y verificaron en desarrollo `multi-tenant` el 2026-09-12. El despliegue de aplicaciones y los smoke tests alojados siguen pendientes según el [runbook](../../../03-operation/spec45-personal-assignments-runbook.md).
