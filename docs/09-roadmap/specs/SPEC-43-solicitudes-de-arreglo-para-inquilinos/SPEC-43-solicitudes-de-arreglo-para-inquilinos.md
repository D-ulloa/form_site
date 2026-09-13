# SPEC-43 — Solicitudes de arreglo de inquilinos

- Estado: `in_progress`
- Fecha: `2026-09-12`
- Prioridad: `high`
- Autor: `redacted`

Implementación local, pruebas y migración de desarrollo disponibles en [la evidencia](../../../06-testing/spec43-arrangement-requests.md). Migración SPEC-43 aplicada y verificada en `multi-tenant` (`kcobkbtieyowdmsvtsvv`) el 2026-09-12. Cierre pendiente de gates SPEC-31/POL-09, pruebas alojadas de Storage y despliegue de aplicación.

## Objetivo

Permitir que un inquilino solicite un arreglo desde su Inicio, describa el problema y adjunte fotos o videos de forma opcional. Cada solicitud debe quedar asociada a la propiedad vinculada a su membresía. El inquilino podrá consultar el historial completo de solicitudes de esa propiedad; los usuarios internos de la organización podrán consultar y gestionar las solicitudes desde `Gestión de arreglos`, junto con las propiedades que ya administran.

Las solicitudes tendrán estados `Sin procesar`, `En proceso`, `Solucionado` y `Archivados`. El filtro interno existente conservará `Todos` e incluirá los cuatro estados. Los roles `owner`, `admin` y `member` podrán cambiar estados; `viewer` podrá consultar. Una solicitud archivada podrá reabrirse.

## Decisiones confirmadas

- El flujo comienza en la página exclusiva del rol `inquilino`, con un botón etiquetado exactamente `Solicitud de arreglo`.
- La descripción es obligatoria; subir imágenes o videos es opcional.
- La solicitud pertenece a una propiedad, no solo a una organización. Se usa la propiedad asociada por SPEC-42 a la membresía activa del inquilino; el cliente no elige ni envía la autoridad de propiedad.
- El inquilino ve todas las solicitudes enviadas de su propiedad, incluidas las de otros inquilinos asociados a esa misma propiedad, además de las propias.
- El dashboard interno existente muestra las solicitudes de todas las propiedades de la organización, su descripción y archivos.
- `owner`, `admin` y `member` pueden cambiar el estado. `viewer` conserva lectura. Una solicitud archivada puede volver a `Sin procesar` y continuar su ciclo.
- Los filtros usan los nombres `Todos`, `Sin procesar`, `En proceso`, `Solucionado` y `Archivados`. `Todos` es una opción del filtro, no un estado persistido.

## Contexto y dependencias

- SPEC-39 creó `/t/:organizationSlug/arrangements`, el listado de órdenes abiertas y el filtro por estado. El modelo actual solo presenta `open` e `in_progress`; no ofrece creación, archivos, asociación de propiedad ni ciclo de vida.
- SPEC-40 creó el rol `inquilino`, la ruta `/t/:organizationSlug/inquilino` y un `Inicio` sin funciones de producto. Esta SPEC amplía expresamente esa página.
- SPEC-42 asocia una membresía `inquilino` a exactamente una propiedad de su organización. Varias membresías pueden compartir propiedad. Esta relación define el alcance de las solicitudes.
- SPEC-31 define el registro de assets, cargas firmadas, verificación y vistas privadas; el repositorio actual contiene primitives de servicio/SQL, pero aún no monta las rutas HTTP del servicio de assets. Esta SPEC debe integrar esos primitives para órdenes; no debe persistir rutas de Storage ni exponer enlaces duraderos.
- El dominio de propiedades de SPEC-30, los contratos, invitaciones y sus integraciones no forman parte del flujo de solicitudes.

La implementación depende de los contratos de organización y membresía de SPEC-40/42, y de completar o verificar las piezas de SPEC-31 que hagan falta para asociar assets a una orden y autorizar a un inquilino. SPEC-31 sigue pendiente de sus prerequisitos/aprobación, incluida la política de retención POL-09; la guía describe ese gate y cómo verificarlo antes de activar cargas.

## Requisitos funcionales

### Acceso e identidad de propiedad

