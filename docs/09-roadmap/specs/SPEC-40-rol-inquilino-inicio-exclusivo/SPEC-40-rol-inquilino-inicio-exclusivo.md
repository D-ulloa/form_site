# SPEC-40 — Rol de inquilino e inicio exclusivo

- Estado: `pending`
- Fecha: `2026-09-02`
- Prioridad: `medium`
- Autor: `redacted`

## Objetivo

Agregar `inquilino` como un nuevo rol de membresía dentro de una organización para representar a clientes que se encuentran bajo contrato y que podrán utilizar futuras funciones del sitio. Los usuarios con este rol no deben acceder a la página principal general de la organización ni a sus acciones actuales; deben ser dirigidos a una página propia de `Inicio` que, en esta primera versión, no contiene botones ni funcionalidades de producto.

La primera versión se limita a incorporar el rol al modelo de autorización, permitir su asignación dentro de una organización y establecer su destino de navegación. No implementa funciones futuras para inquilinos ni amplía el acceso a propiedades, contratos, miembros, arreglos o configuraciones.

## Contexto

La aplicación actualmente distingue entre el rol de una membresía y su estado de ciclo de vida. Los roles existentes son `owner`, `admin`, `member` y `viewer`, mientras que los estados de membresía son `active`, `suspended` y `removed`. Esta SPEC agrega `inquilino` como rol de membresía; no convierte `inquilino` en un estado de suspensión o baja.

El término `Inquilino` también existe como participante del formulario de contratos. Ese participante contractual y el nuevo rol de usuario son conceptos distintos: completar o aparecer en un contrato no debe otorgar automáticamente una membresía, y una membresía `inquilino` no debe conceder acceso a formularios o datos contractuales salvo que una especificación futura lo autorice expresamente.

## Requisitos funcionales

### Rol de membresía `inquilino`

- El sistema debe reconocer `inquilino` como un rol válido de membresía dentro de una organización.
- El valor persistido del rol debe ser exactamente `inquilino`.
- La etiqueta visible del rol puede presentarse como `Inquilino` siguiendo las convenciones de presentación existentes.
- Una membresía `inquilino` debe continuar teniendo un estado de ciclo de vida independiente: `active`, `suspended` o `removed`.
- Solo una membresía `inquilino` activa puede acceder a su página propia.
- Una membresía suspendida o removida no debe conservar acceso por el hecho de haber sido `inquilino` anteriormente.
- El rol no debe ser asignable por el usuario desde el cliente ni por coincidencia de correo electrónico, contrato, dominio o cualquier otro dato no autorizado.
- La asignación debe realizarse mediante los mecanismos autorizados de membresías o invitaciones de la organización, respetando los controles actuales para propietarios y administradores.
- `inquilino` no debe recibir capacidades existentes de administración, contratos, propiedades, archivos, integraciones, auditoría, miembros o configuración.
- El rol debe recibir únicamente la capacidad mínima necesaria para resolver su página propia, con una capacidad nombrada y verificable, por ejemplo `inquilino.home.read`.

### Asignación y relación con el contrato

- El rol está destinado a clientes bajo contrato, pero esta SPEC no crea una relación obligatoria entre la membresía y un contrato existente.
- La asignación del rol debe ser explícita y autorizada por la organización.
- La existencia, vigencia o contenido de un contrato no debe utilizarse como sustituto de la membresía validada.
- La membresía no debe crearse automáticamente desde un formulario contractual, un token de participante o un registro de inquilino del contrato.
- La futura asociación entre un usuario `inquilino` y uno o más contratos debe definirse en una especificación separada.

### Página propia de `Inicio`

- Los usuarios con una membresía `inquilino` activa deben tener una página propia disponible en:

  ```text
  /t/:organizationSlug/inquilino
  ```

- La ruta debe permanecer dentro del límite existente de rutas con alcance de organización y usar la organización del contexto validado.
- La página debe mostrar el encabezado o título visible `Inicio`.
- El contenido de producto de la página debe permanecer intencionalmente vacío en esta versión.
- No debe mostrar botones de acciones, tarjetas de funcionalidades, enlaces de producto, formularios, listados, datos simulados ni controles de propiedades, contratos, arreglos o configuración.
- Puede conservar los controles globales obligatorios del shell compartido, como la identificación de sesión o el cierre de sesión, si forman parte de la convención existente; estos no constituyen funcionalidades de la página de inquilino.
- Debe reutilizar el fondo, superficies, tipografía, espaciado, bordes, acentos y comportamiento responsive existentes.
- Debe renderizar correctamente en los tamaños de escritorio y móvil soportados.

