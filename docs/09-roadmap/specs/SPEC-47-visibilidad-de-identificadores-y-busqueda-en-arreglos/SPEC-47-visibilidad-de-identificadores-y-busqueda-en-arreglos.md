# SPEC-47 — Visibilidad de identificadores y búsqueda en dashboards de arreglos

- Estado: pending
- Fecha: 2026-09-22
- Prioridad: medium
- Autor: redacted

## Objetivo

Simplificar la interfaz de Gestión de arreglos para que ningún identificador alfanumérico de propiedades, miembros de la organización u órdenes se muestre en el frontend, y agregar búsqueda por texto para propiedades y órdenes en los dashboards de owner, admin y member.

La redacción afecta únicamente la presentación y las consultas de lectura. Los identificadores siguen siendo datos técnicos internos para autorización, claves de React, paginación y mutaciones; ocultarlos de la interfaz no elimina las garantías de aislamiento ni cambia el modelo persistido.

## Decisiones confirmadas y supuestos de alcance

| Tema | Decisión |
| --- | --- |
| Identificadores visibles | No se renderizan IDs de propiedad, membresía, miembro, invitación u orden en ninguna superficie de arreglos. Tampoco aparecen en textos accesibles, tooltips, atributos de datos, confirmaciones o errores de UI. |
| Identificadores internos | Se conservan en respuestas privadas y en la lógica que necesita ejecutar acciones sobre una entidad. No se convierten en texto visible ni en un sustituto del nombre. |
| Roles con redacción | Aplica a owner, admin, member, viewer, inquilino y personal en todas las vistas de arreglos que cada rol tenga autorizadas. |
| Búsqueda de propiedades | Owner, admin y member pueden buscar por nombre de propiedad dentro de la organización activa. |
| Búsqueda de órdenes | Owner, admin y member pueden buscar por nombre, descripción o nombre de propiedad. La búsqueda no acepta ni muestra IDs. |
| Viewer | Conserva su lectura autorizada y la ocultación de IDs, pero no recibe las nuevas barras de búsqueda porque el pedido limita esa capacidad a owner, admin y member. |
| Inquilino y personal | Conservan sus consultas y navegación actuales, sin IDs visibles y sin una barra de búsqueda nueva en esta SPEC. |
| Alcance de búsqueda | La búsqueda es server-side, se combina con el filtro de estado de órdenes y respeta la paginación existente. No se filtra solamente la página ya descargada. |
| Nombres repetidos | La UI identifica propiedades y órdenes por sus nombres, descripción, estado, fecha y contexto autorizado. No agrega el ID como desempate visible. |

## Contexto y dependencias

- SPEC-39 creó el dashboard de órdenes y el filtro por estado.
- SPEC-42 agregó propiedades de arreglos, asociación de inquilinos y la sección Propiedades.
- SPEC-43 agregó solicitudes, historial por propiedad, archivos privados y las proyecciones de órdenes.
- SPEC-44 estableció el Inicio exclusivo de personal e inquilino.
- SPEC-45 agregó asignación, rechazo, contacto del solicitante y actualización compartida.
- El código actual concentra la presentación en ArrangementOrdersDashboard, ArrangementPropertiesSection, ArrangementPropertyPanel, ArrangementRequestCard, ArrangementAssignmentControls, InquilinoArrangements y PersonalArrangements.
- El contrato técnico actual usa IDs para acciones de estado, asignación, invitaciones, assets, invalidación y claves de consulta. Esta SPEC no sustituye esos contratos por nombres, porque los nombres no son únicos ni autoridad de acceso.

## Requisitos funcionales

### Ocultación transversal de identificadores

