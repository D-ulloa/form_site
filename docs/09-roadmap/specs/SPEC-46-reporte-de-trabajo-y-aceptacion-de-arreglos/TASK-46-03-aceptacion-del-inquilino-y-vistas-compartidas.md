# TASK-46-03 — Aceptación del inquilino y vistas compartidas

- Estado: `implemented` (API/SQL y frontend local verificados con pruebas unitarias e integración el 2026-09-24; browser/hosted smoke tests pendientes.)
- SPEC: [SPEC-46](./SPEC-46-reporte-de-trabajo-y-aceptacion-de-arreglos.md)
- Dependencias: persistencia/API de TASK-46-01; dashboard personal de TASK-46-02; historial tenant de SPEC-43 y sincronización de SPEC-45.
- Secuencia: puede avanzar en paralelo con TASK-46-02 después de fijar el contrato de persistencia.

## Resultado

Mostrar el reporte enviado a las audiencias autorizadas y permitir que un inquilino asociado acepte la orden y el reporte en una operación única que finaliza y archiva la orden.

## Alcance

- Historial del inquilino con `Pendiente de aceptación`, reporte completo y acción `Aceptar orden y reporte`.
- Confirmación tenant, aceptación atómica, idempotencia y estado final `Completada y archivada`.
- Dashboard interno con reportes, autor/fechas mínimas, filtros y etiquetas para legacy solved versus pendientes.
- Viewer de solo lectura y preservación de propiedades, invitaciones, rechazo y assets existentes.
- Invalidaciones autenticadas entre sesiones, refetch canónico, reconexión y retiro de acciones obsoletas.

## Secuencia concreta

1. Agregar el reporte enviado/aceptado a las proyecciones estrictas de tenant e interno; no reutilizar un DTO con datos ajenos.
2. Mostrar la acción de aceptación solo a un inquilino activo de la propiedad y solo cuando estado/reporte sean elegibles.
3. Conectar la confirmación a la mutación atómica; no cambiar optimistamente a archived ni aceptar solo una parte.
4. Actualizar `ArrangementOrdersDashboard` para distinguir `Pendiente de aceptación`, `Completada y archivada` y órdenes legacy.
5. Quitar archivo directo/genérico para órdenes con reporte enviado y conservar las acciones válidas de SPEC-45.
6. Emitir invalidaciones post-commit sin body/PII y comprobar convergencia en sesiones de inquilino, equipo y personal.

## Criterios de cierre

- El inquilino ve únicamente órdenes de su propiedad y puede aceptar una orden `solved` con reporte `submitted`.
- La aceptación requiere ambos elementos, guarda actor/fecha, cambia reporte a `accepted` y orden a `archived` atómicamente.
- Reintentos, doble clic y aceptación concurrente no duplican eventos ni dejan estados divergentes.
- Owner/admin/member/viewer leen según su alcance; viewer e inquilino no reciben controles indebidos.
- El equipo no puede archivar por una ruta genérica una orden pendiente de aceptación.
- Todas las sesiones autorizadas convergen después del commit y recuperan estado canónico tras reconexión.

## Evidencia requerida

- Tests de UI/API para tenant asociado/no asociado, otra propiedad, estados inválidos, aceptación y conflictos.
- Browser con sesiones separadas de personal, inquilino y equipo, segunda página cargada y orden archivada.
- Verificación de señales sin PII, scopes A/B, filtros, assets privados, keyboard/focus y overflow.

## Referencias

- [Guía de implementación](./IMPLEMENTATION-GUIDE.md), sección 5.
- [TASK-46-01 — Persistencia y ciclo](./TASK-46-01-persistencia-y-ciclo-de-aceptacion.md).
- [TASK-46-02 — Dashboard personal y reporte](./TASK-46-02-dashboard-personal-y-reporte.md).
- [TASK-46-04 — Pruebas y rollout](./TASK-46-04-pruebas-compatibilidad-y-rollout.md).
