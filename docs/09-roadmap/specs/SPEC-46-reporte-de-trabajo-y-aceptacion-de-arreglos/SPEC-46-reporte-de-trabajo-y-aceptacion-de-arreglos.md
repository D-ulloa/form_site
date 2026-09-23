# SPEC-46 — Reporte de trabajo y aceptación de órdenes de arreglos

- Estado: `pending`
- Fecha: `2026-09-22`
- Prioridad: `high`
- Autor: `redacted`

## Objetivo

Permitir que el `personal` responsable de una orden abierta escriba un `reporte de trabajo` en texto largo y lo marque como terminado. Esa acción debe cambiar el estado canónico de la orden para todas las vistas autorizadas, pero no debe considerarla completada todavía: el resultado queda pendiente de aceptación del `inquilino` asociado a la propiedad.

El inquilino asociado a la propiedad de la orden debe poder revisar la orden y el reporte completo y pulsar `Aceptar`. La aceptación de ambos elementos en una sola operación debe marcar la orden como `archived`, cuya etiqueta de producto será `Completada y archivada`, y retirar la orden de los pendientes de personal.

## Decisiones confirmadas y supuestos de alcance

| Tema | Decisión |
| --- | --- |
| Reporte | Una orden tiene un reporte de trabajo activo en esta versión. Es texto plano largo, no editor enriquecido ni adjunto de archivo. |
| Autoría | Solo el `personal` asignado actualmente puede crear, editar y enviar el reporte mientras la orden está `open` o `in_progress`. |
| Guardado | El personal puede guardar un borrador antes de marcarlo como terminado. Un borrador no cambia el estado de la orden ni se muestra al inquilino. |
| Marcar como terminado | Enviar el reporte cambia atómicamente la orden a `solved` y el reporte a `submitted`. La interfaz muestra `Pendiente de aceptación`; no es un cierre final. |
| Estado final | La aceptación cambia la orden a `archived` y el reporte a `accepted` en la misma transacción. `archived` es la representación persistida de `Completada y archivada`; no se agrega un estado `completed` duplicado. |
| Aceptante | Supuesto de alcance: cualquier membresía `inquilino` activa asociada a la propiedad puede aceptar la orden. No se exige que sea quien creó la solicitud; la aprobación es de la propiedad. |
| Aceptación | `Aceptar orden y reporte` es una acción única. No puede aceptarse la orden sin el reporte ni el reporte sin la orden. |
| Edición posterior | Un reporte enviado o aceptado queda bloqueado. Corregirlo, rechazarlo o solicitar una nueva versión requiere una decisión posterior y queda fuera de esta SPEC. |
| Compatibilidad | Las órdenes legacy sin reporte conservan su lectura y reglas anteriores. Las nuevas órdenes no pueden archivarse mediante una ruta genérica antes de la aceptación del inquilino. |

El uso de `solved` para el paso intermedio conserva el catálogo de estados de SPEC-43/45. Su etiqueta para órdenes con reporte enviado debe distinguirse de un cierre final; el estado `archived` solo se alcanza por la aceptación autorizada o por compatibilidad explícita con órdenes legacy.

## Contexto y dependencias

- SPEC-39/42 establecen `Gestión de arreglos`, las propiedades y la asociación de membresías `inquilino` a una propiedad.
- SPEC-43 establece las órdenes enviadas, el historial de propiedad, los archivos privados y los estados `open`, `in_progress`, `solved` y `archived`.
- SPEC-44 establece el rol `personal` y su ruta exclusiva de Inicio.
- SPEC-45 establece la asignación de una orden a una membresía `personal`, el dashboard de órdenes asignadas, la eliminación de la asignación al cerrar y las actualizaciones compartidas entre sesiones.
- La orden solo entra en este flujo si es enviada, pertenece a la organización actual, tiene propiedad válida y conserva la asociación de tenant definida por SPEC-42. Las filas legacy sin propiedad o autor no se habilitan para reportes ni aceptación.
- Esta SPEC amplía el ciclo de estados y las proyecciones de SPEC-43/45; no cambia las reglas de organización, propiedad, invitación, assets privados ni la captura de teléfono de SPEC-45.

## Requisitos funcionales

### Reporte en el dashboard de personal