- Eliminar de la salida visual el ID de la propiedad en la lista de Propiedades, el panel de una propiedad y la tarjeta de una orden.
- Eliminar de la salida visual el ID de la orden en tarjetas, detalles, diálogos de asignación/rechazo, mensajes de éxito, estados vacíos y cualquier resumen de personal o inquilino.
- Eliminar de las opciones visibles del selector de personal el ID de la membresía. Mostrar nombre y ocupación, con el texto No disponible cuando falte alguno.
- No mostrar IDs de miembros, invitaciones o propiedades en botones, labels, aria-label, title, tooltip, texto de ayuda, atributos data-* o contenido copiado por la interfaz.
- No mostrar el identificador devuelto después de enviar una solicitud de inquilino. El mensaje debe confirmar el envío sin revelar el ID técnico.
- No convertir el identificador en una etiqueta parcialmente enmascarada. El resultado esperado es que no exista texto de ID en la UI.
- Conservar nombres, estados, fechas, descripción, propiedad, contacto autorizado, archivos y acciones actuales. La redacción no elimina información de negocio necesaria.
- Los atributos HTML usados para accesibilidad o control técnico pueden seguir teniendo valores propios del componente, siempre que no sean IDs de dominio ni expongan un ID de propiedad, miembro u orden.
- El ID puede permanecer como key no visible, parámetro de una llamada autenticada, valor de una acción o parte de una clave de cache. No se debe interpolar en una cadena presentada al usuario.

### Búsqueda de propiedades

- En la sección Propiedades de la ruta /t/:organizationSlug/arrangements, owner, admin y member deben ver un campo accesible con label Buscar propiedades y una acción para limpiar la consulta.
- El placeholder debe orientar a buscar por nombre, no por ID. La UI no debe sugerir que el usuario conozca un identificador técnico.
- La búsqueda debe aceptar coincidencias parciales por nombre de propiedad, sin distinguir mayúsculas/minúsculas y normalizando espacios y Unicode. La decisión final sobre accent folding debe ser igual en backend y frontend.
- La consulta vacía muestra el listado normal paginado. Al limpiar, se restablece la primera página y se eliminan los resultados filtrados anteriores.
- La búsqueda se combina con el scope de la organización activa antes de paginar. Nunca consulta propiedades de otra organización para filtrarlas en memoria.
- Cada cambio de consulta cancela o invalida la solicitud anterior, reinicia el cursor y evita que una respuesta tardía reponga resultados de otra búsqueda.
- El resultado vacío diferencia entre una organización sin propiedades y una búsqueda sin coincidencias, sin incluir IDs en el mensaje.
- Crear propiedad, seleccionar una propiedad, asociar inquilinos, invitar, rotar y revocar conservan su comportamiento y siguen usando los IDs internos necesarios.

### Búsqueda de órdenes

- En el dashboard de órdenes, owner, admin y member deben ver un campo accesible con label Buscar órdenes, separado visualmente del filtro por estado.
- La búsqueda debe coincidir contra el nombre de la orden, la descripción y el nombre de la propiedad asociada. No debe coincidir contra el ID de orden, propiedad, organización o membresía.
- El filtro de texto y el filtro de estado se combinan con lógica AND. Todos conserva su significado actual y no se persiste como estado de dominio.
- La búsqueda se ejecuta sobre todas las órdenes autorizadas de la organización activa antes de aplicar la paginación. No se limita a las 25 órdenes ya cargadas.
- La lista mantiene orden estable y paginación. El cursor queda ligado al scope, audiencia, estado, búsqueda y límite; un cursor de otra consulta se rechaza y se reinicia de forma segura.
- Mientras cambia la consulta, la interfaz muestra estado de carga o conserva resultados anteriores claramente marcados como desactualizados; no presenta una lista vacía como si no hubiera coincidencias.
- El resultado vacío distingue entre sin órdenes en la organización y sin coincidencias para el texto/filtro seleccionados.
- Asignar, reasignar, quitar asignación, rechazar y cambiar estado se mantienen sin cambios funcionales. Sus diálogos no deben usar el ID como explicación de la acción.

### Roles, autorización y datos