### Restricción de la página principal

- Una membresía `inquilino` activa no debe poder renderizar la página principal general de la organización en:

  ```text
  /t/:organizationSlug
  ```

- Si un usuario `inquilino` navega directamente a esa ruta, la aplicación debe redirigirlo a `/t/:organizationSlug/inquilino` después de validar sesión, organización y membresía.
- La página principal no debe mostrarle las acciones `Agregar nueva propiedad`, `Generar contrato`, `Administrar contratos` ni `Gestión de arreglos`.
- Si el usuario tiene membresías en varias organizaciones, el destino debe resolverse por la membresía de la organización solicitada; una membresía autorizada en otra organización no concede acceso a la organización de la URL.
- La ruta global de selección o entrada no debe utilizarse para exponer las acciones de una organización antes de resolver el rol correspondiente. Al seleccionar una organización donde el usuario sea `inquilino`, debe aplicarse el destino exclusivo de `Inicio`.

### Restricción de otras rutas

- El rol `inquilino` no debe acceder a rutas de administración, generación de propiedades, administración de contratos, configuración, miembros ni a otras funcionalidades existentes que requieran capacidades no asignadas.
- La navegación directa a una ruta no autorizada debe recibir el comportamiento de rechazo o redirección ya establecido por la aplicación, sin mostrar datos parciales ni una pantalla de otra organización.
- La página propia de `Inicio` no debe convertirse en una vía para omitir las comprobaciones actuales de sesión, organización o autorización.

## Flujo y comportamiento esperado

1. Un propietario o administrador autorizado asigna el rol `inquilino` a un usuario mediante el flujo de membresías o invitaciones vigente.
2. El usuario autentica su cuenta y obtiene una membresía `inquilino` activa en una organización.
3. Al seleccionar o visitar esa organización, la aplicación valida la sesión, la organización y el rol de la membresía.
4. La aplicación dirige al usuario a `/t/:organizationSlug/inquilino` y muestra la página `Inicio` sin botones ni funcionalidades de producto.
5. Si el usuario intenta entrar a `/t/:organizationSlug`, la aplicación valida nuevamente el contexto y lo redirige a su `Inicio` exclusivo.
6. Si el usuario intenta entrar a una ruta que requiere capacidades de administración o trabajo interno, la aplicación rechaza o redirige la solicitud conforme al comportamiento existente.
7. Si la membresía se suspende o remueve, el acceso a `Inicio` deja de estar disponible.

## Reglas de negocio

- `inquilino` es un rol de membresía y no un estado de ciclo de vida.
- Una persona puede tener roles distintos en organizaciones distintas; el rol `inquilino` solo aplica dentro de la organización de la membresía correspondiente.
- La organización activa siempre debe provenir del contexto de ruta validado; la URL no puede conceder acceso por sí misma.
- La página `Inicio` exclusiva requiere una sesión válida, una organización válida y una membresía `inquilino` activa.
- El rol `inquilino` no hereda capacidades de `owner`, `admin`, `member` ni `viewer`.
- La asignación del rol no crea ni consulta contratos, propiedades, arreglos, archivos o integraciones.
- La presencia de un usuario en un contrato no crea una membresía de organización.
- Suspender o remover la membresía debe impedir el acceso a la página exclusiva sin eliminar la identidad global ni las relaciones históricas necesarias.
- No se agregan capacidades futuras al rol hasta que una especificación separada las defina y las incorpore expresamente.

## Validaciones y manejo de errores

- La navegación directa a `/t/:organizationSlug/inquilino` debe pasar por los controles actuales de sesión y organización.
- Un usuario sin sesión debe recibir el flujo de autenticación existente.
- Un usuario sin acceso a la organización, con membresía suspendida o con membresía removida no debe ver la página de `Inicio`.
- Un usuario con un rol distinto de `inquilino` no debe recibir el destino exclusivo por error.
- Un usuario `inquilino` no debe poder renderizar la página principal general ni rutas protegidas por capacidades que no posee.
- Un slug o contexto de organización inválido debe resolverse con el manejo de rutas existente y no debe exponer la identidad o el contenido de otra organización.
- Los cambios de organización o de membresía no deben dejar datos o rutas de la organización anterior en pantalla.
- La redirección entre la página principal y `Inicio` no debe producir bucles, perder el slug ni depender únicamente de una decisión local del frontend.
- La página no debe producir overflow ni perder legibilidad en los viewports soportados.
- Las pruebas deben comprobar la asignación y resolución del rol, el acceso exclusivo, el rechazo de rutas generales y la ausencia de botones de producto.

