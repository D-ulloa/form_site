# SPEC-44 — Rol de personal e inicio exclusivo

- Estado: `implemented` (verificado localmente; migración aplicada a desarrollo `multi-tenant`; despliegue y smoke test pendientes)
- Fecha: `2026-09-12`
- Prioridad: `medium`
- Autor: `redacted`

## Objetivo

Agregar `personal` como rol de membresía de una organización. Una persona con este rol se incorpora mediante una invitación generada desde `Gestión de arreglos` por un usuario `owner`, `admin` o `member`, cuenta con los datos `Nombre`, `Número de contacto` y `Ocupación`, y entra a una página propia `/t/:organizationSlug/personal` que por ahora muestra únicamente `Inicio` y no ofrece funcionalidades de producto.

La autorización para emitir estas invitaciones debe quedar limitada al rol `personal`; permitir que `member` invite personal no le concede permisos generales para invitar otros roles ni administrar miembros desde el panel de gobernanza.

## Decisiones confirmadas

| Tema | Decisión |
| --- | --- |
| Rol | Confirmado: el valor persistido del nuevo rol es `personal`; la etiqueta visible es `Personal`. |
| Entrada de invitaciones | Confirmado: se generan desde `Gestión de arreglos`, con autorización para `owner`, `admin` y `member`. |
| Datos | Confirmado: el perfil de personal incluye `Nombre`, `Número de contacto` y `Ocupación`. |
| Inicio | Confirmado: existe una página exclusiva que inicialmente solo muestra `Inicio`, sin funcionalidades de producto. |
| Identidad de invitación | Reutilizar el flujo actual de invitaciones por correo y enlace manual. |
| Captura de datos | Confirmado: la persona invitada proporciona los tres datos durante la aceptación, después de autenticarse o registrarse y antes de finalizar la incorporación. |
| Campos requeridos | Los tres campos son obligatorios para aceptar una invitación de `personal`. |
| Alcance de datos | Guardar los tres datos en la membresía de la organización, no en el perfil global de identidad ni en la invitación pendiente. |

El flujo debe pedir los datos tanto a una persona que crea su cuenta como a una persona que ya tiene una cuenta y solo debe aceptar la invitación.

## Contexto y dependencias

- SPEC-40 agregó `inquilino` como rol de membresía con una ruta exclusiva y un `Inicio` sin funcionalidades de producto.
- SPEC-42 incorporó propiedades ligeras e invitaciones para inquilinos desde `Gestión de arreglos`, reutilizando la aceptación y los enlaces manuales existentes.
- SPEC-43 agregó solicitudes de arreglo a la página de inquilino y funciones al dashboard interno. Esta SPEC no amplía el alcance de las solicitudes ni asigna tareas a personal.
- Los roles y estados de membresía son conceptos independientes. `personal` será un rol nuevo; `active`, `suspended` y `removed` continúan siendo estados.
- Los roles actuales tienen capacidades explícitas. `member` no posee `members.invite`; por ello el permiso nuevo debe autorizar únicamente invitaciones con `intended_role = personal` desde la superficie de arreglos.

## Requisitos funcionales

### Rol de membresía `personal`

- El sistema debe reconocer `personal` como un valor válido de `OrganizationRole` y de `organization_memberships.role` y `organization_invitations.intended_role`.
- El valor persistido será exactamente `personal`; la etiqueta de interfaz será `Personal`.
- `personal` es un rol y no un estado de membresía, tipo de usuario global ni perfil contractual.
- Solo una membresía `personal` activa en una organización activa obtiene acceso a su página Inicio.
- Una membresía suspendida o removida pierde acceso, incluso si mantiene una sesión global válida.
- El rol no hereda capacidades de `owner`, `admin`, `member`, `viewer` ni `inquilino`. Recibe solo la capacidad mínima para cargar su Inicio, por ejemplo `personal.home.read`.
- Una invitación, coincidencia de correo, perfil de identidad o relación contractual no concede acceso hasta que la persona acepta la invitación vigente y se crea o reactiva la membresía autorizada.

### Invitación desde Gestión de arreglos

