# Guía de implementación — SPEC-40

Fecha del plan y ejecución local: `2026-09-11`. Estado: implementado y verificado localmente; migración aplicada a la rama de desarrollo Supabase `multi-tenant` el mismo día. El despliegue de aplicaciones sigue pendiente. La secuencia siguiente conserva el plan aprobado; la evidencia final y el estado del despliegue están en [`TASK-40-01`](./TASK-40-01-rol-inquilino-y-pagina-inicio.md) y el [procedimiento de verificación](../../../06-testing/spec40-inquilino.md).

[`TASK-40-01`](./TASK-40-01-rol-inquilino-y-pagina-inicio.md) se mantiene como una tarea única de extremo a extremo. La secuencia es persistencia → autorización y asignación → contexto y rutas → página → evidencia. Este plan concreta la [SPEC-40](./SPEC-40-rol-inquilino-inicio-exclusivo.md) sobre el código actual.

## Decisiones de producto

Las siguientes decisiones quedaron confirmadas por el usuario:

1. **Asignación confirmada:** agregar `Inquilino` al formulario de invitaciones y a la API existente de cambio de rol. La edición de roles de miembros existentes se realiza mediante esa API; no se agregan controles de edición al panel en SPEC-40.
2. **Revocación confirmada:** revalidar al navegar, recargar o volver a la pestaña, además de los cambios de sesión. Cada solicitud protegida consulta la autoridad vigente en el servidor. Una página abierta sin interacción puede permanecer visible hasta el próximo evento de revalidación; no se agrega comprobación periódica.
3. **Registro por invitación confirmado:** el registro/activación de una cuenta nueva para incorporarse como inquilino requiere una invitación vigente de owner/admin de la organización, con rol persistido `inquilino`. El registro público de SPEC-41 crea propietarios de organizaciones nuevas y no concede acceso como inquilino a una organización existente.

El acceso habitual posterior usa `/login`, también disponible mediante `Iniciar sesión` en `/`. Tras autenticar con correo/contraseña o Google conforme al flujo existente, el usuario selecciona su organización y el contexto validado lo dirige a `/t/:organizationSlug/inquilino`. La invitación se utiliza para incorporarse; no se exige nuevamente en cada inicio de sesión.

## Hallazgos iniciales del código

- `backend/src/organizations/roleCapabilities.ts` tiene cuatro roles y un registro en versión `3`. Todos los roles internos poseen `organization.read`; el nuevo rol debe tener exclusivamente `inquilino.home.read`.
- Las restricciones SQL de `organization_memberships.role` y `organization_invitations.intended_role`, más las RPC `spec26_create_invitation`, `spec26_mutate_membership` y `spec26_transfer_ownership`, enumeran explícitamente los roles actuales. Cambiar solamente TypeScript no permite persistir ni asignar el nuevo rol.
- Las invitaciones manuales de SPEC-37 delegan en `spec26_create_invitation`. Deben conservar su activación de identidad, aceptación, rotación, revocación, versiones y auditoría.
- `OrganizationGovernancePanel.tsx` crea enlaces de invitación y lista miembros. El cambio de rol existe en `PATCH /api/organizations/:organizationId/members/:userId`, pero no está conectado a controles del panel.
- `SessionService.context()` valida sesión y vuelve a consultar la membresía. Sin capacidad requerida puede devolver capacidades vacías, por ejemplo con organización suspendida; ese resultado no habilita `Inicio`.
- `OrganizationRouteBoundary` conserva contexto entre rutas de la misma organización y depende del estado de autenticación, slug y cliente de consultas. Debe contemplar cambios de identidad, membresía y navegación.
- `ActionSelectionPage` muestra las acciones internas a cualquier contexto confirmado. Varias páginas internas pueden montar controles o iniciar consultas sin una barrera central de capacidades. El nuevo rol debe quedar excluido antes de montar esas páginas.
- Las APIs de contratos, propiedades y arreglos ya exigen capacidades internas. La protección de datos continúa en esas APIs y en los servicios/RPC de gobierno.

## Ajustes durante la implementación

