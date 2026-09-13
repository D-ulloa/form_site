# Guía de implementación — SPEC-44

Estado: implementado y verificado localmente el 2026-09-12. Migración aplicada y verificada en desarrollo `multi-tenant` el mismo día. Despliegue y smoke test pendientes. [Evidencia y reproducción](../../../06-testing/spec44-personal-invitations.md).

Plan contrastado con el código local el 2026-09-12. Las decisiones técnicas implementadas abajo concretan la SPEC; no modifican sus decisiones de producto.

La secuencia recomendada es: agregar persistencia/validación del rol → extender invitación y aceptación desde Gestión de arreglos → incorporar contexto y ruta exclusiva → validar compatibilidad y rollout.

## Decisiones confirmadas

1. **Captura del perfil:** la persona invitada completa `Nombre`, `Número de contacto` y `Ocupación` durante la aceptación, tras registrarse o autenticar una cuenta existente. Los tres campos son obligatorios y se guardan con la membresía al finalizar la aceptación.
2. **Invitación:** el invitador ingresa el correo de destino. Los datos de perfil no forman parte de la invitación pendiente.
3. **Entrega:** se reutiliza el correo como identidad y el mecanismo actual de enlace manual/entrega configurada; no se agrega invitación por número telefónico.

La captura se solicita en el flujo de aceptación tanto a cuentas nuevas como a personas con una cuenta existente. Una validación fallida no consume la invitación y permite corregir los campos mientras siga vigente.

## Puntos de integración del repositorio

| Área | Código vigente a extender |
| --- | --- |
| Roles/capacidades | `backend/src/organizations/types.ts`, `backend/src/organizations/roleCapabilities.ts`, `frontend/src/features/organizations/types.ts` |
| Invitaciones desde arreglos | `backend/src/routes/arrangementProperties.ts`, `backend/src/organizations/organizationService.ts`, `backend/src/organizations/organizationRepository.ts` |
| Aprovisionamiento de identidad | `backend/src/identity/identityProvisioningTypes.ts`, `identityProvisioningService.ts`, `identityProvisioningRepository.ts`; RPC `spec35_claim_identity_provisioning` |
| Invitación general y aceptación | `backend/src/routes/organizationGovernance.ts`, `backend/src/organizations/invitationWorkflow.ts`, `frontend/src/pages/InvitationAcceptPage.tsx`, `frontend/src/features/organizations/services/organizationApi.ts` |
| Contexto y rutas | `backend/src/identity/organizationHome.ts`, `backend/src/identity/identityRepository.ts`, `frontend/src/app/contexts/OrganizationContext.tsx`, `frontend/src/app/OrganizationAccessBoundary.tsx`, `frontend/src/App.tsx` |
| Dashboard | `frontend/src/features/arrangements/components/ArrangementOrdersDashboard.tsx` y los componentes/secciones de SPEC-42 |
| Ciclo de vida y privacidad | `backend/src/organizations/membershipService.ts`, `errors.ts`, `invitationDelivery.ts`, `frontend/src/features/organizations/components/OrganizationGovernancePanel.tsx` |
| Migraciones y evidencia | Restricciones y RPC de SPEC-26/35/37/40/42, esquema posterior a SPEC-43; agregar migración y pruebas nuevas numeradas SPEC-44 |

### Hallazgos que determinan el plan

- `OrganizationService.inviteMember` exige `members.invite` antes de aprovisionar identidad. Agregar una excepción por rol en ese método ampliaría la entrada general: crear un método dedicado y compartir solo la mecánica interna de emisión.
- `identityProvisioningRepository.assertActor` y `spec35_claim_identity_provisioning` solo permiten invitantes `owner`/`admin`. El caso `member` necesita autorización acotada también en estas dos capas; cambiar solo la ruta produciría un flujo que falla antes de crear la invitación.
- La tabla `arrangement_invitation_operations` de SPEC-42 exige una propiedad. No sirve directamente para personal. Crear un registro de operación específico sin propiedad conserva esa garantía de inquilinos.
- La aceptación vigente usa `spec37_accept_invitation_handoff`, cuyo núcleo privado es `spec42_accept_property_invitation`; `spec26_accept_invitation` también llama ese núcleo. Deben cubrirse ambos adaptadores y `spec42_recover_accepted_handoff`.
- La API de aceptación y el cliente actualmente solo admiten un body vacío. El formulario de registro ya pide un nombre global: el nuevo nombre de membresía debe tener estado y persistencia separados.
- `InquilinoHomePage` ya monta `InquilinoArrangements` por SPEC-43. Extraer su estructura visual compartida, manteniendo el contenido de cada página separado, evita cargar solicitudes en Inicio personal.