- La funcionalidad del inquilino vive dentro de la ruta existente `/t/:organizationSlug/inquilino`, bajo `OrganizationRouteBoundary` y la barrera de ruta de SPEC-40.
- Solo una membresía activa con rol `inquilino`, en una organización activa y con propiedad asociada, puede crear solicitudes.
- La API obtiene el `organization_id`, la membresía y `arrangement_property_id` del contexto de sesión confirmado. No acepta `property_id`, `organization_id`, `membership_id`, `user_id` ni el rol como autoridad del cliente.
- El acceso a datos se limita a la propiedad confirmada. IDs de otra organización o propiedad se rechazan sin revelar su existencia.
- Un inquilino activo sin propiedad asociada puede entrar a su Inicio y consultar el estado neutral correspondiente, pero no puede crear solicitudes ni leer solicitudes de otra propiedad. La interfaz explica que debe contactar a la administración.
- Una membresía suspendida, removida o una organización inactiva no conserva acceso a datos o archivos previamente cargados en caché.

### Crear una solicitud desde Inicio

- El Inicio del inquilino muestra el botón exacto `Solicitud de arreglo`. Al activarlo, abre un formulario accesible dentro de la ruta del inquilino; no navega al dashboard interno.
- El formulario requiere el campo `Descripción`, como texto plano recortado en los extremos, con longitud de 1 a 5.000 caracteres. No interpreta HTML ni ejecuta contenido pegado.
- El formulario permite adjuntar cero o más fotos y videos. Los formatos admitidos se limitan a JPEG, PNG o WebP para imágenes y MP4, WebM o QuickTime para videos, con detección del tipo real al finalizar la carga.
- Se fijan para esta función los máximos iniciales: hasta 30 imágenes de 10 MB cada una, hasta 10 videos de 100 MB cada uno, no más de 40 archivos combinados ni 1 GB por solicitud. El servidor valida todos los límites antes de emitir URL y otra vez al finalizar; el cliente no puede ampliarlos.
- Los archivos muestran nombre, tipo, tamaño, progreso, error y acción para quitarlos antes de enviar. Un archivo rechazado no impide conservar la descripción ni los demás archivos válidos.
- La descripción se valida antes de crear un borrador o solicitar URLs de carga. Si no hay archivos, el envío puede completarse sin iniciar una sesión de assets.
- La orden comienza con estado `open` (`Sin procesar`) únicamente al completarse el envío. Los borradores incompletos no aparecen en ningún listado de producto.
- El doble clic, retry o respuesta perdida del mismo intento usa una clave de idempotencia y no duplica solicitudes ni eventos. Reutilizar una clave con contenido distinto produce conflicto.
- Un error de carga permite reintentar o quitar los archivos fallidos. Cancelar antes del envío no crea una solicitud visible. Los borradores y assets huérfanos expiran con las reglas de limpieza de SPEC-31.
- Después de enviar, el sistema confirma el número/identificador, estado inicial y propiedad, y actualiza el historial sin perder los filtros o el contexto vigente.

### Historial del inquilino

- El Inicio muestra las solicitudes enviadas que pertenecen a la propiedad asociada a la membresía actual, sin importar cuál de sus inquilinos las creó.
- Cada tarjeta contiene descripción completa, estado, fecha de envío, identificador y archivos disponibles. Las solicitudes creadas por la membresía actual pueden marcarse `Tu solicitud`; las de otros inquilinos no revelan su nombre, correo, usuario ni otro dato personal.
- El historial es paginado, ordenado por fecha de envío descendente con desempate estable por ID, y admite cargar más. No descarga una colección ilimitada en la primera consulta.
- El historial incluye los cuatro estados, incluso las solicitudes archivadas. La vista no permite al inquilino cambiar estado, archivar, borrar o editar una solicitud enviada.
- El texto de `Inicio`, las consultas y los botones conservan el shell, el logout y los tamaños responsive de SPEC-40. El menú no agrega rutas ni accesos internos.

### Dashboard interno de Gestión de arreglos