- La migración final es `20260911120000_spec40_inquilino_role.sql` y el registro de capacidades queda en versión `4`.
- La revisión encontró que `InvitationWorkflowService.listMembers()` y `spec37_list_members` admitían cualquier membresía activa, pese a que `members.read` solo pertenece a owner/admin. Se agregó la comprobación de capacidad en el servicio y de rol/organización activa en SQL. También se hizo explícita la capacidad de listado de invitaciones en el servicio. Member/viewer dejan de poder usar directamente el listado de miembros, conforme al registro existente.
- La revalidación por foco oculta temporalmente la página mediante `Activity`, conserva formularios sin guardar y mantiene la época si el contexto confirmado no cambió. Si cambia la autoridad o falla la validación, descarta la página y la caché. La navegación y los cambios de sesión siempre retiran el contexto anterior antes de renderizar el destino.
- Las pruebas SQL y el recorrido browser/API/repositorio se ejecutaron en PostgreSQL local desechable. El proveedor de identidad usa un adaptador controlado; en esa fase no se enviaron invitaciones externas ni se aplicó la migración remota. Posteriormente se aplicó solo SPEC-40 a la rama de desarrollo `multi-tenant` y se verificaron esquema, permisos e historial; la evidencia está en `TASK-40-01`.

## 1. Modelo y migración

Agregar `supabase/migrations/<timestamp>_spec40_inquilino_role.sql`, posterior a `20260910120000`. No modificar migraciones aplicadas.

1. Reemplazar las dos restricciones de roles para aceptar exactamente `inquilino`, conservando sus valores anteriores. Mantener las restricciones de estado independientes. No crear tablas ni convertir membresías existentes.
2. Reemplazar `spec26_create_invitation`: owner y admin pueden invitar inquilinos; admin continúa sin poder invitar administradores ni propietarios.
3. Reemplazar `spec26_mutate_membership`: aceptar `inquilino` como destino y conservar los controles de actor, rol actual y solicitado, autoasignación, alcance organizacional, versiones, bloqueos, eventos atómicos y último owner.
4. Incluir `inquilino` entre los roles del propietario saliente en `spec26_transfer_ownership`, después de promover al nuevo propietario mediante el flujo explícito existente. `owner` sigue excluido de invitaciones y cambios de rol ordinarios.
5. Conservar RLS forzado y ejecución restringida de las RPC a `service_role`. Las funciones reemplazadas deben usar objetos cualificados y `search_path` fijo seguro.
6. Verificar que aceptación y rotación de SPEC-37 conservan el rol nuevo sin cambiar su comportamiento. Probar las definiciones efectivas después de las migraciones pertinentes y sus correcciones.

## 2. Capacidades y asignación autorizada

Actualizar `backend/src/organizations/{types,roleCapabilities,organizationService,organizationRepository,invitationDelivery}.ts`, `membershipService.ts` y `backend/src/routes/organizationGovernance.ts`.

- Agregar `inquilino` a `OrganizationRole`, `inquilino.home.read` a `OrganizationCapability` e incrementar el registro a versión `4`.
- Definir `ROLE_CAPABILITIES.inquilino` como el conjunto exacto `{ inquilino.home.read }`. Los roles actuales conservan sus capacidades y no reciben la capacidad exclusiva.
- Extender `allowedInvitationRoles` y `canManageMembership`: admin puede gestionar inquilinos dentro del mismo límite vigente para member/viewer. No puede gestionar owners/admins ni elevar membresías a admin.
- Comprobar tanto el rol actual como el destino en `MembershipService.changeRole`, además de la comprobación SQL. Actualmente la validación del destino de una promoción a admin queda en la RPC; mantener ambas capas coherentes al introducir el nuevo destino.
- Usar `Exclude<OrganizationRole, 'owner'>` donde corresponda para sustituir las uniones repetidas de invitaciones. Agregar la etiqueta de entrega por correo aunque el flujo principal use enlaces manuales.
- Revisar las copias de tipos de rol sin mezclar membresía con participantes contractuales. No extender mecánicamente los tipos de contextos exclusivos de contratos ni sus permisos.

En frontend, actualizar `features/organizations/types.ts`, `services/organizationApi.ts`, `components/OrganizationGovernancePanel.tsx`, `pages/InvitationAcceptPage.tsx`, `features/contracts/services/adminAuthApi.ts` y `app/contexts/OrganizationContext.tsx`. Reutilizar `OrganizationRole` en las proyecciones de membresía en lugar de otra unión de cuatro roles.

El formulario de invitación ofrece `Inquilino` a owner/admin. Aceptación, miembros e invitaciones muestran una etiqueta válida. La aceptación utiliza el rol persistido por el invitante; nunca acepta un rol del invitado ni lo infiere de correo, dominio o contrato. SPEC-41 conserva su flujo de propietario inicial para organizaciones nuevas.

