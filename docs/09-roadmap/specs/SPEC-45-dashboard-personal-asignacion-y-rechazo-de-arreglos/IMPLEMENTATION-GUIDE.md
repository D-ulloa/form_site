# Guía de implementación — SPEC-45

Estado: `implemented`; implementación y verificación locales completadas el `2026-09-12`. Las dos migraciones se aplicaron y verificaron en desarrollo `multi-tenant` el mismo día. El despliegue de aplicaciones y los smoke tests alojados siguen pendientes. La implementación sigue los supuestos de alcance de la [SPEC](./SPEC-45-dashboard-personal-asignacion-y-rechazo-de-arreglos.md): un responsable y asignación que pasa a `in_progress`.

La [evidencia](../../../06-testing/spec45-personal-assignments.md) registra los checks ejecutados y el [runbook](../../../03-operation/spec45-personal-assignments-runbook.md) fija el orden de rollout. El plan siguiente conserva como referencia el punto de partida previo a SPEC-45. Decisiones concretadas en código:

- Migraciones `20260912160000_spec45_tenant_contact.sql` y `20260912170000_spec45_personal_assignments.sql`; marca privada `inquilino_first_joined_at` para conservar incorporaciones previas y impedir exenciones desde el cliente.
- RPCs de aceptación/contexto y `spec45_arrangements`, servicio `arrangementAssignments.ts`, DTOs explícitos y cursores de versión 3 ligados a audiencia/membresía. Los adaptadores antiguos delegan las invariantes nuevas.
- Registro de capacidades 8. `arrangements.request.reject` se expone solo con `ARRANGEMENT_REJECTION_ENABLED=true`; `ARRANGEMENT_REQUIRE_CURRENT_CLIENT` mantiene el guard de lectores compatibles durante una recuperación.
- Revisiones comprometidas en `arrangement_scope_revisions`, SSE autenticado cada 500 ms con renovación a los 20 segundos y revalidación de sesión sin extender su inactividad. Una invalidación cancela consultas y reinicia páginas; una renovación sin cambio conserva la lista.
- `PersonalArrangements`, `ArrangementAssignmentControls`, `InquilinoAcceptanceForm` y `useArrangementChanges` integrados en las pantallas existentes. La verificación incluye cinco casos browser SPEC-45 y carreras SQL con persistencia real.

## 1. Punto de partida y secuencia

| Área | Integración antes de SPEC-45 |
| --- | --- |
| Rol y capacidades | `backend/src/organizations/types.ts`, `roleCapabilities.ts`; tipos/contexto de organizaciones en frontend. Registro actual: versión `7`. |
| Solicitudes y estados | `backend/src/arrangements/requestRepository.ts`, `requestCursor.ts`, `backend/src/services/arrangementRequests.ts`, `backend/src/routes/arrangementRequests.ts`. |
| Persistencia | RPC `spec43_arrangements`, helpers `spec43_require_actor`/`spec43_order_projection`, tabla `arrangement_orders` y asociaciones de assets de SPEC-43. |
| Incorporación | `backend/src/routes/organizationGovernance.ts`, `backend/src/organizations/invitationWorkflow.ts`, `organizationRepository.ts`; adaptadores SQL `spec44_accept_invitation_handoff` y `spec44_accept_invitation_token`. |
| Formularios | `frontend/src/pages/InvitationAcceptPage.tsx`, `frontend/src/features/organizations/services/organizationApi.ts`, `PersonalAcceptanceForm.tsx` como referencia de captura por rol. |
| Nombre de identidad | `user_profiles.display_name`, servicios/repositorios de identidad y perfil; no existe teléfono de inquilino en este contrato. |
| Vistas | `PersonalHomePage.tsx`, `InquilinoArrangements.tsx`, `ArrangementOrdersDashboard.tsx`, `ArrangementRequestCard.tsx` y servicios de `frontend/src/features/arrangements/`. |
| Scope y caché | `OrganizationContext.tsx`, `OrganizationAccessBoundary.tsx`, `tenantState.ts`, `useArrangementProperties.ts`. |
| Evidencia existente | [Pruebas SPEC-43](../../../06-testing/spec43-arrangement-requests.md), [pruebas SPEC-44](../../../06-testing/spec44-personal-invitations.md), fixtures SQL y browser de ambas. |