- El backend conserva el scope derivado de la sesión, organización activa, membresía, rol y propiedad. Un parámetro de búsqueda nunca aumenta el alcance.
- Owner, admin y member consultan propiedades y órdenes con sus capacidades actuales; la búsqueda no concede members.read, gobernanza, archivos ni mutaciones nuevas.
- Viewer puede leer las mismas superficies autorizadas sin IDs visibles, pero no recibe búsqueda en esta entrega.
- Inquilino solo conserva el historial de su propiedad asociada y personal solo conserva sus órdenes asignadas. Ambos deben recibir la misma redacción de IDs en sus tarjetas.
- Las respuestas de la API pueden conservar IDs técnicos para las acciones autorizadas. Los DTOs de presentación deben separar campos operativos de texto mostrado para evitar interpolaciones accidentales.
- Cambiar organización, rol, membresía, propiedad o sesión cancela consultas activas y retira los resultados del contexto anterior, igual que en las specs previas.

## Contratos de lectura y UX

- Agregar un parámetro opcional search a los listados de propiedades y órdenes. Ausente o vacío conserva el contrato actual.
- El backend normaliza, valida y limita search antes de construir la consulta. Rechaza tipos no textuales, consultas excesivamente largas y cursores incompatibles con la consulta.
- El contrato de órdenes conserva status, limit y cursor. El contrato de propiedades conserva property scope, limit y cursor; search se agrega como filtro de lectura.
- La respuesta canónica sigue incluyendo los campos técnicos que requieren las acciones autorizadas, pero ningún componente debe representarlos como texto.
- Los cambios de búsqueda deben reflejarse en las claves de TanStack Query junto con organización, epoch, membresía, audiencia, estado y cursor.
- El debounce puede ser corto y consistente, entre 250 y 350 ms, siempre que no bloquee el envío con Enter ni el botón de limpiar.
- La barra debe funcionar con teclado, foco visible, lectura por screen reader, texto largo, caracteres Unicode y viewports 1280×800, 390×844 y 320×740.
- No se requiere agregar búsqueda por miembro, invitación, asset, correo, teléfono o ID. Esas son extensiones futuras.

## Validaciones, errores y privacidad

- Texto de búsqueda vacío después de trim equivale a ausencia de filtro.
- Una consulta inválida produce un error de campo o respuesta de request inválido sin mostrar el valor técnico del cursor ni ningún ID.
- La respuesta tardía de una consulta anterior no puede sobrescribir la búsqueda vigente ni restaurar datos de una organización anterior.
- El frontend no debe imprimir IDs en logs de consola, telemetría, mensajes de error, toasts, URLs creadas por la UI, clipboard ni atributos accesibles.
- Los IDs seguirán viajando únicamente donde sean necesarios para una solicitud autorizada; esta SPEC no exige ocultarlos del tráfico HTTP privado ni eliminar las rutas internas que los consumen.
- El filtro no debe permitir inyección de texto, HTML o expresiones de consulta. El texto de propiedad, descripción y búsqueda se renderiza como texto.
- Las denegaciones, sesiones vencidas, cambio de organización y errores de red conservan los mensajes seguros de SPEC-39/42/43/45.
- No se modifica RLS, grants, almacenamiento privado, auditoría, estados de órdenes, miembros ni propiedades persistidas.

## Criterios de aceptación