### Orden de trabajo y entregables

| Paso | Tarea | Entrega revisable |
| --- | --- | --- |
| 1 | [TASK-44-01](./TASK-44-01-rol-personal-perfil-y-autorizacion.md) | Tipos, matriz de permisos, esquema, operación durable, autoridad de provisioning y núcleo SQL de aceptación con perfil. |
| 2 | [TASK-44-02](./TASK-44-02-invitacion-desde-gestion-de-arreglos.md) | Adaptadores HTTP/repositorio, invitación desde arreglos, recuperación del enlace y captura del perfil después de autenticarse. |
| 3 | [TASK-44-03](./TASK-44-03-inicio-personal-compatibilidad-y-rollout.md) | Destino confirmado, barrera de rutas, shell e Inicio personal; verificación integrada y evidencia de entrega. |

Fijar contratos de los pasos 1 y 2 antes de conectar formularios. Escribir las pruebas de dominio junto con cada cambio; el paso 3 reúne la evidencia completa. La preparación del rollout no equivale a aplicarlo.

## 1. Contrato del rol y autorización

- Registrar `personal` como valor explícito en backend, frontend, parser de contexto y restricciones SQL de membresías e invitaciones.
- Incrementar la versión del registro de capacidades. Asignar `personal.home.read` solo a `personal`.
- Añadir `arrangements.personal.invite` a `owner`, `admin` y `member`; incrementar el registro de `6` a `7`.
- No agregar `members.invite` a `member`. La nueva capacidad solo autoriza la operación dedicada de arreglos cuyo rol de destino es fijo `personal`.
- Rechazar invitaciones a roles distintos de `personal` desde la operación dedicada aunque el body intente modificar `intended_role`. Mantener la matriz de invitaciones de gobernanza actual para operaciones generales.
- La aceptación y el contexto de organización derivan rol, organización e invitación desde el servidor. El cliente no puede autoasignarse el rol ni elegir el slug de destino como autoridad.
- Mantener roles existentes y `MembershipStatus` sin cambios semánticos.

Matriz que deben compartir las pruebas HTTP, de servicio y SQL:

| Rol activo en organización activa | Inicio personal | Invitación dedicada a personal | Invitaciones generales |
| --- | --- | --- | --- |
| `owner` | No | Sí | Matriz actual. |
| `admin` | No | Sí | Matriz actual. |
| `member` | No | Sí | No. |
| `viewer` | No | No | No. |
| `inquilino` | No | No | No. |
| `personal` | Sí, solo `personal.home.read` | No | No. |

No añadir `personal` a `allowedInvitationRoles`: ese helper también se usa para cambios de rol. Mantener la creación de personal en la entrada dedicada y rechazar cambios genéricos hacia `personal`, incluido el rol posterior a una transferencia de ownership. Incorporar personal a los objetivos que owner/admin pueden suspender, remover o reactivar mediante `canManageMembership`, con los controles existentes de estado/versión. La reactivación administrativa conserva un perfil ya válido; no constituye un formulario alternativo para crearlo o editarlo.

La superficie autorizada se expresa mediante rutas, métodos y RPC dedicados. `Referer`, un campo `source` o una bandera enviada por el cliente no acreditan que la petición se originó en Gestión de arreglos. Los controles de origen/CSRF existentes siguen siendo obligatorios.

## 2. Persistencia del perfil y aceptación

