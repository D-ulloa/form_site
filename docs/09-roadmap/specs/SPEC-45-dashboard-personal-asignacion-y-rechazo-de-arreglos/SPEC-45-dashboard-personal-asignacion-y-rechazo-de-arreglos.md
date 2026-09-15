# SPEC-45 — Dashboard de personal, asignación y rechazo de arreglos

- Estado: `implemented` (verificado localmente y migraciones aplicadas en desarrollo el 2026-09-12; despliegue y smoke tests alojados pendientes)
- Fecha: `2026-09-12`
- Prioridad: `high`
- Autor: `redacted`

## Objetivo

Convertir el Inicio del rol `personal` en un dashboard donde cada persona consulte las órdenes abiertas que le hayan asignado, con la propiedad, descripción, archivos y datos de contacto del inquilino que hizo la solicitud. Desde `Gestión de arreglos`, `owner`, `admin` y `member` podrán asignar una orden a una persona concreta o rechazarla; el resultado y el estado se reflejarán automáticamente en las vistas autorizadas, incluido el Inicio del inquilino.

Agregar `Número de teléfono` obligatorio durante la primera incorporación de un inquilino. El dato estará disponible junto con su nombre y correo cuando `owner`, `admin`, `member` o el personal asignado revisen su solicitud.

## Decisiones confirmadas y supuestos del borrador

| Tema | Decisión |
| --- | --- |
| Dashboard personal | Confirmado: vive en la página exclusiva del rol y muestra únicamente órdenes asignadas a esa persona. |
| Contenido | Confirmado: propiedad, descripción, archivos e información del inquilino solicitante. |
| Asignación y rechazo | Confirmado: `owner`, `admin` y `member` operan desde su dashboard de arreglos. |
| Visibilidad del estado | Confirmado: el cambio aparece automáticamente para el equipo y el inquilino. |
| Teléfono | Confirmado: se exige al incorporarse por primera vez y se comparte en la revisión autorizada de solicitudes. |
| Cantidad de responsables | Supuesto de alcance: una membresía `personal` por orden, con posibilidad de reasignación por el equipo. |
| Efecto de asignar | Supuesto de flujo: `open` pasa a `in_progress` al asignar; reasignar conserva `in_progress`. |
| Acciones de personal | Confirmado: solo consulta; no resuelve, rechaza ni reasigna órdenes. |
| Rechazo | Confirmado: estado propio `rejected`, etiqueta `Rechazada`, distinto de archivar. |
| Inquilinos existentes | Confirmado: el teléfono se exige solo a nuevos registros; los inquilinos ya incorporados no reciben un formulario ni una obligación retroactiva. |
| Información personal | Alcance mínimo del borrador: nombre disponible, correo y teléfono del autor de la solicitud; no un directorio de residentes. |

Las tres aclaraciones del usuario quedan incorporadas: personal de solo lectura, rechazo independiente y teléfono solo para nuevos registros. Los supuestos restantes concretan cantidad de responsables y efecto de asignar; se distinguen de las decisiones confirmadas y se aplican consistentemente en guía y tareas.

## Contexto y dependencias

- SPEC-39/42 establecen el dashboard interno, las propiedades y la asociación del inquilino a una propiedad de su organización.
- SPEC-43 implementa solicitudes, historial compartido por propiedad, archivos privados y los estados `open`, `in_progress`, `solved` y `archived`.
- SPEC-44 implementa el rol `personal`, sus invitaciones, el perfil de membresía y `/t/:organizationSlug/personal`, que antes de SPEC-45 no tenía contenido de producto.
- Esta SPEC sustituye la restricción de Inicio vacío y la exclusión de asignaciones de SPEC-44, y amplía el ciclo de estados y las proyecciones de SPEC-43. Conserva sus límites de organización, propiedad, invitaciones y assets.
- Los documentos de SPEC-43/44 distinguen implementación local, migración de desarrollo y despliegue de aplicaciones. Esta redacción no acredita rollout ni cierra los gates de medios privados de SPEC-31/POL-09.

## Requisitos funcionales

### Dashboard exclusivo de personal