1. Ninguna vista de arreglos muestra IDs alfanuméricos de propiedades, miembros, invitaciones u órdenes a owner, admin, member, viewer, inquilino o personal.
2. La ocultación también cubre diálogos, botones, labels, aria-label, tooltips, mensajes de éxito/error, texto copiado y estados vacíos; no es solamente un cambio de color o CSS.
3. El personal y el inquilino mantienen su alcance actual y pueden usar órdenes y archivos autorizados sin ver el ID de la orden o propiedad.
4. Owner, admin y member ven Buscar propiedades en el dashboard y pueden encontrar coincidencias por nombre en todas las páginas de su organización.
5. Owner, admin y member ven Buscar órdenes y pueden encontrar coincidencias por nombre, descripción o propiedad, sin usar IDs.
6. Búsqueda y estado se combinan correctamente, mantienen paginación y reinician el cursor al cambiar el texto.
7. Una búsqueda no devuelve datos de otra organización, propiedad o audiencia, incluso con cursor, respuesta tardía o manipulación del parámetro.
8. Viewer no recibe controles de búsqueda nuevos, pero sí la redacción transversal de identificadores.
9. Limpiar la consulta restaura el listado sin filtro y conserva las acciones, propiedades, invitaciones y estados existentes.
10. Propiedades y órdenes repetidas siguen siendo distinguibles por nombre, descripción, estado, fecha y contexto sin introducir el ID como solución visual.
11. Teclado, screen reader, foco, mensajes de carga/error/vacío y responsive funcionan en los tres viewports contratados.
12. Las pruebas frontend, API y browser comprueban que ningún texto renderizado, atributo accesible o mensaje contiene los IDs de fixtures.
13. No se agrega migración de base de datos ni se modifica la autorización existente; los checks de regresión de SPEC-39/42/43/44/45 permanecen verdes.

## Fuera de alcance

- Cambiar UUIDs, claves primarias, nombres de columnas, RLS, grants, endpoints de mutación o modelo de propiedades, miembros y órdenes.
- Buscar por ID, mostrar un ID parcial, crear identificadores amigables o renombrar propiedades/órdenes para compensar la ocultación.
- Agregar búsqueda al viewer, inquilino o personal, o crear búsqueda de miembros, invitaciones, archivos, correo o teléfono.
- Implementar ordenamiento avanzado, filtros por fecha, prioridad, solicitante, ocupación o estado nuevo.
- Cambiar la navegación, el ciclo de vida de órdenes, las asignaciones, los archivos, las invitaciones o la sincronización entre sesiones.
- Sustituir la autorización server-side por filtrado del cliente o descargar todo el dataset para realizar búsqueda local.
- Aplicar migraciones alojadas, desplegar frontend/backend o declarar rollout completado por la sola redacción de esta SPEC.

## Referencias

- [SPEC-39 — Dashboard de órdenes abiertas](../SPEC-39-gestion-de-arreglos-dashboard-ordenes-abiertas/SPEC-39-gestion-de-arreglos-dashboard-ordenes-abiertas.md).
- [SPEC-42 — Propiedades e invitaciones de inquilinos](../SPEC-42-propiedades-e-invitaciones-de-inquilinos-en-arreglos/SPEC-42-propiedades-e-invitaciones-de-inquilinos-en-arreglos.md).
- [SPEC-43 — Solicitudes de arreglo para inquilinos](../SPEC-43-solicitudes-de-arreglo-para-inquilinos/SPEC-43-solicitudes-de-arreglo-para-inquilinos.md).
- [SPEC-44 — Rol personal e Inicio exclusivo](../SPEC-44-rol-personal-inicio-exclusivo/SPEC-44-rol-personal-inicio-exclusivo.md).
- [SPEC-45 — Dashboard personal, asignación y rechazo](../SPEC-45-dashboard-personal-asignacion-y-rechazo-de-arreglos/SPEC-45-dashboard-personal-asignacion-y-rechazo-de-arreglos.md).
- [Guía de implementación](./IMPLEMENTATION-GUIDE.md).
- [TASK-47-01 — Ocultamiento de identificadores y contrato de presentación](./TASK-47-01-ocultamiento-de-identificadores-y-contrato-de-presentacion.md).
- [TASK-47-02 — Búsqueda de propiedades](./TASK-47-02-busqueda-de-propiedades.md).
- [TASK-47-03 — Búsqueda de órdenes y vistas de roles](./TASK-47-03-busqueda-de-ordenes-y-vistas-de-roles.md).
- [TASK-47-04 — Pruebas, compatibilidad y rollout](./TASK-47-04-pruebas-compatibilidad-y-rollout.md).