- Añadir tres columnas text nullable en `organization_memberships`: `personal_name`, `personal_contact_number`, `personal_occupation`. El ID de membresía y su `organization_id` existentes delimitan el perfil; no se crea una identidad global adicional.
- Tratar `Número de contacto` como texto y no como número. Aplicar límites y validación consistente entre API y base de datos.
- La persona invitada envía `Nombre`, `Número de contacto` y `Ocupación` en la operación final de aceptación, después de autenticarse o completar el registro. Requerir los tres valores y persistirlos en la membresía dentro de la operación atómica que consume la invitación.
- No guardar datos de perfil en la invitación pendiente. Si falla la validación o la persistencia, no se consume la invitación ni se crea una membresía parcial; se permite corregir y reintentar mientras siga vigente.
- Rechazar campos extra, datos vacíos o identidad/correo incompatibles conforme a las reglas de validación definidas. No incluir los campos en logs, enlaces, tokens, errores públicos ni correos.
- Proteger lectura y escritura con RPC/servicios privilegiados acotados. Mantener RLS forzado y no conceder DML directo a roles browser.
- No editar migraciones aplicadas. Probar upgrade desde el esquema previo y revisar invitaciones/membresías existentes; no rellenar datos históricos inventados.

### Contrato de datos propuesto

La aceptación mantiene `POST /api/invitations/accept`. Para personal recibe exclusivamente:

```json
{
  "personal_profile": {
    "name": "Ana Pérez",
    "contact_number": "+58 0412 000 0000",
    "occupation": "Electricista"
  }
}
```

Para otros roles conservar body vacío y rechazar `personal_profile`. El rol se verifica nuevamente contra la invitación bloqueada en SQL; no viene en este body. Proponer límites de 1–120 caracteres para nombre y ocupación y de 1–64 para contacto, después de recortar espacios. Los límites son decisiones técnicas de esta guía, no requisitos nuevos confirmados por producto. Conservar Unicode, `+`, ceros iniciales, espacios y separadores de teléfono; rechazar valores de otro tipo, campos desconocidos y caracteres de control. Mantener reglas equivalentes en servidor y SQL, incluidas pruebas de espacios y longitudes Unicode.

Las constraints deben exigir explícitamente los tres valores no nulos/válidos cuando `role = 'personal'`; evitar un `CHECK` cuya expresión `NULL` permita datos incompletos. Las filas de otros roles pueden conservar los campos nulos y un perfil histórico válido puede conservarse al salir del rol. La invitación personal lleva `arrangement_property_id = null`. Si una membresía previa conserva una asociación de propiedad, aplicar un conflicto explícito al intentar incorporarla como personal, sin borrar ni reemplazar esa asociación.

### Migración y transacción de aceptación

1. Crear migración posterior a `20260912140000_spec43_arrangement_requests.sql`, ampliando ambas constraints de rol y añadiendo columnas/guards. Mantener todos los guards de propiedad de SPEC-42.
2. Crear un núcleo privado `spec44_accept_invitation` que extienda la transacción vigente con el perfil validado. Reutilizar el orden de locks de organización → invitación → handoff/membresía correspondiente; cotejarlo con rotación, revocación y suspensión para evitar carreras y deadlocks.
3. Crear adaptadores versionados de aceptación por handoff y token crudo con perfil. Los adaptadores antiguos siguen funcionando para roles anteriores, delegan sin perfil y rechazan una nueva aceptación personal. No dejar una firma anterior que cree personal sin los tres campos.
4. Validar identidad/correo, invitación pendiente, token/versiones, expiración y organización activa; luego crear o reactivar la membresía autorizada con los tres atributos. Una membresía activa sigue produciendo `ALREADY_A_MEMBER`; una nueva invitación válida para una membresía inactiva aplica las reglas vigentes y captura otra vez los tres datos.
5. Guardar membresía/perfil, consumo de invitación/handoff y evento de aceptación en una transacción. Corregir errores de campos antes de consumirla; inyectar fallos de auditoría para comprobar rollback completo. No completar el perfil con un PATCH posterior.
6. Mantener recuperación del commit perdido mediante `spec42_recover_accepted_handoff` o su sucesor compatible: solo misma identidad, invitación, membresía activa y rol confirmado. La recuperación no reescribe el perfil, no reactiva una baja posterior y no convierte un reintento en edición de datos.
7. Revocar ejecución de helpers privados incluso a `service_role`; conceder solo adaptadores autorizados al servicio. Mantener search path fijo, objetos SQL calificados, RLS forzado y ausencia de DML browser.