- Conservar `/t/:organizationSlug/personal`, el encabezado `Inicio`, el shell, la sesión y el cierre de sesión existentes. Incorporar una sección `Mis órdenes asignadas`.
- Mostrar solo órdenes enviadas, de la organización activa, cuyo responsable actual sea exactamente la membresía `personal` autenticada y cuyo estado sea `open` o `in_progress`.
- Una misma persona puede recibir órdenes de distintas propiedades de la organización. Recibir una orden no la asocia a la propiedad ni le da acceso a otras órdenes de esa propiedad.
- Cada orden presenta identificador, propiedad (nombre e identificador), descripción completa, estado, fecha de envío, archivos verificados y contacto del inquilino que la creó.
- Mostrar el nombre, correo y teléfono del solicitante solo cuando estén disponibles desde las fuentes autorizadas. Marcar datos históricos faltantes como `No disponible`; no inventarlos ni tomar el contacto de otro inquilino de la propiedad.
- La consulta es paginada, con orden estable y estados de carga, vacío, error inicial, continuación fallida y reintento. Un resultado vacío muestra `No tenés órdenes asignadas`.
- Personal puede abrir los archivos de sus órdenes mediante el acceso privado autorizado. No puede modificar estado, descripción o archivos, crear solicitudes, rechazar ni asignar.
- Una orden que se reasigna a otra persona, se desasigna, se soluciona, se archiva o se rechaza deja de estar disponible para el personal anterior. Esto aplica a listado, detalle y nuevas solicitudes de acceso a archivos, incluso con un ID conocido.
- No existe en este alcance un historial de órdenes cerradas para personal ni acceso al dashboard interno, listas de propiedades o directorios de inquilinos.

### Asignar y reasignar desde Gestión de arreglos

- Conservar `/t/:organizationSlug/arrangements`, su listado, filtros, propiedades e invitaciones actuales. Agregar el contacto del solicitante y el responsable actual a las proyecciones autorizadas.
- `owner`, `admin` y `member` reciben la acción `Asignar personal` en órdenes enviadas con propiedad y autor válidos, de estado `open` o `in_progress`.
- El selector lista únicamente membresías activas con rol `personal` de la misma organización. Muestra nombre y ocupación para identificar a la persona, con identificador de membresía si hay homónimos. No lista invitaciones pendientes ni identidades sin membresía activa.
- El selector es una consulta propia de arreglos. No otorga a `member` acceso a gobernanza o a una lista general de miembros.
- Al guardar, el servidor valida otra vez al actor, la orden y al responsable seleccionado. La asignación referencia una membresía, no un correo, ID global de usuario o nombre.
- Asignar una orden `open` guarda al responsable y cambia el estado a `in_progress` en la misma transacción. La asignación solo aparece como confirmada después del commit.
- `Reasignar personal` reemplaza al responsable actual de una orden abierta/en proceso, sin crear una segunda orden ni mantener dos responsables. Se conserva `in_progress` y se revoca la lectura del responsable anterior.
- `Quitar asignación` permite dejar una orden pendiente sin responsable y devuelve su estado a `open`. No cambia propiedad, autor, descripción ni adjuntos.
- No se asignan órdenes `solved`, `archived` o `rejected`: primero se reabren como `open`. Las filas legacy sin propiedad/autor continúan visibles internamente, pero no se asignan ni se enriquecen por inferencia.
- Si no hay personal elegible, explicar que debe incorporarse mediante la invitación existente. No crear usuarios, aceptar invitaciones ni asignar a alguien automáticamente.

### Rechazar una orden

- `owner`, `admin` y `member` pueden activar `Rechazar solicitud` para una orden enviada `open` o `in_progress` dentro de su organización.
- Mostrar una confirmación breve con la orden seleccionada. No exigir un motivo ni añadir comentarios en esta versión.
- Confirmar guarda `rejected` y elimina la asignación vigente en una sola transacción, con versión, fecha y auditoría. No borra solicitud, descripción, archivos ni historial.
- La solicitud permanece en el dashboard interno y en el historial de su propiedad con la etiqueta `Rechazada`. No continúa en las órdenes abiertas de personal.
- Un inquilino nunca puede rechazar su propia solicitud ni modificar su estado.
- El equipo puede reabrir una solicitud rechazada mediante `rejected` → `open`; queda sin responsable hasta una nueva asignación explícita.
- Una orden solucionada o archivada debe reabrirse antes de rechazarla. Repetir una acción ya aplicada no duplica eventos ni altera el resultado de otro cambio concurrente.

### Estados y consistencia de asignación