## Criterios de aceptación

1. `inquilino` existe como rol de membresía válido y se diferencia del estado `active`, `suspended` o `removed`.
2. Un propietario o administrador autorizado puede asignar el rol mediante el flujo de membresías o invitaciones definido por la aplicación.
3. Una membresía `inquilino` activa puede acceder a `/t/:organizationSlug/inquilino` dentro de su organización.
4. La página muestra `Inicio` y no contiene botones, tarjetas, enlaces ni controles de funcionalidades de producto.
5. Un usuario `inquilino` no puede renderizar la página principal `/t/:organizationSlug` y es dirigido a su `Inicio` exclusivo.
6. Un usuario `inquilino` no puede acceder a las rutas existentes que requieren capacidades internas no asignadas.
7. La ruta exclusiva permanece protegida por los controles actuales de autenticación, autorización y organización.
8. Suspender o remover la membresía elimina el acceso a la página exclusiva.
9. El rol `inquilino` no hereda capacidades de otros roles ni obtiene acceso por aparecer en un contrato.
10. La página conserva el shell visual y el comportamiento responsive existentes.
11. El alcance no implementa funciones futuras para inquilinos ni modifica el dominio de contratos, propiedades, arreglos o integraciones.

## Notas técnicas

- Extender los tipos de rol y el registro de capacidades existentes para reconocer `inquilino` y su capacidad mínima de inicio.
- Mantener `MembershipStatus` separado del nuevo rol; no reutilizar `active`, `suspended` o `removed` para representar `inquilino`.
- Revisar `frontend/src/App.tsx`, `frontend/src/app/contexts/OrganizationContext.tsx` y el flujo de selección de organización para incorporar la ruta y el destino según el rol validado por el servidor.
- Reutilizar el shell visual de `ActionSelectionPage.tsx` y de la página de arreglos definida en SPEC-38/SPEC-39, eliminando las acciones de producto para la vista de inquilino.
- La decisión de autorización debe resolverse con el contexto de organización confirmado y las capacidades del servidor; una condición de rol únicamente en el cliente no es suficiente.
- El alcance puede requerir cambios en el modelo de membresías, invitaciones, APIs, tipos compartidos y frontend, pero no requiere tablas de contratos, propiedades, arreglos, storage o integraciones.
- Los detalles internos de componentes, mecanismo de redirección y presentación del shell son decisiones de implementación mientras se mantengan las restricciones de acceso y la página sin funcionalidades.
- Las futuras funciones para inquilinos deben especificarse por separado, incluyendo sus capacidades, datos, rutas y relación con contratos.

## Referencias

- `docs/09-roadmap/specs/SPEC-38-gestion-de-arreglos-placeholder-navigation/SPEC-38-gestion-de-arreglos-placeholder-navigation.md` — ruta de gestión de arreglos, shell y límite de organización.
- `docs/09-roadmap/specs/SPEC-39-gestion-de-arreglos-dashboard-ordenes-abiertas/SPEC-39-gestion-de-arreglos-dashboard-ordenes-abiertas.md` — dashboard de órdenes y convenciones de la primera funcionalidad de arreglos.
- `docs/09-roadmap/specs/pending/26-SPEC-multi-tenant-organizations-memberships-onboarding-and-lifecycle.md` — modelo de organizaciones, membresías, roles y estados de ciclo de vida.
- `docs/09-roadmap/specs/pending/27-SPEC-multi-tenant-identity-sessions-authorization-apis-and-frontend-context.md` — sesión, autorización, contexto de organización y aislamiento frontend.
- `docs/07-development/engineering-standards.md` — convenciones de rutas, autorización y desarrollo.
- `frontend/src/App.tsx` — topología actual de rutas.
- `frontend/src/app/contexts/OrganizationContext.tsx` — límite actual de contexto de organización.