- Se conserva `/t/:organizationSlug/arrangements`, el shell de SPEC-39 y la sección `Propiedades` de SPEC-42, incluida la acción `Generar propiedad` según sus permisos.
- El listado cambia de `Órdenes abiertas` a `Solicitudes de arreglo` o un título equivalente contratado por la UI. Consulta todas las solicitudes enviadas de la organización, de todas sus propiedades y de los cuatro estados.
- Cada solicitud presenta descripción, estado, identificador, nombre e identificador de la propiedad, fecha de envío y archivos verificados. Los datos se obtienen del registro y la relación persistidos, no se sintetizan en el frontend.
- El filtro existente mantiene `Todos` y agrega los cuatro valores persistidos. En cada opción se muestran solo órdenes que coinciden; la selección nunca cambia la organización activa. Las opciones conservan el mismo orden acordado aunque un estado tenga cero resultados.
- Los roles internos con `arrangements.read` —`owner`, `admin`, `member` y `viewer`— pueden leer solicitudes y abrir sus adjuntos conforme a esta capacidad de dominio.
- `owner`, `admin` y `member` pueden seleccionar y guardar cualquiera de los cuatro estados. `viewer` no recibe control de edición. La autorización se comprueba en servidor incluso si el control no se muestra.
- Se conserva la paginación, los estados de carga/vacío/error y el tratamiento responsive. La ausencia de órdenes no se confunde con un error ni con una página incompleta.

### Estados y cambios

| Valor persistido | Etiqueta de filtro | Etiqueta individual | Uso |
| --- | --- | --- | --- |
| `open` | `Sin procesar` | `Sin procesar` | Estado inicial al enviar; puede usarse para reabrir una solicitud archivada. |
| `in_progress` | `En proceso` | `En proceso` | El equipo está trabajando en la solicitud. |
| `solved` | `Solucionado` | `Solucionado` | El equipo registra que la solicitud fue atendida. |
| `archived` | `Archivados` | `Archivada` | La solicitud se conserva en el historial y puede reabrirse. |

- `Todos` representa ausencia de filtro y no se guarda como estado.
- Cada usuario autorizado puede cambiar el estado de una solicitud a cualquiera de los cuatro valores, incluida la reapertura `archived` → `open`.
- El cambio requiere `expected_version` para impedir escrituras perdidas. Un conflicto devuelve la versión actual y permite refrescar; no sobrescribe silenciosamente un cambio concurrente.
- Cada cambio exitoso actualiza versión/fecha, registra actor, estado anterior, estado nuevo, organización, solicitud y `request_id` en la auditoría. El evento no almacena la descripción, los nombres de archivo ni contenido multimedia.
- Cambiar a `archived` no elimina la solicitud ni sus assets. Reabrir conserva identificador, descripción, propiedad, adjuntos e historia de auditoría.

### Fotos, videos y privacidad de assets

- Cada asset se preautoriza para `arrangement_order`, una organización, una solicitud y un receptor de imagen o video. El servidor valida permisos, asociación a la propiedad, tipos, tamaños, conteos, checksum/metadatos según la política existente y estado verificado.
- Los buckets se mantienen privados. Los UUID, rutas internas y URL firmadas no son prueba de acceso ni se persisten en la respuesta durable.
- Para consultar una solicitud, el backend emite vistas de corta duración únicamente después de comprobar que la solicitud y el asset pertenecen al scope autorizado. El acceso interno deriva de `arrangements.read`; el del inquilino requiere `inquilino.arrangements.read` y la propiedad coincide con su membresía.
- Cada lector ve únicamente los assets adjuntos a solicitudes que puede leer. No obtiene un explorador de archivos, acceso general a `files.read`, objetos sin asociación ni assets de otra organización.
- La UI muestra archivos como enlaces/botones explícitos con nombre, tipo y tamaño. Videos se descargan o presentan según la disposición segura de SPEC-31; no se ejecuta contenido activo. URLs firmadas nunca se guardan en caché persistente, query data duradera, logs, auditoría ni `localStorage`.
- Los límites, mime detectado y estado de verificación se validan en servidor. Los metadatos del browser no son fuente de confianza.

## Modelo y contrato de datos