Hallazgos previos que condicionaron la implementación:

- `PersonalHomePage` solo renderiza `ExclusiveHomeShell`; personal solo tiene `personal.home.read`.
- `RequestRecord` usa esquemas estrictos compartidos por lector interno/inquilino y no contiene contacto ni responsable. Añadir campos sin separar audiencia rompe parsers o filtra datos.
- SQL, servicio y UI distinguen lectores mediante un booleano `tenant`; agregar personal como un tercer caso exige audiencia explícita. No tratar `tenant = false` como autorización personal.
- El cursor actual liga organización, propiedad, estado y límite, pero no audiencia/membresía personal. Debe versionarse.
- El guard SQL de SPEC-43 autoriza únicamente inquilinos o los cuatro roles internos. Agregar personal al conjunto interno le daría lectura global de organización.
- `ArrangementRequestCard` invalida las órdenes internas locales tras mutar; el historial de inquilino desactiva refetch al enfocar. Ninguno actualiza por sí solo otro navegador.
- SPEC-44 delega aceptaciones no personales a SPEC-42. Extender solamente el formulario deja caminos antiguos para aceptar inquilinos sin teléfono.

| Paso | Tarea | Entrega |
| --- | --- | --- |
| 1 | [TASK-45-01](./TASK-45-01-telefono-e-incorporacion-de-inquilinos.md) | Teléfono en nuevos registros por membresía, aceptación y compatibilidad de inquilinos previos. |
| 2 | [TASK-45-02](./TASK-45-02-persistencia-asignacion-y-rechazo.md) | Asignación/estados, permisos, contratos y auditoría transaccional. |
| 3 | [TASK-45-03](./TASK-45-03-dashboard-personal-y-archivos.md) | Dashboard personal y lectura privada de órdenes/archivos asignados. |
| 4 | [TASK-45-04](./TASK-45-04-gestion-interna-y-actualizacion-compartida.md) | Controles internos, etiquetas del inquilino y actualización entre sesiones. |
| 5 | [TASK-45-05](./TASK-45-05-pruebas-compatibilidad-y-rollout.md) | Integración, concurrencia, navegador y documentación de entrega. |

Fijar proyecciones, transiciones y errores antes de conectar UI. Los pasos 3 y 4 pueden desarrollarse de forma independiente una vez estable el contrato del paso 2. Cada tarea conserva sus pruebas; la última reúne evidencia, no posterga toda la verificación.

## 2. Teléfono y aceptación

### Modelo y validación propuestos

- Añadir `organization_memberships.inquilino_contact_number text null` y un `CHECK` de validez cuando no sea nulo. Los inquilinos ya aceptados conservan nulo sin obligación de completarlo; no aplicar una constraint global que invalide esas filas.
- Requerir el teléfono en todos los caminos de primera incorporación como inquilino después de activar el cambio. Una reactivación o recuperación de una membresía inquilino anterior conserva su dato nullable y no vuelve a exigir registro. La elegibilidad de esta excepción se obtiene del estado/historial persistido, nunca del body ni solo de la fecha de creación de Auth.
- Usar `inquilino_profile: { contact_number: string }` en la aceptación final de una primera incorporación. Para personal conservar `personal_profile` con sus tres campos; para los demás roles y recuperación/reactivación de inquilinos previos conservar el contrato compatible sin perfil nuevo. Rechazar perfiles simultáneos, campos desconocidos o perfiles incompatibles con la invitación bloqueada. La resolución autenticada puede indicar `requires_inquilino_profile` sin exponer teléfono; SQL vuelve a decidirlo al aceptar.
- Propuesta de validación: trim Unicode, 1–64 caracteres, de 7 a 15 dígitos ASCII en total, `+` opcional inicial y separadores espacio, guion o paréntesis. Preservar el texto validado; no inferir país ni convertir a E.164 sin datos suficientes. Rechazar controles, letras, tipos no textuales y cadenas solo de separadores. Mantener servidor/SQL equivalentes.
- El campo está en la incorporación inicial de inquilino, después de autenticar y antes de aceptar, siguiendo el patrón de SPEC-44. La creación de la cuenta Auth no equivale a haber completado la incorporación; el teléfono se guarda con la membresía.
- Explicar junto al campo que el equipo y el personal asignado podrán consultarlo al atender solicitudes. `type="tel"` y `autocomplete="tel"`; error asociado al campo y foco recuperable.