Revisar las últimas redefiniciones de RPC en `20260912130000_spec42_property_invitation_enforcement.sql`; copiar la versión de SPEC-40 perdería validaciones posteriores. Inventariar firmas y grants ejecutables después de migrar.

La respuesta de aceptación conserva su proyección mínima de organización y refresh. No añadir perfil a resolución pública, emails, contexto general, listas de miembros ni respuestas de mutación por defecto. En particular, las rutas de suspensión/reactivación/cambio de rol serializan hoy la membresía retornada: introducir una proyección explícita para evitar filtrar automáticamente las columnas nuevas. Los datos quedan recuperables en persistencia autorizada tras login; esta entrega no necesita una API ni una pantalla para mostrarlos.

## 3. Invitación desde Gestión de arreglos

- Añadir una superficie acotada de invitación al dashboard de arreglos; no reutilizar el panel general de miembros como punto de acceso para `member`.
- `owner`, `admin` y `member` ven el control; `viewer`, `inquilino` y `personal` no lo ven ni pueden invocar la API.
- La operación de invitación recibe el correo, fija `intended_role = personal` en servidor y obtiene organización/invitante de la sesión validada. La persona invitada envía los tres campos en la operación de aceptación.
- Reutilizar idempotencia, rate limit, aprovisionamiento compatible, enlace manual o entrega configurada, rotación, revocación, vencimiento, handoff y aceptación existentes.
- Tras una respuesta perdida, permitir recuperación por una acción explícita segura según las convenciones del sistema; nunca persistir ni volver a exponer tokens crudos como estado durable.
- La aceptación muestra el rol Personal y pide `Nombre`, `Número de contacto` y `Ocupación`, sin selector de rol u organización.
- Un reintento, rotación, revocación, correo ya asociado o membresía existente respeta las reglas de invitaciones y no eleva o reemplaza un rol sin operación explícita.

### Operaciones protegidas y aprovisionamiento

Crear `backend/src/routes/arrangementPersonal.ts` y montarlo desde `routes/arrangements.ts`; ampliar la inyección de `OrganizationService` que ya llega desde `index.ts`. Usar `sessions.context`, `createOrganizationScope` y `createTenantMutationSecurity` como en las rutas actuales.

| Método/ruta bajo `/api/organizations/:organization/arrangements` | Entrada | Resultado |
| --- | --- | --- |
| `POST /personal/invitations` | `{ email }`, `Idempotency-Key` | Recibo vigente; servidor fija `personal` y ninguna propiedad. |
| `POST /personal/invitations/:invitationId/rotate-link` | Body vacío | Nuevo recibo, invalidando el token/handoff anterior. |
| `POST /personal/invitations/:invitationId/revoke` | Body vacío | ID/estado/versión, sin token ni perfil. |

Para recuperar el enlace emitido por un member, la propuesta es permitirle rotar/revocar únicamente sus propias invitaciones personales de esta superficie; owner/admin conservan su autoridad de gestión. Validar organización, rol persistido, origen de la operación y emisor en SQL. La rotación debe conservar el vínculo a la operación y al invitante original, además del rol personal y la ausencia de propiedad. Este alcance de recuperación no concede lectura de listas generales ni gestión de miembros. Mantener las rutas generales inaccesibles para member.

