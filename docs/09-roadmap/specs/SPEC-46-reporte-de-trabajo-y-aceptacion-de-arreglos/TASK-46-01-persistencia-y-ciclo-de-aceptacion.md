# TASK-46-01 — Persistencia y ciclo de aceptación

- Estado: `implemented` (SQL/RPC verificados localmente contra PostgreSQL desechable el 2026-09-23; migración en entorno compartido pendiente.)
- SPEC: [SPEC-46](./SPEC-46-reporte-de-trabajo-y-aceptacion-de-arreglos.md)
- Dependencias: solicitudes y estados de SPEC-43; asignación y auditoría de SPEC-45; propiedades/membresías tenant de SPEC-42.
- Secuencia: primero; entrega los contratos que consumen TASK-46-02 y TASK-46-03.

## Resultado

Persistir un reporte de trabajo por orden y hacer cumplir, con transacciones y autorización de servidor, el recorrido `draft` → `submitted`/`solved` → `accepted`/`archived`.

## Alcance

- Migración aditiva con tabla privada uno-a-uno, body de texto largo, estados del reporte, versiones, fechas y actor de aceptación.
- Constraints/FKs compuestas, índices, RLS/grants y protección de órdenes legacy sin propiedad o autor.
- Capacidades `personal.arrangements.report.write`, `arrangements.work_report.read` e `inquilino.arrangements.accept`.
- RPC/servicio/HTTP para guardar draft, marcar terminado, consultar y aceptar orden + reporte.
- Locks consistentes, `expected_version`, idempotencia, auditoría sin contenido del reporte y rollback si falla una escritura relacionada.
- Adaptadores de SPEC-43/45 sin bypass para archivar una orden con reporte enviado.

## Secuencia concreta

1. Inventariar estados, órdenes legacy, membresías tenant y caminos actuales de cambio de estado.
2. Crear la migración posterior a SPEC-45 sin modificar archivos aplicados; rechazar datos incompatibles antes de imponer invariantes nuevas.
3. Implementar guards separados para personal asignado e inquilino asociado; no sumar personal al lector interno global.
4. Implementar save draft, submit y accept con orden de locks estable, control de versión y no-op seguro.
5. Separar DTOs por audiencia y aplicar el mismo scope a detalle, listados, archivos y conflictos.
6. Revisar todos los RPC/rutas antiguas y eventos para que una orden `solved` con reporte enviado solo pueda archivarse mediante aceptación tenant.

## Criterios de cierre

- Una sola fila de reporte por orden, body válido y fechas/estados coherentes.
- Solo el personal asignado y activo guarda o envía mientras la orden está abierta/en proceso.
- Enviar cambia reporte, orden, asignación, versión y auditoría juntos; ningún fallo deja estado parcial.
- Solo un inquilino activo asociado a la propiedad acepta; aceptación y archivo son atómicos e idempotentes.
- Personal, tenant, viewer y miembros de otra organización reciben `403`/`404` seguros fuera de su alcance.
- El texto no aparece en logs, eventos, cursores, URLs ni errores; los assets siguen siendo privados y separados.
- Los endpoints legacy no pueden evadir la nueva transición; filas sin propiedad no se habilitan por inferencia.

## Evidencia requerida

- SQL real de migración, RLS/grants, constraints y RPC bajo roles de prueba.
- Carreras save/submit, submit/accept, accept/accept, baja de tenant y auditoría fallida.
- Pruebas de DTOs, cursores, errores seguros, orden legacy, scope A/B y archivo autorizado/no autorizado.

## Referencias

- [Guía de implementación](./IMPLEMENTATION-GUIDE.md), secciones 2–3.
- [TASK-46-02 — Dashboard personal y reporte](./TASK-46-02-dashboard-personal-y-reporte.md).
- [TASK-46-03 — Aceptación y vistas compartidas](./TASK-46-03-aceptacion-del-inquilino-y-vistas-compartidas.md).