### Transacción y compatibilidad

1. Agregar migración posterior a `20260912150000_spec44_personal_invitations.sql`; no modificar migraciones aplicadas.
2. Inventariar token, handoff, wrappers SPEC-26/37/42/44 y recuperación de commit perdido. Crear núcleo/adaptadores SPEC-45 con ramas explícitas por rol, conservando las garantías de propiedad y perfil personal.
3. En la misma transacción: organización e invitación vigentes, identidad/correo confirmado, teléfono validado, membresía/propiedad, consumo de invitación/handoff y evento. Un fallo de auditoría revierte todo.
4. Los adaptadores viejos no pueden crear un inquilino nuevo sin teléfono. Conservar otros roles y recuperación de aceptaciones ya realizadas sin exigir retroactivamente otro payload ni sobrescribir perfil.
5. Revisar cambios genéricos de rol y otras entradas de membresía para impedir una nueva incorporación inquilino sin contacto. Cuando no exista dato válido, remitir al flujo de incorporación autorizado; no ampliar permisos de gobernanza para capturarlo por terceros.
6. Conservar creación de draft y submit para inquilinos previos sin teléfono, incluidos drafts anteriores. El requisito pertenece al registro nuevo; no agregar un guard global de solicitudes que lo imponga retroactivamente.
7. No agregar formulario de teléfono en Inicio, endpoint para completar perfiles ni indicador de obligación en el contexto organizacional. El teléfono no se incorpora al contexto global ni a serializaciones genéricas de membresía.

La lectura del contacto de una orden une su autor por `(created_by_membership_id, organization_id)`. Proyectar nombre desde `user_profiles.display_name`, correo desde la identidad verificada mediante una consulta privilegiada acotada y teléfono desde esa membresía. No llamar al proveedor Auth por cada tarjeta ni exponer un endpoint de búsqueda global. Si una fuente falta, retornar un valor nullable honesto. No añadir snapshots duplicados de contacto a cada orden; la lectura usa los datos actuales del autor, incluso para solicitudes anteriores.

## 3. Persistencia de asignación y estados

- Añadir `assigned_personal_membership_id uuid null` a `arrangement_orders`, con FK compuesta `(assigned_personal_membership_id, organization_id)` a membresías. Agregar índice parcial por organización/responsable/fecha/ID para órdenes enviadas abiertas. No asignar filas existentes por inferencia.
- Extender la constraint de estado con `rejected`. Añadir una invariante: un responsable no nulo solo es válido en una orden `submitted`, con propiedad/autor y estado `in_progress`. Las consultas personales mantienen la allowlist `open`/`in_progress` de producto.
- No intentar validar rol/estado dinámico del responsable únicamente con una FK o un `CHECK` entre tablas. El RPC bloquea y valida la membresía seleccionada; cada lectura revalida al actor.
- Conservar referencias históricas de auditoría cuando se quita la asignación. Una baja de membresía no borra órdenes ni reasigna trabajo automáticamente. La proyección interna distingue responsable disponible/no disponible sin mostrar un perfil completo de personal.
- Crear adaptador público de servicio `spec45_arrangements` y helpers privados, o un sucesor equivalente. Las rutas HTTP antiguas de estado y los RPC todavía ejecutables deben delegar en las invariantes nuevas; no dejar un bypass con reglas SPEC-43.