- La invitación a personal se inicia desde `/t/:organizationSlug/arrangements`, dentro del contexto de la organización validada.
- `owner`, `admin` y `member` pueden generar invitaciones dirigidas exclusivamente al rol `personal`.
- `viewer`, `inquilino` y `personal` no pueden generar estas invitaciones.
- Los usuarios `member` no obtienen permiso general `members.invite`, no pueden emitir invitaciones para `admin`, `member`, `viewer` o `inquilino`, y no reciben controles de invitación del panel general de gobernanza.
- El rol de destino lo determina la operación protegida del servidor. El cliente no puede seleccionar otro rol ni omitir controles mediante la API general de invitaciones.
- La invitación usa correo como identidad/destino según el flujo vigente y reutiliza el enlace manual, handoff, aceptación, vencimiento, revocación, rotación, idempotencia, rate limit y controles de origen existentes.
- La persona que genera la invitación proporciona el correo de destino, pero no captura los datos personales de `personal`.
- Crear una invitación no crea una membresía activa ni habilita el acceso antes de aceptar.
- Si existe una invitación incompatible o una membresía previa, se aplican conflictos y flujos existentes sin reasignar roles o reemplazar asociaciones silenciosamente.
- Durante la aceptación, la persona invitada ingresa los tres campos requeridos. Una invitación aceptada guarda el rol `personal` y los atributos proporcionados por el invitado de forma atómica con el consumo de la invitación y la auditoría necesaria.

### Datos de perfil

- Cada membresía `personal` tiene los campos `Nombre`, `Número de contacto` y `Ocupación`.
- La persona invitada ingresa los tres valores durante el flujo de aceptación, después de autenticarse o registrarse y antes de que se consuma la invitación. Al completarse la aceptación, los valores quedan asociados a la membresía de esa organización y están disponibles después de cerrar e iniciar sesión de nuevo.
- La invitación pendiente no almacena estos datos: el invitador solo proporciona el correo y el servidor fija el rol `personal`.
- Los atributos son propios de la membresía: una misma identidad puede tener datos distintos en organizaciones distintas. No deben sobrescribir metadatos globales de Auth ni datos del perfil compartido de otra organización.
- `Número de contacto` se trata como texto para conservar prefijo internacional, ceros iniciales y formato; no se convierte a número aritmético.
- Los valores se recortan antes de guardar, se validan en servidor y se devuelven solo a superficies que estén autorizadas para conocerlos. No deben aparecer en logs, URLs, telemetría ni mensajes de invitación públicos sin necesidad.
- Los datos son campos de perfil solamente. No habilitan llamadas, mensajería, edición de solicitudes, acceso a propiedades ni otras acciones en esta versión.
- La persona invitada puede proporcionar únicamente los tres campos de perfil. No puede cambiar el rol, la organización, el correo de destino ni otra autoridad de la invitación mediante parámetros de URL o campos no autorizados del cliente.

### Página exclusiva de Inicio

- Una membresía `personal` activa puede acceder a:

  ```text
  /t/:organizationSlug/personal
  ```

- La ruta está dentro del límite de organización, usa la organización validada y muestra el encabezado/título `Inicio`.
- No presenta herramientas, botones de producto, tarjetas, listados, formularios, enlaces internos, datos de arreglos ni texto simulado.
- Puede conservar los controles globales obligatorios del shell existente, como identificación de sesión y cerrar sesión. No muestra ni edita los tres datos de perfil en esta primera versión.
- La página reutiliza el shell visual existente y se adapta a los tamaños de escritorio y móvil ya soportados.
- Tras aceptar una invitación, seleccionar o abrir la organización dirige al usuario `personal` a esta ruta. Los inicios de sesión posteriores usan el flujo habitual; no requieren reutilizar la invitación.

### Restricción de otras rutas y capacidades

