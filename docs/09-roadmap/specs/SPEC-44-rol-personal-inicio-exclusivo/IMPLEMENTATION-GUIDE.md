# Guía de implementación — SPEC-44

Estado del documento: listo para implementación. No se ha implementado ni aplicado migración.

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
| Invitación general y aceptación | `backend/src/routes/organizationGovernance.ts`, `backend/src/organizations/invitationWorkflow.ts`, `frontend/src/pages/InvitationAcceptPage.tsx`, `frontend/src/features/organizations/services/organizationApi.ts` |
| Contexto y rutas | `backend/src/identity/organizationHome.ts`, `backend/src/identity/identityRepository.ts`, `frontend/src/app/contexts/OrganizationContext.tsx`, `frontend/src/App.tsx` |
| Dashboard | `frontend/src/features/arrangements/components/ArrangementOrdersDashboard.tsx` y los componentes/secciones de SPEC-42 |
| Migraciones y evidencia | Restricciones y RPC de SPEC-26/37/40/42; agregar migración y pruebas nuevas numeradas SPEC-44 |

## 1. Contrato del rol y autorización

- Registrar `personal` como valor explícito en backend, frontend, parser de contexto y restricciones SQL de membresías e invitaciones.
- Incrementar la versión del registro de capacidades. Asignar `personal.home.read` solo a `personal`.
- Añadir una capacidad específica de invitación (nombre a definir en código, por ejemplo `arrangements.personal.invite`) a `owner`, `admin` y `member`.
- No agregar `members.invite` a `member`. La nueva capacidad solo autoriza la operación dedicada de arreglos cuyo rol de destino es fijo `personal`.
- Rechazar invitaciones a roles distintos de `personal` desde la operación dedicada aunque el body intente modificar `intended_role`. Mantener la matriz de invitaciones de gobernanza actual para operaciones generales.
- La aceptación y el contexto de organización derivan rol, organización e invitación desde el servidor. El cliente no puede autoasignarse el rol ni elegir el slug de destino como autoridad.
- Mantener roles existentes y `MembershipStatus` sin cambios semánticos.

## 2. Persistencia del perfil y aceptación

- Añadir los campos de perfil en el alcance de la membresía de organización. El esquema exacto puede ser columnas o una estructura validada de perfil, pero debe garantizar aislamiento por `organization_id` y `membership_id`.
- Tratar `Número de contacto` como texto y no como número. Aplicar límites y validación consistente entre API y base de datos.
- La persona invitada envía `Nombre`, `Número de contacto` y `Ocupación` en la operación final de aceptación, después de autenticarse o completar el registro. Requerir los tres valores y persistirlos en la membresía dentro de la operación atómica que consume la invitación.
- No guardar datos de perfil en la invitación pendiente. Si falla la validación o la persistencia, no se consume la invitación ni se crea una membresía parcial; se permite corregir y reintentar mientras siga vigente.
- Rechazar campos extra, datos vacíos o identidad/correo incompatibles conforme a las reglas de validación definidas. No incluir los campos en logs, enlaces, tokens, errores públicos ni correos.
- Proteger lectura y escritura con RPC/servicios privilegiados acotados. Mantener RLS forzado y no conceder DML directo a roles browser.
- No editar migraciones aplicadas. Probar upgrade desde el esquema previo y revisar invitaciones/membresías existentes; no rellenar datos históricos inventados.

## 3. Invitación desde Gestión de arreglos

- Añadir una superficie acotada de invitación al dashboard de arreglos; no reutilizar el panel general de miembros como punto de acceso para `member`.
- `owner`, `admin` y `member` ven el control; `viewer`, `inquilino` y `personal` no lo ven ni pueden invocar la API.
- La operación de invitación recibe el correo, fija `intended_role = personal` en servidor y obtiene organización/invitante de la sesión validada. La persona invitada envía los tres campos en la operación de aceptación.
- Reutilizar idempotencia, rate limit, aprovisionamiento compatible, enlace manual o entrega configurada, rotación, revocación, vencimiento, handoff y aceptación existentes.
- Tras una respuesta perdida, permitir recuperación por una acción explícita segura según las convenciones del sistema; nunca persistir ni volver a exponer tokens crudos como estado durable.
- La aceptación muestra el rol Personal y pide `Nombre`, `Número de contacto` y `Ocupación`, sin selector de rol u organización.
- Un reintento, rotación, revocación, correo ya asociado o membresía existente respeta las reglas de invitaciones y no eleva o reemplaza un rol sin operación explícita.

## 4. Contexto, navegación y página Inicio

- Incluir `personal` en la proyección de inicio de organización, con destino calculado a partir del membership activo confirmado.
- Agregar `/t/:organizationSlug/personal` dentro del límite actual de organización. La ruta valida sesión, organización activa, estado de membresía y capacidad `personal.home.read`.
- Crear una página cuyo único contenido de producto sea `Inicio`; conservar controles globales del shell existentes, si aplican.
- La página no debe consultar endpoints, iniciar cargas diferidas ni mostrar datos de arreglos, propiedades, solicitudes, perfiles o funciones simuladas.
- Redirigir `/t/:organizationSlug` al Inicio personal y bloquear rutas internas antes de montar sus pantallas.
- Revalidar cambios de usuario, organización, rol y estado con los mecanismos actuales; cancelar solicitudes tardías y limpiar el contexto anterior.
- Mantener navegación y shell responsive según los viewports de verificación de SPEC-39/40: 1280×800, 390×844 y 320×740.

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

## 6. Entrega y compatibilidad

1. Comparar el historial de migraciones del destino y aplicar únicamente la nueva migración SPEC-44 después de revisar el esquema y el conteo de memberships/invitaciones relevantes.
2. Desplegar backend y frontend que reconozcan `personal` de forma coordinada con el esquema. Comprobar aceptación de invitaciones y acceso al Inicio en el entorno objetivo.
3. Validar que una sesión vieja o un bundle anterior no renderice rutas sin entender el nuevo rol. Preparar la respuesta de compatibilidad antes de habilitar nuevas invitaciones.
4. Una vez creadas membresías `personal`, no volver a un backend que rechace ese valor. Suspender la emisión o preparar una corrección compatible si se debe detener el rollout.
5. Registrar evidencia de permisos, migración, pruebas reales y smoke test por separado de cualquier gate de despliegue o proveedor.

## Lista de comprobación

1. Implementar el contrato confirmado de aceptación y perfil por membership.
2. Extender rol, capacidades y persistencia de forma aditiva.
3. Permitir desde backend invitaciones `personal` a owner/admin/member con control de destino fijo; mantener restringidos los demás roles para member.
4. Incorporar la invitación al dashboard de arreglos y reutilizar el flujo de invitación existente.
5. Crear ruta y página exclusiva, sin funcionalidades de producto ni consultas innecesarias.
6. Agregar pruebas de autorización negativa, aceptación atómica, aislamiento y compatibilidad.
7. Ejecutar verificaciones enfocadas y revisar navegación en escritorio y móvil.
8. Documentar migración, resultados y gates pendientes en los artefactos de evidencia habituales.