| Acción | Precondición | Escritura atómica |
| --- | --- | --- |
| Asignar | Orden `submitted`, `open`/`in_progress`, target personal activo del mismo scope. | Responsable elegido, `in_progress`, versión + 1. |
| Reasignar | Igual, con responsable previo. | Reemplazo, `in_progress`, versión + 1. |
| Quitar asignación | Orden asignada abierta/en proceso. | Responsable nulo, `open`, versión + 1. |
| Rechazar | `submitted`, `open`/`in_progress`; actor interno autorizado. | `rejected`, responsable nulo, versión + 1. |
| Resolver/archivar/devolver a pendiente | Transiciones SPEC-43 autorizadas. | Estado destino, responsable nulo, versión + 1. |
| Reabrir rechazo | `rejected` → `open`. | `open`, responsable nulo, versión + 1. |

Aplicar `expected_version` para todas las acciones. Verificar scope y permisos antes de devolver conflictos; su `current` solo contiene la proyección permitida para ese actor. Un no-op con versión vigente no incrementa versión ni crea eventos. Ante una respuesta perdida, leer la orden y reconciliar estado/responsable: el cliente no debe reenviar automáticamente usando una versión más nueva.

Reutilizar el orden de locks compartido con gobernanza: organización primero, membresías implicadas en orden estable y orden de arreglo; revisar todos los caminos de baja/aceptación/cambio de estado. Asignar contra una suspensión concurrente debe serializarse y validar el estado efectivo al commit.

Actualizar el catálogo/constraint de eventos con los eventos de asignación, reasignación, retirada y rechazo necesarios. Incluir IDs, estado y responsable anterior/nuevo, versión, actor y `request_id`; excluir nombre, correo, teléfono, descripción y archivos. El evento y la mutación se confirman o revierten juntos.

## 4. Capacidades, contratos y privacidad

Registro de capacidades incrementado de `7` a `8`:

| Capacidad | Roles |
| --- | --- |
| `personal.arrangements.read` | Solo personal; siempre condicionada a asignación actual y estado abierto. |
| `arrangements.assignment.manage` | Owner/admin/member; incluye selector dedicado y asignación. |
| `arrangements.requester.read` | Owner/admin/member; contacto de autores de órdenes autorizadas. |
| `arrangements.status.update` | Conservar owner/admin/member; rechazo aplica además su transición restringida. |
| `arrangements.request.reject` | Owner/admin/member; visible únicamente mientras la escritura de rechazo está habilitada. |

Personal conserva `personal.home.read`; no recibe `arrangements.read`, `members.read` ni `files.read`. Su capacidad de lectura asignada permite el contacto de esa misma orden. Mantener controles CSRF/origen, rate limits y `Cache-Control: no-store` de rutas existentes.

### API propuesta

Prefijo: `/api/organizations/:organization/arrangements`. El parámetro se resuelve con la sesión; ni el body ni el slug son autoridad de organización.

| Método/ruta | Contrato y acceso |
| --- | --- |
| `GET /personal/orders` | Lista paginada de la membresía personal actual; no acepta responsable/propiedad/organización enviados como filtros de autoridad. |
| `GET /personal/orders/:orderId` | Detalle de una orden que sigue asignada y abierta, bajo el mismo guard SQL. |
| `GET /personal/orders/:orderId/assets/:assetId/view` | Solo archivo verificado de esa orden; reutiliza el servicio privado de assets. |
| `GET /personal/assignees` | Selector paginado para `arrangements.assignment.manage`; membresías personal activas del scope. |
| `PATCH /orders/:orderId/assignment` | `{ assigned_personal_membership_id: UUID, expected_version: integer }`; asigna o reasigna. |
| `DELETE /orders/:orderId/assignment` | `{ expected_version: integer }`; quita la asignación y devuelve `open`. |
| `POST /orders/:orderId/reject` | `{ expected_version: integer }`; transición a rechazo. |
| `PATCH /orders/:orderId/status` | Ruta existente, con enum/transiciones/invariantes actualizados. |
| `GET /changes` | Señales autenticadas de invalidación autorizadas por audiencia; propuesta de sección 6. |

La aceptación conserva `POST /api/invitations/accept` con la rama `inquilino_profile`. `POST /api/invitations/acceptance-context` resuelve de forma autenticada si el formulario es obligatorio. Las lecturas completas y mutaciones usan el contrato 3; el rollout controla clientes anteriores según el runbook.