- Un usuario `personal` que visite `/t/:organizationSlug` es dirigido a `/t/:organizationSlug/personal` una vez validados sesión, organización y membresía.
- `personal` no accede a `Gestión de arreglos`, propiedades, solicitudes, contratos, miembros, invitaciones generales, configuración, integraciones, archivos o rutas existentes que requieren capacidades no otorgadas.
- La barrera de rutas impide montar pantallas o iniciar consultas de producto antes de completar la resolución de rol y organización.
- Las APIs aplican la autorización del servidor incluso cuando el cliente oculta controles.
- Una membresía de la persona en otra organización no habilita acceso a la organización de la URL actual.

## Flujo y comportamiento esperado

1. Un `owner`, `admin` o `member` abre `Gestión de arreglos` de su organización y genera una invitación de rol fijo `personal`.
2. La operación valida la organización activa, la membresía del invitante, la capacidad específica y el correo de destino.
3. El sistema crea la invitación vigente usando el mecanismo existente y devuelve el enlace manual o resultado de entrega configurado.
4. La persona invitada registra o autentica su cuenta, completa `Nombre`, `Número de contacto` y `Ocupación`, y acepta la invitación válida. El servidor crea la membresía `personal` activa y vincula los datos proporcionados por el invitado en la misma operación lógica.
5. La aplicación actualiza el contexto de organización y dirige a `/t/:organizationSlug/personal`, donde muestra `Inicio` sin funcionalidades de producto.
6. Una visita a la página general redirige a Inicio; una llamada o ruta interna no autorizada se deniega según las convenciones existentes.
7. Suspender o remover la membresía revoca el acceso a Inicio sin borrar la identidad global ni otros memberships.

## Reglas de negocio

- `personal` es un rol de membresía con ciclo de vida independiente.
- Una persona puede tener memberships y datos de perfil distintos en organizaciones distintas.
- Solo `owner`, `admin` y `member` emiten invitaciones de rol `personal` desde Gestión de arreglos.
- Autorizar al rol `member` para esta operación no equivale a `members.invite` ni habilita invitaciones desde gobernanza.
- La invitación no asigna propiedades ni crea una asociación de propiedad.
- Los datos de personal no se derivan de contratos, solicitudes, propiedades ni datos de otras organizaciones.
- La página exclusiva requiere sesión válida, organización válida y membership `personal` activa.
- Ninguna capacidad funcional futura se añade hasta una especificación que la defina explícitamente.

## Validaciones y manejo de errores

- Una sesión ausente usa el flujo de autenticación existente; una membresía suspendida, removida o de otro rol no ve Inicio.
- Un emisor sin capacidad específica, una invitación a un rol distinto de `personal` desde la operación de arreglos o una llamada desde otra superficie se rechaza en el servidor.
- La organización de la invitación se deriva del contexto validado y no de un `organization_id` no confiable en el body.
- El correo se valida al generar la invitación. Los campos de perfil se validan durante la aceptación antes de consumir la invitación o crear la membresía.
- Una invitación vencida, revocada, reemplazada, ya consumida o ligada a una identidad incompatible no crea una membresía ni expone el perfil.
- La aceptación verifica nuevamente invitación, identidad, organización y rol; requiere los tres campos válidos antes de persistirlos. Un fallo no deja una invitación consumida con membresía parcial, y permite corregir los datos y reintentar mientras la invitación siga vigente.
- La página general no redirige en bucle y conserva el slug correcto. Respuestas tardías de otra organización, usuario o membresía no muestran contenido previo.
- Las pruebas comprueban permisos diferenciados de `member`, perfil por organización, aislamiento, aceptación, baja, ausencia de funcionalidades y regresiones de roles existentes.

## Criterios de aceptación