- Añadir `OrganizationService.invitePersonal` con entrada sin rol ni propiedad. Extraer mecánica común de token, identidad y entrega de `inviteMember` sin cambiar la autorización pública de ese método.
- Crear `arrangement_personal_invitation_operations`, con ID, organización, invitante, idempotency key, fingerprint de email normalizado/rol/superficie e ID de invitación nullable. Usar unicidad por organización/invitante/clave y FK compuestas; RLS forzado y acceso exclusivo por RPC. No persistir tokens, perfil ni correo crudo en este registro.
- La preparación valida permisos, organización y conflictos antes de llamar Auth. Mismo intento devuelve la operación existente; otra entrada con la misma clave produce `IDEMPOTENCY_CONFLICT`. La creación vuelve a validar autoridad/conflictos después de Auth y fija el rol en SQL.
- Extender el actor confiable de provisioning con la referencia a esa operación preparada. `assertActor` y una entrada SQL acotada de claim comprueban organización activa, invitante, rol `personal`, destino/fingerprint y propósito `organization_invitee`. No añadir `member` al allowlist general de SPEC-35 sin estas condiciones ni aceptar ese contexto desde JSON HTTP.
- Usar una clave de provisioning vinculada a la operación preparada; la clave actual de `inviteMember` solo contiene organización/email, mientras SPEC-35 vincula el claim al actor. Dos invitantes no deben colisionar accidentalmente por usar la misma clave de identidad. Conservar reconciliación e idempotencia frente a fallos de Auth.
- Reutilizar `InvitationWorkflowService` y su configuración de entrega. El recibo distingue enlace emitido de replay sin token, con `next_action` de rotar/revocar. Ajustar los tipos frontend actuales, que suponen siempre `share_url` y `copy_or_revoke`, para representar esa unión.
- Reutilizar políticas distribuidas `member.invitation_create`, `member.invitation_resend` y `member.invitation_revoke`, además de las de handoff/registro/aceptación; son claves de operación, no permisos del rol member. Conservar headers seguros y errores de dominio sin datos del perfil.
- Actualizar etiquetas `Personal` también en `invitationDelivery.ts`, resolución y listados de gobernanza existentes, sin añadir personal al selector general de emisión.

### Formularios y estados

Añadir un control `Invitar personal` al dashboard, con un diálogo basado en `ArrangementDialog` y los patrones React Hook Form/Zod existentes. Pedir solo correo y conservar la misma clave de idempotencia durante reintentos del mismo envío. Mantener recibo/enlace únicamente en memoria y borrarlos al cerrar o cambiar sesión, organización o autoridad. No cargar una lista de personal ni de invitaciones generales para mostrar este control.

En `InvitationAcceptPage`, añadir un formulario de perfil solo cuando la sesión esté autenticada y la resolución indique `personal`. Mantener separados el `display_name` global del registro y `personal_profile.name`; el nombre global no se copia automáticamente como perfil ni el perfil se envía a Auth. Las cuentas nuevas completan registro → sesión → perfil → aceptación; las existentes completan login → perfil → aceptación, incluido el retorno de Google.

Los errores de validación conservan los valores para corregir y el handoff vigente. La expiración/revocación muestra el error seguro existente. Deshabilitar doble envío y distinguir espera de un error corregible; borrar datos al cambiar de cuenta/invitación. Proteger también las respuestas asíncronas de resolución y aceptación con cancelación o una generación de solicitud para que un logout/cambio de cuenta no restaure datos ni navegue por una respuesta anterior.

## 4. Contexto, navegación y página Inicio

- Incluir `personal` en la proyección de inicio de organización, con destino calculado a partir del membership activo confirmado.
- Agregar `/t/:organizationSlug/personal` dentro del límite actual de organización. La ruta valida sesión, organización activa, estado de membresía y capacidad `personal.home.read`.
- Crear una página cuyo único contenido de producto sea `Inicio`; conservar controles globales del shell existentes, si aplican.
- La página no debe consultar endpoints, iniciar cargas diferidas ni mostrar datos de arreglos, propiedades, solicitudes, perfiles o funciones simuladas.
- Redirigir `/t/:organizationSlug` al Inicio personal y bloquear rutas internas antes de montar sus pantallas.
- Revalidar cambios de usuario, organización, rol y estado con los mecanismos actuales; cancelar solicitudes tardías y limpiar el contexto anterior.
- Mantener navegación y shell responsive según los viewports de verificación de SPEC-39/40: 1280×800, 390×844 y 320×740.

Extender `home_destination` a `'organization' | 'inquilino' | 'personal' | null` en backend y frontend. Sustituir la bifurcación binaria de `OrganizationAccessBoundary` por una resolución explícita de los tres destinos, verificando rol/capacidad y usando el slug confirmado. La ruta general de organización debe excluir los dos roles exclusivos antes de montar cualquier pantalla o hook de producto.