- Crear DTOs explícitos para gestor, viewer, inquilino y personal. El objeto `requester: { name, email, contact_number }` existe solo en gestor/personal; campos individuales pueden ser nulos y `requester` es nulo para legacy sin autor.
- El DTO del gestor incluye `assignee` mínimo y disponibilidad; el selector devuelve ID de membresía, nombre y ocupación. No devolver registro completo de membresía ni teléfono de personal por defecto.
- El inquilino conserva el contrato compartido de propiedad sin datos ajenos; viewer mantiene los campos anteriores. Todos reconocen `rejected` donde corresponda.
- Sustituir booleanos `tenant` por audiencia explícita en código compartido; la audiencia se deriva de ruta/actor en servidor, nunca de un parámetro libre del cliente.
- Versionar cursores y ligarlos a organización, audiencia, membresía cuando restringe acceso, propiedad del inquilino, filtro y límite. Aplicar scope/asignación/estado en SQL antes de paginar. Un cursor firmado no sustituye el guard vigente.
- Aplicar el mismo guard a detalle, archivo y señal de actualización. En reassign/reject, el personal anterior puede recibir una señal genérica de invalidación de su scope, nunca datos de la nueva asignación o contacto.
- Mantener RLS forzado, tablas privadas y grants browser denegados. Exponer a `service_role` solo RPCs autorizados; helpers con `search_path` fijo y objetos calificados, sin grants de ejecución innecesarios.

## 5. Interfaces y archivos

- Montar `PersonalArrangements` dentro de `PersonalHomePage`/`ExclusiveHomeShell`, únicamente después de resolver organización/rol/capacidad. Usar claves de consulta con organización, epoch, membresía y audiencia.
- Reutilizar presentación de descripción, propiedad y assets con props/DTOs por audiencia. No usar el booleano actual de tarjeta para que personal obtenga controles internos.
- Mostrar nombre/correo/teléfono del solicitante en gestor/personal, incluyendo estados faltantes. Textos planos con overflow controlado; labels accesibles, foco visible y controles de carga/retry.
- En el dashboard interno, agregar selector, confirmación de rechazo, responsable y cambios de asignación. Deshabilitar durante envío; reflejar solo el commit confirmado. Un error de versión refresca la orden y requiere revisar antes de volver a guardar.
- Conservar propiedades e invitaciones existentes y no depender de `members.read` para asignar. El viewer no monta controles ni solicita contactos/selector.
- El inquilino ve `Rechazada` y los demás estados; no ve datos de otros autores o de personal. Los inquilinos previos sin teléfono conservan el formulario de solicitudes, sin captura adicional de contacto.
- Al retirar una orden del personal, cerrar su detalle y descartar URLs en memoria. La autorización de un enlace se comprueba al emitirlo; registrar el TTL real y el límite de revocación de URLs ya entregadas.
- No cambiar límites, receptores MIME, bucket, políticas de verificación/retención ni uploads de SPEC-43. El nuevo acceso personal solo lee assets ya asociados y verificados.

## 6. Actualización entre sesiones

La decisión funcional es actualizar sin recarga. Propuesta técnica: SSE autenticado en `/changes` para emitir únicamente invalidaciones mínimas y volver a consultar las APIs autorizadas. Comprobar soporte del runtime alojado antes de escoger SSE; un transporte alternativo debe cumplir los mismos criterios, no agregar suscripciones directas y amplias a tablas privadas.