| Valor | Etiqueta individual | Filtro interno | Asignación vigente |
| --- | --- | --- | --- |
| `open` | `Sin procesar` | `Sin procesar` | Sin responsable; disponible para asignar. |
| `in_progress` | `En proceso` | `En proceso` | Puede tener un responsable; se admiten órdenes previas/en gestión interna sin responsable. |
| `solved` | `Solucionado` | `Solucionado` | Sin asignación vigente; conservar historial auditado. |
| `archived` | `Archivada` | `Archivados` | Sin asignación vigente; se conserva la reapertura existente. |
| `rejected` | `Rechazada` | `Rechazadas` | Sin asignación vigente; se puede reabrir como `open`. |

- El filtro mantiene `Todos` y agrega `Rechazadas` después de las opciones actuales. `Todos` incluye los cinco estados, en todas las páginas, y no es un valor persistido.
- Se conservan las transiciones entre los cuatro estados anteriores de SPEC-43. Pasar a `open`, `solved` o `archived` elimina la asignación vigente; pasar a `in_progress` desde `open` no obliga a elegir responsable, preservando la gestión interna existente.
- La entrada a `rejected` solo se permite desde `open` o `in_progress`; su única salida es `open`. Una ruta genérica de estado no puede eludir estas reglas ni conservar un responsable en un estado cerrado.
- Estado, responsable, versión y auditoría forman una única operación. Todas las mutaciones requieren `expected_version`; un conflicto no aplica cambios parciales ni sobrescribe una decisión concurrente.

### Actualización automática entre vistas

- La respuesta de una mutación exitosa devuelve el estado y versión canónicos. La pantalla del actor refleja el resultado sin recargar manualmente.
- Si el inquilino tiene abierto el historial de su propiedad, ve la nueva etiqueta automáticamente. Lo mismo aplica a otros gestores autorizados y al personal cuya asignación cambia.
- La nueva orden asignada aparece en el dashboard de su responsable; una orden cuyo acceso se revoca desaparece, incluidos detalle y enlaces temporales en memoria.
- El mecanismo debe funcionar entre sesiones y navegadores distintos. Invalidar únicamente la caché del navegador que realizó el cambio no cumple el requisito.
- Las señales de actualización no contienen descripción, contactos ni archivos. Se autorizan en servidor con el mismo alcance que las consultas, sin suscribir personal o inquilinos a filas globales de una organización.
- Tras desconexión o regreso a la pestaña, recuperar el estado canónico. Una vista que perdió conexión debe comunicar que se está reconectando; no presentar un cambio local como confirmación remota.
- La guía fija una comprobación de latencia para un entorno de prueba sano; no se promete entrega instantánea durante una desconexión.

### Teléfono en la incorporación del inquilino

- La primera incorporación al rol incluye `Número de teléfono`, obligatorio antes de terminar la aceptación. Se muestra dentro del flujo de registro/invitación y también a una cuenta existente o autenticada con Google que se incorpora como inquilino.
- La autoridad del rol viene de la invitación validada. No se añade un selector público de rol ni se exige este teléfono a un nuevo owner de SPEC-41, a personal u otros roles.
- Guardar el teléfono en la membresía de la organización, de manera coherente con los perfiles de SPEC-44. Una identidad puede tener contactos diferentes en organizaciones distintas.
- Tratar el teléfono como texto, conservando prefijo internacional y ceros iniciales. Validar en cliente, servidor y base de datos; no convertirlo en número aritmético ni usarlo como identidad de login.
- Persistirlo junto con la aceptación, la asociación de propiedad y el consumo de invitación/handoff. Una validación fallida permite corregirlo y no consume la invitación ni crea una membresía incompleta.
- Una invitación pendiente para una primera incorporación de inquilino solicita el campo al aceptarse después de activar el cambio, aunque se haya emitido antes. Una cuenta Auth existente que se incorpora por primera vez a ese rol completa el mismo registro; esto no obliga a quienes ya eran inquilinos.
- Los inquilinos ya incorporados sin teléfono mantienen Inicio, historial, creación y envío de solicitudes, incluidos borradores anteriores, sin formulario, aviso obligatorio ni bloqueo por ese dato faltante.
- La reactivación o recuperación de una membresía inquilino anterior conserva su teléfono nullable y no se considera un registro nuevo. La condición de incorporación previa se verifica en servidor; no se acepta una exención declarada por el cliente.
- No rellenar registros históricos con valores ficticios. Tanto las solicitudes previas como las nuevas de un inquilino existente sin teléfono muestran `No disponible` a los revisores autorizados. No se agrega un flujo de actualización de contacto en esta SPEC.