El registro inicial utiliza `/invitations/accept` y `POST /api/invitations/register`, con el handoff vigente validado por el servidor y la identidad vinculada al correo invitado. Después de activar/autenticar la cuenta, la aceptación explícita crea la membresía. Rechazar registro/aceptación sin invitación válida, vencida, revocada, reemplazada o ligada a otra identidad; iniciar sesión por sí solo nunca crea la membresía. Una persona con cuenta existente inicia sesión y acepta su invitación sin registrar otra cuenta. Conservar también el cambio autorizado de rol de miembros existentes ya confirmado: ese PATCH no registra identidades nuevas.

La asignación a miembros existentes utiliza el PATCH autorizado con `expected_version` y sus controles de concurrencia y permisos. La interfaz de miembros conserva su listado y formulario de invitaciones, conforme al alcance confirmado.

## 3. Destino confirmado por el servidor

Usar `GET /api/organizations/:organization/context`. La página vacía no necesita una API de producto nueva.

Agregar `home_destination: 'organization' | 'inquilino' | null` a su respuesta, calculado por el servidor con la membresía y capacidades efectivas de la organización solicitada:

| Autoridad confirmada | `home_destination` |
| --- | --- |
| Membresía activa `inquilino` con `inquilino.home.read` | `inquilino` |
| Rol interno con capacidad efectiva `organization.read` | `organization` |
| Contexto sin capacidad de inicio, por ejemplo inquilino en organización suspendida | `null` |

Sesión ausente/inválida o membresía inexistente, suspendida o removida conserva el error vigente. Conservar la recuperación limitada de owners en organizaciones suspendidas conforme al registro actual.

La proyección HTTP debe incluir solo los campos necesarios: organización (`id`, `slug`, `display_name`, `status`), membresía (`id`, `organization_id`, `user_id`, `role`, `status`, `version`), capacidades e indicadores de contexto/destino. Revisar los consumidores antes de sustituir la serialización actual del registro completo: la capacidad mínima no debe entregar metadatos administrativos innecesarios.

El frontend construye las rutas con el slug confirmado; no acepta URLs arbitrarias como destino. El selector global puede seguir enlazando a `/t/:organizationSlug`, que resuelve el destino tras validar contexto. La lista de membresías de la sesión permite seleccionar organización y no concede acceso por sí sola.

## 4. Barrera de rutas y vigencia del contexto

Implementar una barrera reutilizable en `frontend/src/app` y conectarla en `frontend/src/App.tsx`, dentro de `OrganizationRouteBoundary`:

| Ruta | Regla y resultado |
| --- | --- |
| `/` | Conserva autenticación/selección; no monta acciones sin contexto organizacional |
| `/t/:organizationSlug` | Destino `inquilino`: redirigir con `replace` antes de montar `ActionSelectionPage`; roles internos conservan la página general |
| `/t/:organizationSlug/inquilino` | Exige destino `inquilino`, rol correspondiente y capacidad efectiva `inquilino.home.read`; otros roles vuelven a su inicio autorizado |
| Rutas internas bajo `/t/:organizationSlug` | Grupo protegido por `organization.read`; un inquilino autorizado vuelve a su Inicio sin montar páginas ni iniciar consultas de producto |
| Contexto sin destino autorizado | Salida existente a `/` o estado neutral de indisponibilidad; no redirigir entre dos páginas inaccesibles |

El grupo interno incluye arreglos, las cuatro secciones de settings, properties/new, properties/success y ambas rutas de administración de contratos. Conservar sus comprobaciones específicas y las capacidades de las APIs. La barrera común excluye el nuevo rol sin introducir una revisión general de permisos de los cuatro roles anteriores. Agregar futuras rutas internas dentro del mismo grupo.

Fortalecer `OrganizationRouteBoundary` para asociar autorización con usuario, sesión, organización y navegación actuales. Revalidar al navegar dentro de la organización, al recargar, al cambiar/refrescar sesión y al recuperar foco/visibilidad, conforme a la frecuencia confirmada.

- Mostrar el estado neutral mientras el contexto resuelto no coincida con identidad/sesión y navegación actuales, incluso antes de ejecutar el efecto de carga; evitar un frame con acciones anteriores.
- Mantener `AbortController` y época de solicitudes para descartar respuestas tardías de otra organización, usuario o solicitud.
- Al cambiar usuario, organización, rol o estado, cancelar trabajo anterior, retirar datos de consultas y desmontar estado local sensible. Reutilizar claves por organización y época.
- Un fallo de validación no conserva una pantalla autorizada con información anterior. Diferenciar rechazo de acceso de dependencia indisponible con los estados actuales.
- Revalidar una vez por transición real y comparar destino/ruta antes de redirigir. Evitar bucles, duplicaciones por foco/visibilidad y pérdida del slug.