1. Generar señales a partir de cambios comprometidos, con entrega que funcione entre instancias/procesos. Usar un feed durable/outbox o lectura de revisiones comprometidas; no depender solo de un emisor en memoria del proceso HTTP.
2. Autorizar cada audiencia: gestores en su organización, inquilinos en su propiedad y personal en su membresía. El canal no transporta filas, contactos, paths ni URLs. Cuando se pierda acceso, puede emitir `invalidate` sin ID y cerrar la conexión si la membresía quedó inactiva.
3. Revalidar sesión/rol/organización durante la vida de la conexión. Al cambiar contexto, abortar la suscripción, consultas y caché anteriores. Un token de conexión no debe prolongar una sesión revocada.
4. Tras invalidación, retirar datos potencialmente revocados antes de reconsultar; sustituir las páginas cargadas afectadas, no dejar órdenes antiguas en una segunda página ni acumular duplicados. Una respuesta iniciada antes de la invalidación no puede restaurar datos.
5. Reconectar con backoff y refetch canónico; al enfocar/regresar a la pestaña, actualizar aunque no se hayan recibido todas las señales. Deducir huecos por versión/revisión y recuperar mediante nueva consulta, sin reproducir PII de un log.
6. Prueba propuesta: con tres sesiones visibles, conexión sana y señal disponible, las vistas convergen al estado confirmado dentro de **2 segundos del commit**, sin recarga manual. Registrar medición real y condiciones. Una desconexión prueba recuperación, no ese umbral.

El cambio se guarda una sola vez en `arrangement_orders`; no existen estados independientes para interno, inquilino y personal. La UI del actor usa la respuesta canónica y los demás clientes revalidan contra esa misma fuente.

## 7. Verificación y rollout

Ejecutar los checks generales al implementar:

```bash
npm --prefix backend test
npm --prefix backend run typecheck
npm --prefix backend run build
npm --prefix frontend test
npm --prefix frontend run lint
npm --prefix frontend run build
git diff --check
```

Los harnesses SPEC-45 cubren base vacía desechable, upgrade desde SPEC-44, conexiones concurrentes y browser con API/RPC reales. El setup rechaza bases no desechables. Sus archivos, condiciones y resultados se documentan en la evidencia enlazada arriba; las pruebas alojadas siguen pendientes.

- Probar asignar/reasignar/rechazar con dos gestores concurrentes, asignación versus baja, estado versus asignación, rollback de auditoría y aceptación simultánea con teléfono/recuperación sin sobrescribirlo.
- Dos personas de personal en la misma organización y una en otra; dos propiedades, dos inquilinos en una propiedad, invitación pendiente, membresías suspendidas/removidas y filas legacy. Asegurar más de una página.
- Verificar DTOs reales, errores, señales y archivos para cada audiencia, incluidos requester inaccesible por un ID manipulado y cursores cruzados. Probar creación/envío por inquilinos previos sin teléfono después del upgrade.
- Usar sesiones browser separadas para gestor/inquilino/personal; probar convergencia, reconexión, respuestas tardías y revocación en una página posterior. Viewports: `1280×800`, `390×844`, `320×740`, teclado/foco y consola limpia.
- Actualizar las aserciones SPEC-44 que exigen Inicio vacío/ausencia de todas las consultas de producto para aceptar exclusivamente las nuevas consultas autorizadas. Mantener restricciones de navegación y regresión de invitaciones.
- Antes del rollout, inventariar teléfonos nulos, órdenes legacy, estados y asignaciones con conteos agregados. Aplicar migración aditiva con compatibilidad para lectores anteriores; desplegar backend y frontend capaces de leer `rejected` antes de habilitar escrituras que lo produzcan.
- Activar captura obligatoria de teléfono cuando el formulario y adaptadores compatibles estén disponibles. Mantener compatibilidad de invitaciones pendientes y una respuesta recuperable para un frontend viejo; nunca consumir la invitación incompleta.
- Conservar gates de SPEC-31/POL-09 y comprobar configuración privada del entorno si se verifica media alojada. No declarar completado el rollout por tener una migración de desarrollo aplicada.
- Recuperación: deshabilitar nuevas acciones si fuera necesario, preservar teléfonos/órdenes/auditoría, conservar lectura de los cinco estados y evitar un downgrade de frontend que no pueda parsear `rejected`. No borrar columnas/datos para volver atrás.

Evidencia entregada en `docs/06-testing/spec45-personal-assignments.md` y runbook en `docs/03-operation/spec45-personal-assignments-runbook.md`. Registrar por separado pruebas locales, migración, configuración, despliegue y smoke tests efectivamente ejecutados.