### Datos personales y archivos

- El contacto mostrado corresponde exclusivamente a `created_by_membership_id` de la orden, dentro de su organización. Una solicitud no expone teléfonos o identidades de todos los residentes de la propiedad.
- `owner`, `admin` y `member` pueden revisar nombre, correo y teléfono del autor en las órdenes de su organización; personal solo en sus órdenes abiertas asignadas.
- `viewer` conserva lectura de órdenes y assets de SPEC-43, pero no recibe los nuevos campos de contacto ni el selector o las acciones de asignación/rechazo.
- Los inquilinos conservan el historial compartido de propiedad y `Tu solicitud`; no reciben contacto de otros inquilinos ni un directorio/perfil de personal.
- El servidor genera proyecciones diferentes por audiencia. Ocultar un campo en React no autoriza incluirlo en el JSON de viewer/inquilino.
- No añadir estos contactos al contexto global, gobernanza, resolución pública de invitaciones, eventos de actualización, logs, URLs o telemetría.
- Conservar buckets privados, asociaciones exactas orden–asset, verificación y límites de SPEC-43. Personal obtiene acceso de lectura por asignación y nunca `files.read` general, carga o exploración de archivos.
- La pérdida de asignación impide emitir nuevos enlaces. Un enlace firmado ya emitido puede seguir siendo válido hasta su vencimiento conforme al mecanismo de SPEC-31/43; documentar su TTL efectivo y no afirmar que se revoca retroactivamente.

## Autorización

| Rol activo | Órdenes visibles | Contacto del solicitante | Asignar/reasignar/quitar | Rechazar/cambiar estado |
| --- | --- | --- | --- | --- |
| `owner`, `admin`, `member` | Organización actual. | Sí, por orden. | Sí. | Sí, según transición. |
| `viewer` | Organización actual. | No. | No. | No. |
| `inquilino` | Historial de su propiedad. | Sin datos ajenos. | No. | No. |
| `personal` | Abiertas asignadas a su membresía actual. | Solo de esas órdenes. | No. | No. |

Organización activa, sesión y membresía activas son requisitos en cada operación. El rol personal no adquiere acceso general a arreglos, propiedades o miembros. Una membresía personal de otra organización, o una invitación pendiente, no sirve como responsable elegible.

Suspender, remover o cambiar el rol del responsable revoca inmediatamente la autoridad para nuevas consultas. El equipo debe poder identificar una asignación cuyo responsable ya no está disponible y quitarla o reasignarla; no se transfiere trabajo automáticamente. Reactivar la misma membresía personal restaura acceso solo a asignaciones que sigan vigentes y abiertas.

## Validaciones y errores

- Teléfono vacío, tipo no textual, formato o longitud inválidos: error de campo, sin consumir incorporación o guardar cambios parciales.
- IDs fuera de alcance, personal no asignado, cursor de otra audiencia o solicitud no enviada: error seguro sin contacto, archivos ni confirmación de datos ajenos.
- Responsable suspendido/removido, rol incompatible o invitación pendiente: asignación rechazada; refrescar opciones sin perder la orden seleccionada.
- Versión obsoleta: conflicto recuperable con proyección actual autorizada; actualizar antes de reintentar. Nunca filtrar contactos en un error para un actor sin acceso.
- Cambio de identidad, organización, rol, membresía o propiedad cancela consultas y retira datos de la vista anterior. Respuestas tardías o eventos fuera de orden no pueden restaurarlos.
- API/base/archivo/conexión no disponibles: estado explícito con reintento. Ningún fallo se presenta como lista vacía o asignación exitosa.

## Criterios de aceptación