## 5. Página Inicio

Crear `frontend/src/pages/InquilinoHomePage.tsx` con fondo, header glass, acento, anchura, tipografía y espaciados de `ActionSelectionPage` y `ArrangementsPage`.

- Un único título visible `Inicio` y contenido de producto vacío.
- Identificación de sesión y `Cerrar sesión` mediante `useAuthentication().logout()` y su limpieza de consultas existente.
- Sin `Miembros`, enlaces a la página general, acciones, tarjetas vacías, formularios, listas, modales, datos simulados, texto «próximamente» ni llamadas a APIs de producto.
- Correo largo y header legibles en 1280×800, 390×844 y 320×740, los viewports usados por SPEC-39.
- Reutilizar estilos y primitivas. Cualquier extracción de shell debe ser pequeña y preservar las pantallas actuales.

## 6. Pruebas y evidencia

| Capa | Cobertura requerida |
| --- | --- |
| Registro/servicios | Una sola capacidad, estados independientes, organizaciones inactivas, asignación por owner/admin, rechazo de autoasignación y escalamiento, regresión de roles actuales |
| HTTP/identidad | Registro inicial únicamente por invitación válida, rechazo sin handoff o con invitación vencida/revocada/reemplazada o identidad incorrecta, registro público/login sin autoasignación de inquilino, aceptación, cambio de rol con versión, sesión/contexto y destino, proyección mínima, aislamiento A/B, sesión y membresía inválidas |
| APIs internas | Rechazo de contratos, propiedades, arreglos, miembros, invitaciones, configuración y API keys; ausencia de lecturas/efectos de producto posteriores a autorización fallida |
| PostgreSQL real | Restricciones, RPC de invitación/cambio de rol, aceptación vigente, rotación/revocación, alcance A/B, último owner, versiones, auditoría atómica y denegación browser |
| Integración frontend | Registro desde invitación, acceso posterior por `/login` y selector sin reutilizar la invitación, entrada directa/aceptación, redirecciones sin flash, todas las rutas internas, roles distintos por organización, respuestas tardías, cambio de rol/suspensión/remoción y renovación de contexto |
| Browser | Título Inicio, ausencia de funcionalidades y solicitudes de producto, logout, navegación/recarga/back, foco, consola sin errores y ausencia de overflow |

Extender tests de SPEC-26/27/37 y fixtures de organizaciones. Agregar tests focalizados, incluyendo `backend/tests/integration/spec40-migration-contract.test.ts`, `supabase/tests/spec40_inquilino_role.sql`, `frontend/tests/integration/InquilinoNavigation.test.tsx` y `frontend/tests/e2e/inquilino-navigation.spec.ts`. La inspección de SQL es evidencia estructural y no sustituye ejecutar las RPC.

Usar Supabase/PostgreSQL desechable con dependencias de SPEC-26/27/35/37 y sus correcciones. El [procedimiento de SPEC-39](../../../06-testing/spec39-arrangements.md) aporta un patrón local; su stub mínimo de `auth.users` no basta para probar activación y handoffs. Documentar dependencias y limitaciones del entorno. Cubrir al menos un recorrido con repositorio real: invitación/aceptación → membresía persistida → contexto/capacidad → Inicio → suspensión y rechazo posterior. Usar adaptadores de proveedor controlados cuando haga falta, sin enviar invitaciones reales.

Comandos generales de cierre desde la raíz, después de los tests focalizados:

```bash
npm --prefix backend test
npm --prefix backend run typecheck
npm --prefix backend run build
npm --prefix frontend test
npm --prefix frontend run lint
npm --prefix frontend run build
npm --prefix frontend run test:e2e -- tests/e2e/inquilino-navigation.spec.ts tests/e2e/arrangements-navigation.spec.ts
psql "$SPEC40_TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/spec40_inquilino_role.sql
git diff --check
```

Registrar resultados/capturas en `docs/06-testing/spec40-inquilino.md` y enlazarlos desde `TASK-40-01`. Actualizar documentación operativa/API sobre capacidades, contexto y asignación. La implementación y las pruebas locales permiten marcar SPEC y tarea como implementadas; conservar por separado los gates de migración remota, despliegue, proveedor y aprobación.