Crear `PersonalHomePage.tsx` y un shell compartido extraído de `InquilinoHomePage.tsx`, por ejemplo `frontend/src/app/components/ExclusiveHomeShell.tsx`. El shell recibe children; personal deja el main con el único título `Inicio`, mientras inquilino conserva `InquilinoArrangements`. No añadir formularios, perfil, placeholders ni navegación interna a personal. Sesión/contexto/logout son las únicas operaciones globales necesarias.

Tras aceptar se puede conservar la navegación a `/t/:slug`: `OrganizationRouteBoundary` vuelve a resolver autoridad y la barrera dirige a `/personal`. La selección de organización y futuros logins recorren la misma resolución. Mantener epochs, cancelación, limpieza de cache y revalidación por focus/visibilidad para cambios A → B → A, de identidad y de membresía.

## 5. Pruebas y evidencia

| Capa | Cobertura requerida |
| --- | --- |
| Tipos/servicios | Rol válido, conjunto mínimo de capacidades, permisos por emisor y rol de destino, validación de perfil |
| Invitaciones/identidad | Emisión desde arreglos por owner/admin/member; rechazo de viewer/inquilino/personal; rechazo de member para otros roles; handoff, aceptación, vencimiento, rotación, revocación y replay |
| Persistencia SQL real | Restricciones, RLS/grants, aceptación atómica, aislamiento entre organizaciones, perfil del membership, rechazo de estados/campos inválidos y regresión del último owner |
| APIs | Organización e invitante derivados de sesión; rol de destino fijo; ausencia de invitación general de member; errores sin datos sensibles |
| Frontend | Control visible solo a roles autorizados, captura de perfil por la persona invitada durante la aceptación, refresh de contexto y destino correcto |
| Browser | Inicio sin controles de producto, login/logout, navegación directa, rutas denegadas, ausencia de errores de consola y overflow |

Ejecutar regresiones de SPEC-26/27/37/40/42 y del dashboard/solicitudes SPEC-39/43. Usar proveedores/adaptadores controlados y base desechable; no enviar invitaciones reales durante tests. La inspección textual de migraciones no sustituye la ejecución de RPC bajo roles reales.

### Casos que no deben quedar solo en mocks

1. Owner/admin/member emiten desde arreglos; member fracasa por rutas/RPC generales para todos los roles, incluido personal. Body con rol, propiedad, organización o perfil inyectados se rechaza antes de efectos de Auth.
2. Provisioning por member funciona con una operación personal válida y falla con operación ajena, email distinto, otro propósito, actor suspendido o esquema de claim legacy. Verificar ambos checks de SPEC-35 con repositorio real.
3. Una identidad acepta en A y B con perfiles distintos. Comparar persistencia después de cerrar sesión/iniciar sesión y comprobar que Auth/perfil global y la otra membresía no cambiaron.
4. Perfil ausente, vacío, nulo, excesivo o con campos extra no consume invitación/handoff. Un fallo de auditoría revierte perfil, membresía y consumo. Los adaptadores legacy rechazan personal sin perfil.
5. Carreras de doble emisión/aceptación, aceptación frente a rotación/revocación y suspensión del invitante producen un solo resultado válido. Reintentar un commit confirmado no cambia perfil ni vuelve a activar una membresía suspendida/removida.
6. Invitaciones o membresías previas incompatibles no cambian silenciosamente de rol/propiedad. La invitación personal carece de propiedad; invitaciones y asociaciones inquilino siguen siendo obligatorias según SPEC-42.
7. Proyecciones de resolución, contexto, aceptación, recuperación, listados y mutaciones no filtran los tres campos. Grants/RLS niegan lectura/escritura browser y ejecución de helpers privados.
8. Browser con cuenta nueva y existente recorre dashboard → API → RPC/PostgreSQL → handoff → autenticación → perfil → aceptación → Inicio → logout/login. Personal no dispara solicitudes de órdenes, propiedades, miembros, contratos, assets ni integraciones, tampoco durante redirecciones o respuestas tardías.

Archivos de verificación implementados:

- `backend/tests/unit/spec44-personal-access.test.ts`; regresiones de provisioning y entrega incluidas en la suite general existente.
- `backend/tests/integration/spec44-database.test.ts`, `spec44-database-concurrency.test.ts` y `spec44-migration-upgrade.test.ts`.
- `supabase/tests/spec44_setup.sql`, `spec44_personal_invitations.sql` y `spec44_browser_fixtures.sql`, con setup que solo acepte una base desechable.
- `frontend/tests/integration/PersonalInvitations.test.tsx`, `PersonalNavigation.test.tsx` y `frontend/tests/e2e/personal-invitations.spec.ts`, `personal-navigation.spec.ts`.
- `backend/tests/fixtures/spec44-browser-server.ts`, tomando los harnesses SPEC-42/43 como referencia sin simular aceptación ni permisos de persistencia.
- `docs/06-testing/spec44-personal-invitations.md`, con resultados y comandos reproducibles de SQL, upgrade, concurrencia y browser.

Comandos generales, desde la raíz:

```bash
npm --prefix backend test
npm --prefix backend run typecheck
npm --prefix backend run build
npm --prefix frontend test
npm --prefix frontend run lint
npm --prefix frontend run build
npm --prefix frontend run test:e2e -- personal-invitations.spec.ts personal-navigation.spec.ts
```

El último comando requiere preparar el harness documentado en la evidencia. Ejecutar SQL real, upgrade y concurrencia con bases separadas; las suites condicionales omitidas no cuentan como evidencia aprobada. Añadir regresiones SPEC-35 y SPEC-41 por compartir provisioning/registro. Los tests browser cubren teclado, foco, errores accesibles, consola y overflow en los tres tamaños, con interceptación de red para verificar ausencia de consultas de producto.

## 6. Entrega y compatibilidad

1. Comparar el historial de migraciones del destino y aplicar únicamente la nueva migración SPEC-44 después de revisar el esquema y el conteo de memberships/invitaciones relevantes.
2. Desplegar backend y frontend que reconozcan `personal` de forma coordinada con el esquema. Comprobar aceptación de invitaciones y acceso al Inicio en el entorno objetivo.
3. Validar que una sesión vieja o un bundle anterior no renderice rutas sin entender el nuevo rol. Preparar la respuesta de compatibilidad antes de habilitar nuevas invitaciones.
4. Una vez creadas membresías `personal`, no volver a un backend que rechace ese valor. Suspender la emisión o preparar una corrección compatible si se debe detener el rollout.
5. Registrar evidencia de permisos, migración, pruebas reales y smoke test por separado de cualquier gate de despliegue o proveedor.

Como mecanismo concreto de compatibilidad, mantener inicialmente deshabilitada la emisión personal con un gate servidor específico (por ejemplo `PERSONAL_INVITATIONS_ENABLED=false`) y omitir `arrangements.personal.invite` de las capacidades efectivas publicadas mientras esté cerrado. Instalar esquema, backend que comprende el rol y frontend que captura perfil/resuelve destino antes de abrirlo. Un bundle viejo que alcance una invitación personal debe fallar de forma segura y pedir recarga; nunca aceptar sin perfil ni montar producto. El gate solo controla nueva emisión, no revoca acceso ni aceptación de invitaciones ya emitidas.

Antes del rollout comprobar el estado real de SPEC-42/43 en el destino. Los gates de medios de SPEC-43 no son una funcionalidad nueva de SPEC-44, pero sus RPC, guards y flujos existentes deben conservarse. La recuperación mantiene un backend compatible con personal, cierra nueva emisión si hace falta y preserva perfiles/invitaciones; no elimina columnas ni degrada roles para volver a un esquema anterior.

## Lista de comprobación

1. Implementar el contrato confirmado de aceptación y perfil por membership.
2. Extender rol, capacidades y persistencia de forma aditiva.
3. Permitir desde backend invitaciones `personal` a owner/admin/member con control de destino fijo; mantener restringidos los demás roles para member.
4. Incorporar la invitación al dashboard de arreglos y reutilizar el flujo de invitación existente.
5. Crear ruta y página exclusiva, sin funcionalidades de producto ni consultas innecesarias.
6. Agregar pruebas de autorización negativa, aceptación atómica, aislamiento y compatibilidad.
7. Ejecutar verificaciones enfocadas y revisar navegación en escritorio y móvil.
8. Documentar migración, resultados y gates pendientes en los artefactos de evidencia habituales.