- Se extiende `public.arrangement_orders` mediante migración aditiva; no se reescribe una migración aplicada.
- Una orden enviada tiene organización, `arrangement_property_id`, `created_by_membership_id`, descripción, resumen compatible con `name`, estado, fecha de creación/envío, fecha de actualización, versión e idempotencia. Organización y propiedad deben coincidir en las claves foráneas compuestas.
- `name` se conserva para compatibilidad del contrato SPEC-39 y almacena una vista resumida determinística de la descripción. La descripción original completa es la fuente de contenido que se presenta al usuario.
- `arrangement_property_id` y `created_by_membership_id` pueden ser nulos únicamente para filas históricas de SPEC-39 que carecen de esas relaciones. Toda nueva orden debe contener ambas referencias válidas.
- Los borradores con archivos se distinguen de órdenes enviadas mediante un campo/registro técnico. Solo órdenes enviadas aparecen en consultas, y solo una transacción de envío incorpora assets verificados y hace visible la orden.
- La relación solicitud–assets usa el modelo de asociación canónico de SPEC-31 (o su extensión equivalente) con owner `arrangement_order`, claves organizacionales compuestas y orden de presentación. No se almacena autoridad como URL o path.
- El estado acepta exactamente `open`, `in_progress`, `solved` y `archived` para solicitudes nuevas. La opción `Todos` no se persiste.
- La lectura, creación, envío, cambio de estado y vista de assets pasan por servicios/RPCs protegidos y de alcance organizacional. RLS forzado y grants deniegan acceso directo del navegador.

## Capacidades y reglas de autorización

- Conservar `arrangements.read` para `owner`, `admin`, `member` y `viewer`.
- Agregar `arrangements.status.update` para `owner`, `admin` y `member`, excluyendo `viewer` e `inquilino`.
- Agregar `inquilino.arrangements.read` y `inquilino.arrangements.create` solamente al rol `inquilino`, junto a `inquilino.home.read`. El registro de capacidades avanza a la siguiente versión.
- Ningún otro permiso de `inquilino` se deriva por herencia. No puede crear/ver propiedades generales, administrar membresías, entrar a contratos o cargar archivos fuera del owner de una solicitud propia.
- La API del inquilino valida organización activa, rol/estado, propiedad vinculada y ownership en la transacción de base de datos. No basta una comprobación en frontend o un contexto previamente cacheado.
- Lecturas internas filtran por la organización activa en la consulta SQL/RPC antes de paginar; nunca consultan globalmente y filtran en memoria.
- Cambio de organización, usuario, rol, membresía, sesión o propiedad cancela solicitudes activas y retira datos y URLs firmadas del contexto anterior.

## Validaciones y errores

- Descripción vacía o superior a 5.000 caracteres: error de campo sin crear borrador ni emitir enlaces de carga.
- Tipo de archivo, tamaño, cantidad, tipo detectado o asociación no válidos: rechazo seguro del archivo o envío, sin mostrar la solicitud como enviada.
- Sesión inválida, inquilino sin propiedad, membresía inactiva, organización no activa o capacidad ausente: rechazo antes de leer o modificar órdenes/assets.
- Propiedad, solicitud, asset, cursor o versión que no coincide con la organización produce un error genérico, sin confirmar IDs ajenos.
- Error de API/base/storage muestra reintento explícito. Un error inicial no se presenta como historial vacío; un error al cargar una página posterior identifica que la lista está incompleta.
- Una respuesta tardía de otro usuario/organización o anterior a una baja no puede volver a mostrar texto privado, adjuntos ni enlaces.
- Las respuestas de solicitudes y assets llevan las cabeceras privadas actuales, incluidos `Cache-Control: no-store`. Logs no incluyen descripción, contenido, URL firmada, token o path interno.

## Criterios de aceptación