## 7. Entrega y compatibilidad

Estado al `2026-09-11`: migración `20260911120000` aplicada y verificada en `multi-tenant` (`kcobkbtieyowdmsvtsvv`). Quedan pendientes los despliegues compatibles y la verificación de los flujos en el entorno alojado. La migración ajena `20260817190000_retire_legacy_contract_webhook.sql` quedó excluida y continúa sin figurar en el historial de esa rama.

1. Revisar la migración y las RPC efectivas, ejecutar pruebas sobre base desechable y contrastar el historial del destino antes de aplicar cambios remotos. El historial documentado de SPEC-39 contiene una migración ajena pendiente; no incluirla por accidente.
2. Preparar y validar backend/frontend compatibles. Aplicar la migración antes del código que escribe `inquilino`; completar ambos despliegues antes de usar la asignación nueva. Verificar pestañas que conserven un bundle anterior durante la transición.
3. Comprobar asignación, selección, Inicio y rechazo interno con una cuenta de prueba en el entorno elegido. Registrar versiones de esquema/backend/frontend y evidencia real.
4. Tras crear membresías `inquilino`, conservar esquema y reconocimiento del rol. Volver a un backend previo puede romper sesiones porque su registro no reconoce ese valor. Preparar una corrección compatible o detener nuevas asignaciones; no convertir inquilinos a viewer/member ni borrar membresías para revertir.

## Lista de comprobación de la SPEC

1. Revisar los tipos de organización y membresía, el registro de roles y capacidades, los flujos de invitaciones y administración de miembros, y el resolver actual del contexto de organización.
2. Confirmar que `inquilino` se agregará como rol de membresía mientras `active`, `suspended` y `removed` permanecen como estados independientes.
3. Extender el modelo persistido, los tipos, las validaciones y los contratos de API necesarios para aceptar `inquilino` como rol válido.
4. Incorporar `inquilino` a los flujos autorizados de asignación o invitación, sin permitir autoasignación, asignación por contrato o creación por coincidencia de correo.
5. Agregar la capacidad mínima de acceso a inicio y verificar que el rol no reciba capacidades existentes de trabajo interno o administración.
6. Crear la ruta `/t/:organizationSlug/inquilino` dentro del límite de organización existente y construir su página `Inicio` reutilizando el shell compartido.
7. Mantener el contenido de la página sin botones, enlaces, tarjetas ni controles de producto. Conservar únicamente los controles globales obligatorios del shell si corresponden a la convención existente.
8. Actualizar la resolución de la página principal para que una membresía `inquilino` activa sea dirigida a su `Inicio` exclusivo y no vea las acciones generales.
9. Aplicar la denegación o redirección existente a las rutas internas que el rol no puede utilizar, sin duplicar la lógica de autorización en componentes individuales.
10. Agregar o ajustar las pruebas para verificar:
   - aceptación y persistencia del nuevo rol;
   - asignación autorizada y rechazo de autoasignación;
   - acceso de una membresía `inquilino` activa;
   - rechazo de membresías suspendidas o removidas;
   - redirección desde la página principal;
   - denegación de rutas internas;
   - aislamiento cuando el usuario pertenece a varias organizaciones; y
   - ausencia de botones y funcionalidades en `Inicio`.
11. Ejecutar las comprobaciones relevantes y revisar la página en los viewports soportados para detectar overflow, bucles de redirección, pérdida de foco o divergencias visuales.

## Restricciones de implementación

- No representar `inquilino` como un valor de `MembershipStatus`; debe ser un valor de rol separado.
- No otorgar al nuevo rol capacidades heredadas de `owner`, `admin`, `member` o `viewer` por conveniencia.
- No confiar en una decisión exclusiva del frontend para conceder acceso a la ruta.
- No permitir acceso a la página principal general antes de validar la membresía y el rol de la organización solicitada.
- No permitir que un contrato, token de participante, correo o dominio cree o eleve una membresía.
- No agregar funciones para consultar, crear, editar o administrar contratos, propiedades, arreglos, archivos o integraciones.
- No agregar botones de producto, datos simulados, formularios ni copy temporal a la página `Inicio`.
- No duplicar ni debilitar la lógica existente de autenticación, autorización o selección de organización.
- No cambiar la paleta, tipografía, espaciado ni tratamiento visual establecido por el sitio.
- Si el flujo actual de invitaciones o administración de miembros requiere una decisión sobre la presentación del rol, documentarla en la evidencia de cierre sin ampliar sus capacidades.