1. Personal entra a su ruta exclusiva y ve paginadamente solo órdenes abiertas asignadas a su membresía de la organización actual, con propiedad, descripción, archivos y contacto del autor.
2. Asignar una orden de una propiedad no permite ver otras solicitudes ni otros inquilinos de esa propiedad; manipular IDs, filtros, cursores o rutas no amplía el alcance.
3. Owner/admin/member asignan, reasignan y quitan asignación desde Gestión de arreglos, eligiendo únicamente personal activo de su organización; viewer/inquilino/personal no pueden mutar.
4. Asignación y paso a `in_progress` son atómicos. Reasignación revoca al anterior y no duplica la orden; quitar asignación devuelve `open`.
5. Rechazar una orden abierta guarda `rejected`, elimina su asignación y conserva contenido e historial. El inquilino ve `Rechazada` y el personal deja de verla.
6. Los filtros incluyen los cinco estados; reabrir una rechazada devuelve `open` sin responsable. Las rutas anteriores de estado respetan las invariantes nuevas.
7. Dos sesiones distintas observan los cambios automáticamente sin recarga; se prueba asignación, rechazo, cierre, reasignación y recuperación de conexión.
8. Registro/aceptación de inquilino nuevo, cuenta existente y OAuth requieren teléfono válido y lo persisten atómicamente con la membresía y propiedad. Los otros roles mantienen su incorporación.
9. Un inquilino ya incorporado sin teléfono conserva historial, creación y envío sin avisos obligatorios ni bloqueo; el contacto ausente se muestra como tal. Capturar teléfono en una nueva incorporación no modifica otra organización.
10. Nombre, correo y teléfono corresponden al autor de cada solicitud. Legacy permanece explícito; viewer y otros inquilinos no reciben esos datos en respuestas, errores o eventos.
11. Listado, detalle y archivos comprueban la asignación actual de personal; suspensión/remoción/cambio de rol y cambios de contexto impiden nuevas lecturas.
12. Mutaciones concurrentes, reintentos y fallos de auditoría no producen estados parciales, dos responsables ni escrituras perdidas; se documenta la recuperación de respuesta perdida.
13. Persistencia/RPC, HTTP y navegador prueban scope A/B, dos personas de personal, varias propiedades y co-inquilinos con datos sintéticos.
14. Se preservan shell, accesibilidad, comportamiento responsive, invitaciones SPEC-42/44 y las capacidades previas de los roles no ampliadas expresamente aquí.

## Fuera de alcance

- Varios responsables simultáneos, asignación por propiedad, calendarios, turnos, aceptación de trabajo por personal o cierre por personal.
- Motivos obligatorios de rechazo, comentarios, chat, correo, SMS, WhatsApp, llamadas integradas, presupuestos o pagos.
- Nuevos tipos de archivos, edición/borrado de solicitudes enviadas, movimiento entre propiedades u organizaciones o historial de trabajo cerrado para personal.
- Directorios de residentes, exposición de datos contractuales, verificación telefónica mediante OTP o teléfono como método de autenticación.
- Captura retroactiva del teléfono de inquilinos existentes, edición general de perfiles/teléfonos y cambios al registro autoservicio de owners.
- Aplicar migraciones alojadas, desplegar aplicaciones o habilitar proveedores como parte de la implementación local.

## Referencias

- [Evidencia local de implementación y pruebas](../../../06-testing/spec45-personal-assignments.md).
- [Runbook de despliegue y recuperación](../../../03-operation/spec45-personal-assignments-runbook.md).
- [SPEC-42 — Propiedades e invitaciones de inquilinos](../SPEC-42-propiedades-e-invitaciones-de-inquilinos-en-arreglos/SPEC-42-propiedades-e-invitaciones-de-inquilinos-en-arreglos.md).
- [SPEC-43 — Solicitudes de arreglo de inquilinos](../SPEC-43-solicitudes-de-arreglo-para-inquilinos/SPEC-43-solicitudes-de-arreglo-para-inquilinos.md).
- [SPEC-44 — Rol personal e Inicio exclusivo](../SPEC-44-rol-personal-inicio-exclusivo/SPEC-44-rol-personal-inicio-exclusivo.md).
- [Guía de implementación](./IMPLEMENTATION-GUIDE.md).
- [TASK-45-01 — Teléfono e incorporación](./TASK-45-01-telefono-e-incorporacion-de-inquilinos.md).
- [TASK-45-02 — Persistencia, asignación y rechazo](./TASK-45-02-persistencia-asignacion-y-rechazo.md).
- [TASK-45-03 — Dashboard personal](./TASK-45-03-dashboard-personal-y-archivos.md).
- [TASK-45-04 — Gestión interna y actualización compartida](./TASK-45-04-gestion-interna-y-actualizacion-compartida.md).
- [TASK-45-05 — Pruebas y rollout](./TASK-45-05-pruebas-compatibilidad-y-rollout.md).