- Conservar `/t/:organizationSlug/personal`, el encabezado `Inicio`, el shell, el cierre de sesión y la consulta limitada a las órdenes asignadas al `personal` autenticado.
- En cada orden `open` o `in_progress` asignada, mostrar un control `Agregar reporte de trabajo` si todavía no existe un borrador, o el borrador actual si ya fue guardado.
- El control debe ser un `textarea` accesible de texto plano. No acepta HTML, Markdown interpretado, archivos, imágenes, enlaces firmados ni datos estructurados adicionales.
- El texto válido se recorta en extremos y debe contener entre 1 y 10.000 caracteres. Se muestran contador, error de campo y estado de guardado sin perder el contenido escrito.
- `Guardar reporte` persiste el borrador sin modificar el estado de la orden. El borrador solo queda disponible para el personal asignado y los revisores internos autorizados; nunca para el inquilino.
- `Marcar trabajo como terminado` exige un texto válido y confirma que la orden sigue asignada al actor. Al confirmar, envía el reporte, cambia la orden a `solved`, revoca la asignación activa y muestra que queda `Pendiente de aceptación`.
- Tras el commit, el reporte no puede editarse ni reenviarse por el personal. El botón no debe presentar éxito antes de la respuesta canónica.
- La orden sale de `Mis órdenes asignadas` porque ya no está `open`/`in_progress`. Una actualización compartida debe retirar cualquier detalle abierto y limpiar datos privados en memoria.
- Si no existe una membresía `inquilino` activa para la propiedad, se puede guardar el borrador, pero marcar como terminado debe devolver un error accionable y no cambiar la orden. El equipo debe corregir la asociación antes de enviar el reporte.
- Personal no puede aceptar su propio reporte, archivar la orden, modificar el estado por una ruta genérica, editar reportes enviados ni acceder al dashboard interno completo.

### Ciclo de estados y reporte

| Estado de orden | Estado de reporte | Etiqueta de producto | Acción siguiente |
| --- | --- | --- | --- |
| `open` | Ninguno o `draft` | `Sin procesar` | Asignar personal o continuar gestión interna. |
| `in_progress` | Ninguno o `draft` | `En proceso` | Personal guarda el reporte o lo marca como terminado. |
| `solved` | `submitted` | `Pendiente de aceptación` | Inquilino asociado revisa y acepta orden + reporte. |
| `archived` | `accepted` | `Completada y archivada` | Historial de solo lectura; no se reabre por esta SPEC. |
| `rejected` | Ninguno o `draft` histórico | `Rechazada` | Se conserva el flujo de reapertura de SPEC-45 sin aceptar un reporte enviado. |

- Estado de orden, estado del reporte, versión y auditoría deben cambiar juntos en cada transición durable.
- El reporte `draft` no puede coexistir con una orden `archived` ni con un reporte `accepted`. Un reporte `submitted` solo puede coexistir con `solved`.
- Al marcar como terminado se elimina la asignación vigente, igual que en el cierre de SPEC-45, pero el identificador del autor del reporte se conserva para auditoría y lectura autorizada.
- El endpoint genérico de estado no puede pasar una orden con reporte `submitted` directamente a `archived`, `open` o `in_progress`. La aceptación del inquilino es el único cierre de ese flujo.
- Una orden `archived` con reporte aceptado es terminal dentro de esta entrega. Crear trabajo adicional requiere una nueva orden; no se borra ni se sobrescribe el reporte aceptado.
- Los estados compartidos se reflejan en dashboard interno, historial del inquilino, proyecciones de personal autorizadas y señales de invalidación. No existen estados distintos por rol.

### Aceptación del inquilino

- El Inicio del `inquilino` debe mostrar las órdenes de su propiedad que tengan `solved` + reporte `submitted`, junto con identificador, descripción, propiedad, archivos verificados, reporte completo y fecha de envío.
- El inquilino no recibe borradores. Una orden sin reporte enviado no muestra el control de aceptación.
- La tarjeta o detalle debe presentar una acción clara `Aceptar orden y reporte`, con una confirmación que indique que se aceptan el trabajo descrito y la orden completa.
- El servidor deriva la propiedad y la membresía desde la sesión/contexto autenticado. No acepta `arrangement_property_id`, `organization_id`, autor o rol como autoridad del body.
- Al confirmar, el servidor bloquea orden, reporte y membresía; valida organización, propiedad, estado, asociación activa y versión; cambia reporte a `accepted`, guarda quién/cuándo aceptó, cambia orden a `archived`, incrementa versión y registra auditoría en una sola transacción.
- La respuesta canónica muestra `Completada y archivada`. El historial de la propiedad conserva la orden y el reporte en modo lectura. La orden deja de aparecer como pendiente para personal y de ofrecer acciones de gestión incompatibles.
- Un doble clic o reintento de la misma aceptación debe ser idempotente. No se crean dos eventos ni se modifica la fecha de aceptación confirmada. Una aceptación concurrente de otro inquilino devuelve el estado actual sin sobrescribirlo.
- Un inquilino no puede aceptar una orden de otra propiedad, una orden no enviada, una orden `open`/`in_progress`, un reporte draft o una orden ya rechazada.
- El inquilino no puede editar el reporte, aceptar parcialmente, archivarlo por una ruta genérica ni cambiar la asociación de la propiedad.