1. Una membresía `inquilino` activa con propiedad puede abrir su ruta exclusiva y enviar una descripción con o sin archivos desde `Solicitud de arreglo`.
2. La orden se crea en la organización y propiedad asociados a la membresía confirmada; manipular IDs o rol en una petición no cambia ese alcance.
3. Las nuevas solicitudes nacen como `open`/`Sin procesar`; drafts y cargas incompletos no aparecen como órdenes enviadas.
4. Un retry, doble envío o respuesta perdida del mismo intento no duplica orden, asociación de assets ni evento de auditoría.
5. El inquilino consulta paginadamente todas las solicitudes enviadas de su propiedad, propias y de otros inquilinos, con estados y assets autorizados. No obtiene nombres/correos de otros solicitantes.
6. Una membresía sin propiedad no crea ni consulta solicitudes de otra propiedad y recibe un estado de interfaz explicativo.
7. La organización consulta solicitudes enviadas de todas sus propiedades, en todas las páginas y los cuatro estados. `Todos` incluye también `Solucionado` y `Archivados`.
8. El filtro interno expone siempre las cinco opciones acordadas; una selección no devuelve filas de otro estado u organización.
9. `owner`, `admin` y `member` pueden cambiar cualquier estado, incluido reabrir `archived` como `open`; `viewer` puede leer, pero no escribir ni cambiar estado.
10. Los conflictos de versión no sobrescriben el estado guardado y se muestran con opción de refrescar.
11. Los cambios de estado dejan auditoría atómica con actor y valores anterior/nuevo, sin texto de la solicitud o contenido de archivos.
12. Imágenes y videos pasan por el registro de assets privado, límites versionados, verificación y asociación exacta a la solicitud. Enlaces de lectura son cortos, autorizados y no duraderos.
13. Un inquilino solo puede ver archivos de solicitudes de su propiedad; un usuario interno solo de su organización y conforme a `arrangements.read`.
14. Suspender/quitar una membresía o cambiar el contexto retira datos y URLs firmadas de consultas anteriores.
15. La página exclusiva mantiene `Cerrar sesión`, navegación y diseño responsive, y no da al inquilino acceso al dashboard general ni a las capacidades de SPEC-30/39/42.
16. La organización conserva el dashboard, filtro y sección Propiedades de SPEC-39/42; los registros legacy sin propiedad siguen visibles solo a usuarios internos y no se asignan a inquilinos por inferencia.
17. Pruebas de persistencia real verifican scope A/B, permisos, transición/reapertura, idempotencia, cargas opcionales, atomicidad, archivos privados y regresiones de SPEC-39/40/42.

## Fuera de alcance

- Asignar responsables, proveedores o técnicos, agendar visitas, agregar comentarios, mensajería, presupuestos, cobros, prioridad o SLAs.
- Editar descripción o reemplazar/quitar adjuntos después del envío; borrar solicitudes; borrar assets al archivar.
- Reasignar solicitudes a otra propiedad u organización, cambiar asociaciones de SPEC-42 o compartir una orden con múltiples propiedades.
- Automatizar correo, WhatsApp, Make, Drive u otra integración externa; generar contratos o crear propiedades completas de SPEC-30.
- Dar al inquilino capacidad de cambiar su estado, listar identidades/solicitudes de otras propiedades o navegar el dashboard interno.
- Introducir una librería de archivos general, buckets públicos o un nuevo sistema paralelo a SPEC-31.

## Referencias

- [SPEC-39 — Dashboard de órdenes abiertas](../SPEC-39-gestion-de-arreglos-dashboard-ordenes-abiertas/SPEC-39-gestion-de-arreglos-dashboard-ordenes-abiertas.md).
- [SPEC-40 — Rol inquilino e Inicio exclusivo](../SPEC-40-rol-inquilino-inicio-exclusivo/SPEC-40-rol-inquilino-inicio-exclusivo.md).
- [SPEC-42 — Propiedades e invitaciones](../SPEC-42-propiedades-e-invitaciones-de-inquilinos-en-arreglos/SPEC-42-propiedades-e-invitaciones-de-inquilinos-en-arreglos.md).
- [SPEC-31 — Assets privados, cargas, verificación y retención](../pending/31-SPEC-multi-tenant-private-assets-uploads-retention-and-storage-migration.md).
- [Guía de implementación](./IMPLEMENTATION-GUIDE.md).
- [TASK-43-01 — Persistencia, permisos, APIs y asociación de archivos](./TASK-43-01-persistencia-api-y-assets.md).
- [TASK-43-02 — Inicio del inquilino y envío](./TASK-43-02-dashboard-inquilino-y-solicitud.md).
- [TASK-43-03 — Dashboard interno y estados](./TASK-43-03-dashboard-interno-y-estados.md).
- [TASK-43-04 — Pruebas, compatibilidad y rollout](./TASK-43-04-pruebas-compatibilidad-y-rollout.md).
