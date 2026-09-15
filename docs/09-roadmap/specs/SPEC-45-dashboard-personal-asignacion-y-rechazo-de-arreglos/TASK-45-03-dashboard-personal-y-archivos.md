# TASK-45-03 — Dashboard personal y archivos asignados

- Estado: `implemented` (verificado localmente y migraciones aplicadas en desarrollo el 2026-09-12; despliegue y smoke tests alojados pendientes)
- SPEC: [SPEC-45](./SPEC-45-dashboard-personal-asignacion-y-rechazo-de-arreglos.md)
- Dependencias: contratos/proyecciones de TASK-45-02, contacto de TASK-45-01 y shell/ruta exclusivos de SPEC-44.
- Secuencia: puede avanzar junto a TASK-45-04 una vez fijados los contratos; su cierre exige conectar la actualización compartida de esa tarea.

## Resultado

Mostrar al personal sus órdenes abiertas asignadas y los datos necesarios para revisarlas, con descripción, propiedad, contacto del autor y archivos privados.

## Alcance

- Sección `Mis órdenes asignadas` en `/t/:organizationSlug/personal`, conservando `Inicio` y el shell existente.
- Listado paginado y detalle con DTO personal; nombre/correo/teléfono del solicitante con datos faltantes explícitos.
- Archivos bajo demanda mediante ruta personal y autorización de la orden asignada.
- Carga, vacío, error, reintento, reconexión y limpieza ante pérdida de acceso o cambio de contexto.
- Reutilización de presentación sin heredar acciones/capacidades internas.

## Secuencia concreta

1. Agregar capacidad de lectura y montaje protegido al Inicio, manteniendo la barrera organizacional y redirección actuales.
2. Crear cliente/consulta con claves organización–epoch–membresía–audiencia, abortables y sin caché persistente de datos privados.
3. Renderizar tarjetas/detalle y archivos, separando DTO personal de los internos y del inquilino.
4. Conectar invalidaciones de TASK-45-04, cerrar detalles revocados, refrescar todas las páginas afectadas y descartar respuestas anteriores.
5. Ajustar pruebas que exigían Inicio vacío para exigir únicamente esta superficie; conservar rechazos a navegación y APIs internas.

## Criterios de cierre

- Dos personas de personal ven conjuntos diferentes aunque compartan organización/propiedad; la misma identidad en otra organización no comparte órdenes.
- Se muestran descripción completa, propiedad, fecha, ID, estado, archivos y contacto del autor disponible.
- Personal sin órdenes ve `No tenés órdenes asignadas`; un error o página incompleta no se presenta como vacío normal.
- La decisión confirmada de solo lectura se respeta: no se montan controles de estado, asignación, rechazo, uploads ni directorios.
- Reasignar, quitar asignación, resolver, archivar o rechazar retira orden, detalle y enlaces en memoria automáticamente.
- Una llamada directa a detalle/archivo revocado falla; URLs nuevas no se emiten. Se documenta el TTL residual de un enlace ya emitido.
- Suspensión, remoción, cambio de rol/sesión/organización y respuestas tardías no restauran datos previos.
- Paginación, teclado/foco, nombres largos, texto y archivos mantienen presentación usable en los tres viewports existentes.

## Evidencia requerida

- Tests de UI/cliente con DTO estricto, estados, pagination, falta de contacto, respuestas tardías y pérdida de asignación.
- Browser con API/base real para dos personales, orden con/sin archivo y revocación mientras el detalle está abierto.
- Capturas sintéticas de `1280×800`, `390×844` y `320×740`, consola limpia, foco y sin overflow.

## Referencias

- [Guía de implementación](./IMPLEMENTATION-GUIDE.md), secciones 4–6.
- [TASK-45-04](./TASK-45-04-gestion-interna-y-actualizacion-compartida.md).
- [TASK-45-05](./TASK-45-05-pruebas-compatibilidad-y-rollout.md).

## Evidencia de entrega

Implementación y checks locales registrados en [pruebas SPEC-45](../../../06-testing/spec45-personal-assignments.md). Las dos migraciones se aplicaron y verificaron en desarrollo `multi-tenant` el 2026-09-12. El despliegue de aplicaciones y los smoke tests alojados siguen pendientes según el [runbook](../../../03-operation/spec45-personal-assignments-runbook.md).