### Dashboard interno y actualización compartida

- `owner`, `admin`, `member` y `viewer` conservan el alcance de lectura definido por SPEC-43/45. Las proyecciones internas muestran el reporte cuando existe, su estado, autor, fechas y la etiqueta compartida de la orden.
- `owner`, `admin` y `member` pueden revisar reportes enviados y aceptados. `viewer` solo lee; no recibe controles de guardado, envío o aceptación.
- Añadir filtros o etiquetas estables para distinguir `Pendientes de aceptación` de órdenes `solved` legacy sin reporte. `Todos` incluye ambos grupos y los demás estados autorizados.
- No ofrecer `Archivar` para una orden con reporte `submitted`; el botón de aceptación pertenece exclusivamente al contexto del inquilino asociado.
- La asignación, envío, aceptación y cambio de disponibilidad de la membresía deben emitir invalidaciones mínimas después del commit. Las señales no incluyen el texto del reporte, contactos, archivos, tokens ni URLs.
- El personal que acaba de enviar el reporte pierde el acceso de nuevas lecturas por la regla de órdenes abiertas asignadas. El inquilino y las vistas internas deben recibir el cambio por el mismo mecanismo de actualización de SPEC-45.
- Tras desconexión, cambio de organización/rol/propiedad o respuesta tardía, cada audiencia debe volver a consultar el estado canónico y no restaurar un reporte u orden que ya perdió autorización.

### Autorización

| Rol activo | Lee reporte draft | Lee reporte enviado/aceptado | Guarda/envía | Acepta |
| --- | --- | --- | --- | --- |
| `owner`, `admin`, `member` | Sí, en órdenes de su organización según su vista interna. | Sí. | No desde el flujo de personal. | No. |
| `viewer` | No se expone draft. | Sí, como lectura interna existente. | No. | No. |
| `personal` asignado | Sí, solo de su orden actual. | Solo hasta el commit de envío por su flujo; después pierde la lista abierta. | Sí, mientras la orden siga asignada y abierta. | No. |
| `inquilino` asociado | No. | Sí, solo para su propiedad. | No. | Sí, sobre orden `solved` con reporte `submitted`. |

Organización activa, sesión válida, membresía activa y asociación de propiedad son requisitos en cada operación. El ID de orden o reporte nunca concede acceso por sí solo.

## Validaciones, errores y privacidad

- Texto ausente, no textual, vacío después de trim, demasiado largo o con controles no permitidos: error de campo; no se guarda ni se cambia el estado.
- Orden desasignada, suspendida, removida, de otra organización, legacy, no enviada o con propiedad inválida: `404`/`403` seguro según la política existente, sin revelar descripción, reporte o contacto.
- Versión obsoleta: conflicto recuperable con la proyección autorizada. No sobrescribir el texto de otra persona ni aplicar parcialmente el estado.
- Falta de inquilino activo asociado al marcar como terminado: error accionable para completar la asociación; el borrador se conserva y la orden permanece `open`/`in_progress`.
- Aceptación fuera de estado, propiedad distinta, membresía suspendida o reporte no enviado: rechazo seguro sin consumir la acción ni crear auditoría de aceptación.
- Pérdida de conexión o respuesta: el cliente reconcilia por idempotencia/versión y no reenvía automáticamente una versión nueva.
- El texto del reporte es contenido privado de la orden. No se escribe en logs, eventos de invalidación, métricas, URLs, cursores, mensajes de error ni telemetría. La auditoría guarda IDs, estados, versiones, actor y fechas, nunca el contenido.
- Mantener buckets privados, asociaciones exactas de assets, URLs temporales y límites de SPEC-31/43. El reporte no habilita carga de archivos ni `files.read` general.
- Todas las mutaciones conservan CSRF/origen, rate limit, `Cache-Control: no-store`, locks y grants/RLS de las specs anteriores.

## Criterios de aceptación

