# Guía de implementación — SPEC-42

Esta guía define cómo activar la propiedad mínima de Gestión de arreglos y extender la invitación existente para que la incorporación de un inquilino incluya su propiedad. La implementación se verificó localmente el 2026-09-12; la [evidencia y los comandos reproducibles](../../../06-testing/spec42-property-invitations.md) cubren las cuatro tareas. El inventario y ambas migraciones se completaron en la rama Supabase de desarrollo `multi-tenant` el 2026-09-12, con [evidencia independiente](../../../06-testing/spec42-property-invitations.md#development-migration--2026-09-12). El despliegue de la aplicación y los smoke tests alojados permanecen pendientes.

## 1. Secuencia y puntos de integración

1. Implementar `TASK-42-01`: entidad independiente, capacidades, creación idempotente y lectura por organización.
2. Implementar `TASK-42-02`: referencia en invitaciones/membresías, aceptación atómica, asociación de miembros previos y cierre de caminos alternativos.
3. Implementar `TASK-42-03`: formulario, sección de propiedades, invitaciones y proyección de propiedad en la aceptación. Puede avanzar con contratos fijados mientras se termina el backend.
4. Cerrar `TASK-42-04`: pruebas con persistencia real, compatibilidad de registros anteriores, documentación y evidencia de rollout.

Revisar estos puntos del repositorio antes de editar:

| Área | Archivos actuales |
| --- | --- |
| Dashboard | `frontend/src/pages/ArrangementsPage.tsx`, `frontend/src/features/arrangements/components/ArrangementOrdersDashboard.tsx`, hooks, tipos y `services/arrangementsApi.ts` de esa feature |
| API de arreglos | `backend/src/routes/arrangements.ts`, `backend/src/arrangements/arrangementOrderRepository.ts`, `backend/src/services/listArrangementOrders.ts`, montaje de rutas en `backend/src/index.ts` |
| Organización y permisos | `backend/src/organizations/types.ts`, `roleCapabilities.ts`, `organizationService.ts`, `membershipService.ts`, `organizationRepository.ts` |
| Invitaciones y registro | `backend/src/routes/organizationGovernance.ts`, `backend/src/organizations/invitationWorkflow.ts`, `invitationTokens.ts`, `invitationDelivery.ts` |
| Invitación y miembros en frontend | `frontend/src/features/organizations/types.ts`, `services/organizationApi.ts`, `components/OrganizationGovernancePanel.tsx`, `frontend/src/pages/InvitationAcceptPage.tsx` |
| Contexto y destino | `backend/src/identity/organizationHome.ts`, `frontend/src/app/contexts/OrganizationContext.tsx`, `frontend/src/App.tsx` |
| Persistencia vigente | Migraciones de SPEC-26/35/37/40 y las correcciones posteriores de handoffs, tokens y proyecciones |

No copiar la migración original de una RPC sin revisar sus redefiniciones posteriores. La aceptación usa `spec37_accept_invitation_handoff`; también existe `spec26_accept_invitation` en el repositorio. La garantía de propiedad debe cubrir cualquier entrada ejecutable, no solo el endpoint usado por la pantalla nueva.

## 2. Modelo mínimo y migración

Crear migraciones hacia adelante, con timestamps posteriores a los existentes. No modificar migraciones aplicadas ni renombrar el dominio `public.properties` de SPEC-30.

Se recomienda esta representación, que aprovecha la cardinalidad confirmada sin agregar una segunda entidad de persona:

| Registro | Cambio propuesto |
| --- | --- |
| `arrangement_properties` | Nueva tabla con `id uuid`, `organization_id`, `name`; incluir autoría, fecha de creación y material de idempotencia/fingerprint necesario para las operaciones. |
| `organization_invitations` | Referencia nullable `arrangement_property_id` a la propiedad elegida. Obligatoria para nuevas invitaciones `inquilino` y ausente para otros roles. |
| `organization_memberships` | Referencia nullable `arrangement_property_id`; una sola referencia por membresía permite varios miembros en una propiedad. Obligatoria al crear/reactivar un inquilino o cambiar hacia ese rol después del corte. |

La nulabilidad permite conservar filas históricas. No habilita nuevos inquilinos sin propiedad: usar guards transaccionales/constraints adecuados para las escrituras posteriores, incluidos aceptación y cambios de rol. La migración debe distinguir filas previas de nuevas escrituras sin aceptar un flag legacy enviado por el cliente.

- `arrangement_properties` tiene `unique (id, organization_id)` y validación de nombre recortado de 1 a 200 caracteres; no imponer unicidad sobre el nombre.
- Las referencias desde invitaciones y membresías son FK compuestas `(arrangement_property_id, organization_id)`. La autoría también debe pertenecer a la organización mediante FK compuesta a membresías.
- No agregar `unique` sobre propiedad en membresías: impediría varios inquilinos por propiedad.
- No usar `auth.users`, `user_profiles`, `properties.assigned_to_user_id` ni participantes de contratos para almacenar la asociación nueva.
- Conservar la referencia cuando una membresía se suspende, remueve o cambia a un rol interno; derivar la condición de inquilino activo a partir de rol y estado. No ofrecer reasignación a otra propiedad en esta entrega.
- Crear índices con organización primero para listar propiedades y consultar miembros/invitaciones por propiedad. Los candidatos a asociación se filtran por organización, rol `inquilino`, estado activo y referencia nula en SQL.
- Habilitar y forzar RLS en la tabla nueva, denegar acceso directo a `anon`/`authenticated` y conceder al servicio solo las operaciones necesarias. Las RPC privilegiadas tienen search path fijo, objetos calificados y grants de ejecución restringidos.
- Revalidar actor, organización, membresía y propiedad dentro de las mutaciones, bajo locks coherentes con los de gobierno de organizaciones. Una autorización HTTP anterior no basta para carreras con suspensión o cambio de rol.
- Persistir propiedad/asociación y auditoría en la misma transacción. Si se extiende el catálogo de `organization_events`, hacerlo de forma explícita y acotada; registrar IDs y acciones, sin nombre/correo completo ni tokens en metadata operativa.

La creación requiere una clave durable vinculada a organización, actor y fingerprint del nombre normalizado. Misma clave y mismo contenido devuelve el mismo ID; misma clave y otro contenido produce conflicto. No usar un mapa de proceso, `request_id` de logging ni el nombre como autoridad de idempotencia.

## 3. Capacidades y contratos HTTP

Conservar `arrangements.read` para leer ID/nombre de propiedades. Agregar capacidades específicas, por ejemplo `arrangements.properties.create` y `arrangements.inquilinos.manage`, solo a `owner`/`admin`; actualizar tipos frontend/backend y versión del registro. No reutilizar `properties.write`, porque hoy también pertenece a `member` y representa otro flujo.

Para invitaciones exigir además `members.invite`; para datos de miembros y asociación, las capacidades de lectura/gestión de miembros correspondientes. Las listas de inquilinos e invitaciones nunca forman parte de la proyección general de lectura del dashboard.

Contratos propuestos bajo el montaje existente de arreglos:

| Método y ruta | Entrada / resultado | Autoridad |
| --- | --- | --- |
| `GET /api/organizations/:organization/arrangements/properties` | Cursor/límite acotados; `{ items: [{ id, name }], next_cursor }` | `arrangements.read` |
| `POST /api/organizations/:organization/arrangements/properties` | `{ name }` y clave de idempotencia; propiedad persistida | `arrangements.properties.create` |
| `GET /api/organizations/:organization/arrangements/properties/:propertyId/inquilinos` | Membresías asociadas, con nombre visible, estado y versión necesarios para la vista; paginado | Gestión de inquilinos y lectura de miembros |
| `GET /api/organizations/:organization/arrangements/properties/:propertyId/invitations` | Invitaciones de esa propiedad con correo enmascarado, estados y vencimiento; paginado, sin enlaces | Gestión de inquilinos y lectura de miembros |
| `GET /api/organizations/:organization/arrangements/inquilinos/available` | Inquilinos activos sin propiedad; paginado y filtrado en SQL | Gestión de inquilinos y lectura de miembros |
| `POST /api/organizations/:organization/arrangements/properties/:propertyId/inquilinos` | `{ membership_id, expected_version }`; asociación de un inquilino existente | Gestión de inquilinos y gestión de miembros |
| `POST /api/organizations/:organization/arrangements/properties/:propertyId/invitations` | `{ email }` y clave de idempotencia; recibo manual de invitación con referencia de propiedad | Gestión de inquilinos y `members.invite` |

Los nombres exactos pueden ajustarse a las convenciones existentes, manteniendo una sola implementación de las reglas de dominio. Los endpoints de rotación/revocación actuales se reutilizan; deben preservar y verificar la referencia de propiedad.

- Construir `OrganizationScope` desde `SessionService.context` y pasar ese scope a cada servicio/repositorio. No confiar en `organization_id`, actor ni rol recibidos por JSON.
- La ruta contiene una propiedad seleccionada, pero el servidor debe resolverla dentro del scope y verificar permisos antes de tocar Auth o emitir tokens.
- Usar schemas estrictos para las entradas. El cliente no elige ID, rol ni propiedad durante registro/aceptación.
- Proyectar explícitamente los campos permitidos; no serializar la fila completa de invitación o membresía por haber agregado una columna.
- Mantener CSRF, origen, cookies, `no-store`, `no-referrer`, errores seguros y límites distribuidos. Añadir las acciones nuevas al registro de políticas de tasa.
- Reutilizar el cursor opaco con límite y filtro ligados al scope. No usar la lista global de miembros ni filtrar entre organizaciones en frontend.
- Documentar errores distinguibles para validación, referencia requerida, asociación en conflicto, versión obsoleta y operación no disponible. Un ID ajeno sigue devolviendo `NOT_FOUND` genérico.

## 4. Invitación y aceptación atómica

### Emisión y ciclo de vida

Extender el servicio común de invitaciones y su persistencia, en lugar de crear otro sistema de tokens. El endpoint del dashboard fija `inquilino` server-side y pasa la referencia de propiedad validada al servicio.

1. Resolver sesión/scope, permisos, nombre/correo y propiedad antes de cualquier aprovisionamiento de identidad.
2. Comprobar membresías o invitaciones en conflicto sin confirmar al invitante datos globales de Auth. Una cuenta global existente puede recibir la invitación; una membresía activa de la misma organización no se convierte mediante ella.
3. Reutilizar el aprovisionamiento vigente de identidad/perfil cuando sea necesario. Esa operación externa no es una transacción de membresía y no debe reportarse como incorporación completa.
4. Persistir invitación, referencia de propiedad, idempotencia y auditoría antes de devolver `share_url`.
5. Retornar el recibo manual actual con el token solo en el fragmento del enlace. No enviar correo automáticamente ni almacenar el enlace en consultas persistentes.
6. Rotar/reemplazar conserva la referencia; revocar invalida handoffs. Cubrir las RPC de resend/rotate y sus proyecciones, no solo la emisión inicial.

Conservar la exclusión de invitaciones pendientes incompatibles por correo/organización. Dos intentos simultáneos para propiedades distintas deben serializarse o chocar con una constraint; uno no puede sustituir silenciosamente al otro. Si el token se devuelve una sola vez y la respuesta se pierde, devolver un estado recuperable y permitir la rotación explícita del mismo registro lógico.

### Resolución, registro y aceptación

Extender `InvitationResolutionRecord`, `InvitationResolution` y la respuesta de resolución con una proyección nullable `{ id, name }` de la propiedad. Para `inquilino`, resolver/registrar requiere que esa referencia sea válida; para otros roles, conservar el comportamiento anterior. No convertir la resolución del token en una API de búsqueda de propiedades o miembros.

El registro actual activa la cuenta y crea sesión antes de la aceptación. Conservar esa separación y validar la propiedad en las RPC de contexto/completado de registro; si Auth ya fue activado y después falla la validación, no crear membresía y permitir continuar por login cuando exista una invitación válida.

La aceptación debe ejecutar en una única transacción:

1. Validar y bloquear handoff, versión vigente del token, invitación y organización en el orden utilizado por las mutaciones relacionadas.
2. Revalidar identidad/correo invitado, expiración, estado organizacional, rol persistido y FK de propiedad.
3. Bloquear cualquier membresía existente y aplicar la política actual de incorporación/reactivación. Una membresía activa produce el conflicto vigente; una referencia previa a otra propiedad también produce conflicto y no se sobrescribe.
4. Crear o reactivar la membresía `inquilino` con `arrangement_property_id` tomado de la invitación, nunca de la solicitud del invitado.
5. Consumir invitación/handoff y guardar auditoría con el ID de propiedad. Un fallo en cualquiera de estas escrituras revierte todas.
6. Devolver el resultado confirmado; refrescar sesión/contexto y resolver el destino con SPEC-40.

No realizar un PATCH de propiedad después de aceptar ni un efecto de React para completar la asociación. Una sesión puede existir sin membresía mientras se activa Auth; una incorporación confirmada por SPEC-42 no puede existir sin propiedad.

Una pérdida de respuesta posterior al commit se recupera consultando contexto/membresía autenticados. Si se permite devolver un resultado ya confirmado al reintentar, revalidar que corresponde a la misma identidad, organización y operación y que el estado actual aún lo permite. No reutilizar un token consumido para incorporar otra cuenta ni para reactivar una membresía posteriormente suspendida.

### Caminos previos y miembros existentes

- Extender el contrato general de invitación para exigir `arrangement_property_id` cuando el rol sea `inquilino`, usando el servicio común. El panel general puede dirigir a Gestión de arreglos para emitir esa invitación.
- Aplicar el requisito también en RPC ejecutables directamente por el servicio y en cualquier aceptación legacy; no dejar que una firma anterior omita la nueva garantía.
- Revisar `MembershipService.changeRole`, `transferOwnership` y las RPC redefinidas en SPEC-40. Si una transición produce `inquilino`, persistir la propiedad junto con el rol o rechazarla cuando no exista una referencia válida. Conservar controles de último owner, autoasignación, jerarquía y versión.
- Para asociar un inquilino activo previo sin propiedad, usar una mutación con versión esperada y lock de membresía. Una repetición hacia la misma propiedad devuelve el estado actual; otra propiedad devuelve conflicto. No reactivar ni cambiar roles desde esa acción.
- Suspensión/remoción conserva referencia; una reactivación de inquilino sin propiedad no puede eludir la validación. Las asociaciones existentes a otra propiedad requieren un flujo futuro de traslado, no un overwrite.

## 5. Dashboard y formularios

Mantener `ArrangementsPage` y extraer la nueva sección dentro de `features/arrangements`. Usar React Hook Form, Zod y los componentes actuales para formularios, diálogos, botones, errores y estados de espera.

- Reemplazar el handler inerte de `Generar propiedad` por el formulario de nombre, solo para gestores autorizados. Los roles de lectura conservan su acceso al dashboard sin el control de mutación.
- Mantener `Órdenes abiertas`, filtro, `Cargar más` e `Inicio`. Separar el estado de carga/error de propiedades de la consulta de órdenes.
- Mostrar ID/nombre de propiedades y, para gestores, `Agregar inquilino`, candidatos existentes e invitaciones de la propiedad seleccionada.
- Distinguir `Invitación pendiente` de una membresía con rol/estado activo; suspensión o cambio de rol no debe quedar representado como inquilino activo por conservar el FK.
- Mostrar la propiedad seleccionada al generar una invitación. No pedir nombre de organización, rol ni un nuevo nombre de persona para duplicar el registro existente.
- Mantener el enlace en memoria del recibo y ofrecer copia, rotación y revocación explícitas. No colocar tokens o `share_url` en localStorage, historial de consultas o telemetría; limpiar al cerrar, cambiar contexto o cerrar sesión.
- En `InvitationAcceptPage`, mostrar ID/nombre de la propiedad del servidor como dato de solo lectura. Reutilizar contraseña/login/Google y aceptación actuales sin permitir seleccionar otra propiedad.
- Actualizar `OrganizationGovernancePanel` para que la invitación general `inquilino` no omita propiedad. Conservar invitaciones y etiquetas de los otros roles.
- Usar claves de consulta con organización primero y propiedad/filtros después; invalidar propiedades, miembros e invitaciones afectados tras un éxito. No mezclar cachés con el dominio de SPEC-30.
- Descartar respuestas tardías, cancelar solicitudes y desmontar formularios en cambios de identidad, organización o autorización; no conservar enlaces de un contexto anterior.
- Verificar teclado, foco inicial/restauración, errores accesibles, espera sin doble envío y ausencia de overflow en 1280×800, 390×844 y 320×740.

## 6. Pruebas y evidencia

| Capa | Evidencia requerida |
| --- | --- |
| Servicios y HTTP | Capacidades, scope A/B, nombre/correo, proyecciones por permiso, conflictos, idempotencia, invariantes de invitación y asociación, rechazo antes de efectos de Auth |
| PostgreSQL real | FKs compuestas, grants/RLS, guard de nuevas escrituras, aceptación atómica, rollback por fallo inyectado, locks/carreras, reactivación, variantes legacy de RPC y preservación de referencias en rotación/reemplazo |
| Integración frontend | Crear y recargar propiedad, seleccionar, invitar/copiar, asociación de miembro previo, conflictos, navegación/contexto, y propiedad de solo lectura en la aceptación |
| Recorrido de incorporación | Dashboard → API → base de datos → enlace/handoff → registro o login → aceptación → membresía y propiedad persistidas → Inicio exclusivo |
| Regresión | Órdenes y filtros de SPEC-39, permisos/destino de SPEC-40, invitaciones de otros roles de SPEC-37, registro owner de SPEC-41 y flujo completo de propiedades sin efectos nuevos |

Crear pruebas focalizadas, por ejemplo `backend/tests/unit/spec42-arrangement-properties.test.ts`, `backend/tests/integration/spec42-property-invitations.test.ts`, `supabase/tests/spec42_property_invitations.sql` y `frontend/tests/e2e/arrangement-property-invitations.spec.ts`. Estos nombres son destinos propuestos, no archivos ya existentes.

Actualizar las pruebas de SPEC-39 que exigen un botón inerte: la nueva expectativa es apertura de formulario para un gestor y ausencia del control de escritura para roles de lectura. Conservar los demás checks de órdenes y navegación. Ajustar fixtures de SPEC-40 que crean nuevas invitaciones `inquilino` para incluir una propiedad, y mantener fixtures separados de filas legacy sin asociación.

Las pruebas SQL deben invocar las RPC contra PostgreSQL/Supabase desechable con dependencias de identidad, membresías y handoffs. La inspección textual de migraciones no demuestra atomicidad. Inyectar un fallo en la escritura de asociación/auditoría y comprobar que no hubo membresía nueva ni consumo de invitación. Ejecutar carreras reales de invitaciones/aceptaciones/asociaciones, además de reintentos secuenciales.

El recorrido de navegador debe usar repositorio real al menos en un caso completo y comprobar varias cuentas en una propiedad y la misma identidad en organizaciones A/B. Los adaptadores de Auth pueden estar controlados; registrar ese límite y no presentar una simulación de proveedor como validación alojada.

Comandos de cierre de implementación, después de las pruebas focalizadas:

```bash
npm --prefix backend test
npm --prefix backend run typecheck
npm --prefix backend run build
npm --prefix frontend test
npm --prefix frontend run lint
npm --prefix frontend run build
npm --prefix frontend run test:e2e -- tests/e2e/arrangement-property-invitations.spec.ts tests/e2e/arrangements-navigation.spec.ts tests/e2e/inquilino-navigation.spec.ts
psql "$SPEC42_TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/spec42_property_invitations.sql
git diff --check
```

Los comandos, resultados, capturas generadas y límites del entorno están registrados en [docs/06-testing/spec42-property-invitations.md](../../../06-testing/spec42-property-invitations.md) y enlazados desde las tareas. La preparación documentada se verificó en bases vacías tanto sin fixtures como con filas legacy previas al corte.

## 7. Compatibilidad y rollout

1. Inventariar el esquema y las RPC efectivas del destino, junto con membresías e invitaciones `inquilino` sin propiedad. No deducir el estado alojado a partir del número de SPEC ni incluir migraciones ajenas pendientes por accidente.
2. Preparar esquema aditivo y aplicaciones compatibles. Si hacen falta varios pasos de migración, mantener la nueva UI deshabilitada hasta disponer de la validación completa y aceptación atómica.
3. Coordinar el corte de las escrituras de inquilino: después de habilitar la funcionalidad, ninguna versión previa de API/RPC puede aceptar o emitir un inquilino sin propiedad. Los clientes antiguos reciben error seguro y orientación a actualizar, no un bypass.
4. Las invitaciones legacy sin propiedad se rechazan en resolución/registro/aceptación y requieren reemplazo explícito. Un administrador las revoca y genera otra desde la propiedad correcta; no inventar el FK ni conservar handoffs anteriores utilizables.
5. Las membresías históricas sin propiedad conservan los accesos de SPEC-40 y aparecen para asociación administrativa. El invariante de nuevas incorporaciones no exige borrar o suspender esas cuentas para desplegar.
6. Verificar en el entorno elegido creación, invitación, incorporación, referencia persistida, acceso posterior y rechazo A/B. Registrar versiones de esquema/backend/frontend y limitaciones de proveedores.
7. Ante problemas, detener nuevas creaciones/invitaciones y desplegar una corrección compatible. No eliminar propiedades, referencias ni membresías, ni volver a una aceptación que ignore la asociación. Mantener la recuperación de operaciones ya confirmadas y el acceso de inquilinos existentes.

Actualizar la documentación de APIs y el runbook de invitaciones con los campos/requisitos nuevos y el procedimiento de reemplazo legacy. Puede agregarse `docs/03-operation/spec42-property-invitations-runbook.md` para operación específica. La implementación local y el rollout alojado se registran por separado; no marcar despliegue completado con evidencia de pruebas locales.

## Restricciones de implementación

- No reutilizar el formulario, tabla o pipelines de la propiedad completa para el registro mínimo confirmado.
- No hacer de `arrangement_property_id` un atributo global de usuario ni de un participante contractual.
- No crear membresías activas al generar un enlace ni completar la asociación después del commit de aceptación.
- No aceptar asignaciones implícitas por correo, contrato, nombre, tenant de la URL o campos arbitrarios del cliente.
- No conceder capacidades de gestión a `member`, `viewer` o `inquilino` para facilitar la UI.
- No agregar traslado, baja o edición de propiedades/inquilinos ni una relación nueva con órdenes.
- No enviar mensajes reales, ejecutar migraciones remotas ni reportar despliegues como parte de la redacción de esta SPEC.
