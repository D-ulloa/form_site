# TASK-46-02 — Dashboard personal y reporte de trabajo

- Estado: `implemented` (frontend local verificado con pruebas unitarias e integración el 2026-09-24; browser/hosted smoke tests pendientes.)
- SPEC: [SPEC-46](./SPEC-46-reporte-de-trabajo-y-aceptacion-de-arreglos.md)
- Dependencias: contratos de TASK-46-01 y ruta/shell personal de SPEC-44/45.
- Secuencia: puede comenzar cuando estén definidos los DTOs y mutaciones de TASK-46-01.

## Resultado

Agregar al dashboard de `personal` la captura, guardado y envío de un reporte de trabajo para cada orden asignada abierta, sin ampliar su lectura ni sus acciones de estado.

## Alcance

- Textarea de texto plano largo, validación, contador, draft, reintento y conflicto de versión.
- Acción `Marcar trabajo como terminado` con confirmación y respuesta canónica.
- Presentación clara de `Pendiente de aceptación` después del envío.
- Retiro de la orden, detalle y enlaces privados cuando se revoca la asignación al pasar a `solved`.
- Error accionable cuando falta un inquilino activo asociado a la propiedad.
- Limpieza de caché/respuestas al cambiar identidad, organización, membresía o sesión.

## Secuencia concreta

1. Montar el formulario dentro de `PersonalHomePage` y conservar la barrera de ruta existente.
2. Crear cliente/hook abortable con claves organización–epoch–membresía–audiencia; no persistir texto privado en localStorage.
3. Conectar guardado de draft y envío con bloqueo de doble click, estados de carga y conflicto recuperable.
4. Tras el envío confirmado, invalidar listado/detalle y limpiar URLs/queries de la orden retirada.
5. Conectar las invalidaciones de TASK-46-03 sin heredar controles de owner/admin/member o viewer.
6. Actualizar expectativas de SPEC-44/45 que exigían Inicio vacío o solo lectura para aceptar únicamente esta superficie autorizada.

## Criterios de cierre

- Dos personales o dos organizaciones no pueden ver ni modificar reportes ajenos aunque conozcan IDs.
- Se puede guardar y recuperar un draft válido; texto inválido no muta el estado.
- Enviar requiere asignación actual, texto válido y tenant disponible; presenta `solved`/`Pendiente de aceptación` tras el commit.
- El personal no puede editar ni aceptar el reporte enviado y deja de verlo como orden abierta.
- Respuestas tardías, suspensión, remoción, cambio de rol o desconexión no restauran la orden retirada.
- Teclado, foco, errores, nombres/texto largos y los viewports soportados mantienen la usabilidad.

## Evidencia requerida

- Tests de componente/cliente para draft, validación, submit, conflicto, orden retirada y tenant faltante.
- Browser con dos personas de personal, dos organizaciones, API/base reales y reporte con texto largo sintético.
- Capturas en `1280×800`, `390×844` y `320×740`, consola limpia y sin URLs de Storage/report body en la interfaz incorrecta.

## Referencias

- [Guía de implementación](./IMPLEMENTATION-GUIDE.md), sección 4.
- [TASK-46-01 — Persistencia y ciclo](./TASK-46-01-persistencia-y-ciclo-de-aceptacion.md).
- [TASK-46-03 — Aceptación y vistas compartidas](./TASK-46-03-aceptacion-del-inquilino-y-vistas-compartidas.md).