1. El personal asignado ve un textarea de reporte en cada orden `open`/`in_progress`, puede guardar un borrador y no puede editar la orden por otros medios.
2. El reporte valida texto plano largo, conserva el contenido ante errores y no se expone al inquilino mientras sea draft.
3. Marcar trabajo como terminado exige reporte válido y asignación vigente; cambia reporte a `submitted`, orden a `solved`/`Pendiente de aceptación`, limpia la asignación y actualiza todas las vistas autorizadas atómicamente.
4. No se puede marcar terminado si la propiedad no tiene un inquilino activo asociado; el borrador permanece recuperable y no hay cambio parcial.
5. El dashboard interno distingue una orden pendiente de aceptación de una orden `solved` legacy y muestra el reporte según el rol autorizado.
6. El inquilino asociado a la propiedad ve la orden y el reporte enviado, pero no borradores, reportes de otras propiedades o datos de otras organizaciones.
7. `Aceptar orden y reporte` requiere estado y propiedad válidos y cambia reporte a `accepted` y orden a `archived`/`Completada y archivada` en una sola transacción.
8. Doble clic, reintento, respuesta perdida y aceptación concurrente no duplican eventos ni dejan reporte aceptado con orden no archivada, o viceversa.
9. Un inquilino no puede aceptar parcialmente, una propiedad distinta ni una orden `open`, `in_progress`, `rejected` o sin reporte.
10. Una orden con reporte enviado no puede archivarse por el endpoint genérico ni por una acción de owner/admin/member; la aceptación es la única transición final del nuevo flujo.
11. Reportes enviados/aceptados quedan bloqueados y su contenido histórico no se sobrescribe ni se elimina al cambiar de sesión, rol o contexto.
12. Personal pierde acceso a la orden al enviarla; una URL o ID conocido no concede detalle, reporte ni archivo nuevo después de revocarse la asignación.
13. Las actualizaciones se observan entre sesiones de personal, inquilino y equipo sin recarga manual cuando el transporte está disponible, y se recuperan canónicamente después de desconexión.
14. Se mantienen navegación, propiedades, invitaciones, teléfono de SPEC-45, archivos privados, filtros existentes, accesibilidad, teclado y responsive en `1280×800`, `390×844` y `320×740`.
15. SQL/RPC, API, frontend y browser comprueban aislamiento A/B, varias propiedades, co-inquilinos, personal concurrente, filas legacy, estados inválidos, grants/RLS y rollback de auditoría.

## Fuera de alcance

- Editor enriquecido, Markdown, comentarios, chat, mensajes, correo, SMS, WhatsApp, firma digital o archivos dentro del reporte.
- Varios reportes simultáneos, versiones editables después del envío, rechazo del reporte por el inquilino, solicitud de corrección o segunda ronda de aprobación.
- Aceptación parcial por archivo, por componente del trabajo o por varios inquilinos con votación/consenso.
- Reapertura y edición de una orden `archived` con reporte aceptado; una nueva intervención requiere otra orden.
- Cambios al modelo de propiedades, invitaciones, asignaciones, perfiles, teléfono o autenticación de SPEC-42/44/45.
- Aplicar migraciones alojadas, desplegar aplicaciones o habilitar proveedores externos como parte de la redacción de esta SPEC.

## Referencias

- [SPEC-42 — Propiedades e invitaciones de inquilinos](../SPEC-42-propiedades-e-invitaciones-de-inquilinos-en-arreglos/SPEC-42-propiedades-e-invitaciones-de-inquilinos-en-arreglos.md).
- [SPEC-43 — Solicitudes de arreglo de inquilinos](../SPEC-43-solicitudes-de-arreglo-para-inquilinos/SPEC-43-solicitudes-de-arreglo-para-inquilinos.md).
- [SPEC-44 — Rol personal e Inicio exclusivo](../SPEC-44-rol-personal-inicio-exclusivo/SPEC-44-rol-personal-inicio-exclusivo.md).
- [SPEC-45 — Dashboard personal, asignación y rechazo](../SPEC-45-dashboard-personal-asignacion-y-rechazo-de-arreglos/SPEC-45-dashboard-personal-asignacion-y-rechazo-de-arreglos.md).
- [Guía de implementación](./IMPLEMENTATION-GUIDE.md).
- [TASK-46-01 — Persistencia y ciclo de aceptación](./TASK-46-01-persistencia-y-ciclo-de-aceptacion.md).
- [TASK-46-02 — Dashboard personal y reporte](./TASK-46-02-dashboard-personal-y-reporte.md).
- [TASK-46-03 — Aceptación del inquilino y vistas compartidas](./TASK-46-03-aceptacion-del-inquilino-y-vistas-compartidas.md).
- [TASK-46-04 — Pruebas, compatibilidad y rollout](./TASK-46-04-pruebas-compatibilidad-y-rollout.md).