1. `personal` se valida y persiste como rol de membresía, separado del estado del membership.
2. `owner`, `admin` y `member` pueden invitar a `personal` desde Gestión de arreglos; `viewer`, `inquilino` y `personal` no pueden hacerlo.
3. `member` no puede invitar roles distintos de `personal` ni recibe acceso general al panel de miembros/invitaciones.
4. La invitación usa el flujo de incorporación existente, y su aceptación vigente crea la membresía autorizada sin estado parcial.
5. La persona invitada debe proporcionar `Nombre`, `Número de contacto` y `Ocupación` durante la aceptación; cada membership personal conserva esos datos dentro de su organización y no modifica el perfil global.
6. Un membership `personal` activo llega a `/t/:organizationSlug/personal` y ve el título `Inicio`.
7. La página Inicio no muestra acciones ni datos de producto; las rutas y APIs no autorizadas siguen protegidas.
8. La página principal de organización redirige a personal a su Inicio exclusivo.
9. Membresías suspendidas o removidas no acceden; memberships de otras organizaciones no confieren acceso.
10. Los roles actuales, la invitación y asociación de inquilinos de SPEC-42 y las solicitudes de SPEC-43 mantienen su comportamiento.
11. El shell conserva accesibilidad y presentación responsive dentro de los viewports existentes.
12. La implementación no agrega asociación de propiedad ni funciones de gestión del trabajo de personal.

## Fuera de alcance

- Asignar solicitudes de arreglo al personal, cambiar estados o consultar solicitudes/archivos.
- Agregar mensajería, contactos, llamadas, calendarios, turnos, tareas, reportes o notificaciones.
- Editar datos de perfil después de aceptar, salvo que una especificación posterior lo autorice.
- Agregar asociación de personal a propiedades, contratos, inquilinos o solicitudes.
- Habilitar invitaciones generales de `member` desde el panel de gobernanza.
- Cambiar roles, planes de organización, métodos de login o proveedores de entrega existentes.

## Notas técnicas

- Extender roles/capacidades de backend y frontend; dar a `personal` únicamente `personal.home.read`.
- Agregar una capacidad acotada para invitar personal desde arreglos, asignada a `owner`, `admin` y `member`; comprobar también el rol de destino `personal` en servidor y base de datos.
- Crear una migración aditiva para reconocer el rol y persistir los datos de membresía. No editar migraciones aplicadas; RLS debe continuar forzado y los roles de navegador no deben recibir permisos directos de escritura.
- Extender las RPC o servicios de invitación/aceptación con garantías atómicas para rol y perfil, conservando token/handoff, versión, auditoría, idempotencia y privacidad existentes.
- Extender la proyección del contexto de organización con el destino de inicio basado en membresía confirmada. No utilizar una decisión solo del frontend para otorgar autorización.
- Incorporar una ruta `/t/:organizationSlug/personal` y una página con el shell compartido, sin consultas a APIs de producto.
- Los detalles de componentes y presentación son decisiones de implementación mientras se mantengan permisos mínimos, aislamiento por organización y Inicio sin funcionalidad.

## Evidencia local — 2026-09-12

Implementación y verificaciones completadas: [resultados, comandos reproducibles y pendientes de rollout](../../../06-testing/spec44-personal-invitations.md). La migración también se aplicó y verificó en la rama de desarrollo `multi-tenant` (`kcobkbtieyowdmsvtsvv`). `PERSONAL_INVITATIONS_ENABLED=true` está configurado en `backend/.env` para desarrollo local. El valor por defecto continúa siendo `false`; despliegue de aplicaciones y smoke test alojado pendientes.

## Referencias

- [SPEC-40 — Rol de inquilino e inicio exclusivo](../SPEC-40-rol-inquilino-inicio-exclusivo/SPEC-40-rol-inquilino-inicio-exclusivo.md).
- [SPEC-42 — Propiedades e invitaciones de inquilinos desde Gestión de arreglos](../SPEC-42-propiedades-e-invitaciones-de-inquilinos-en-arreglos/SPEC-42-propiedades-e-invitaciones-de-inquilinos-en-arreglos.md).
- [SPEC-43 — Solicitudes de arreglo de inquilinos](../SPEC-43-solicitudes-de-arreglo-para-inquilinos/SPEC-43-solicitudes-de-arreglo-para-inquilinos.md).
- `backend/src/organizations/roleCapabilities.ts` — catálogo actual de capacidades.
- `backend/src/routes/arrangementProperties.ts` y `backend/src/organizations/organizationService.ts` — integración actual de invitaciones de arreglos.
- `frontend/src/App.tsx` y `frontend/src/app/contexts/OrganizationContext.tsx` — rutas y contexto organizacional.
