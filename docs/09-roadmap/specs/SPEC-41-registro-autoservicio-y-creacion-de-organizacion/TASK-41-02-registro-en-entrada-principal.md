# TASK-41-02 — Registro desde la entrada principal y handoff al contexto creado

- Estado: `pending`
- SPEC: [`SPEC-41`](./SPEC-41-registro-autoservicio-y-creacion-de-organizacion.md)
- Dependencias: [`TASK-41-01`](./TASK-41-01-onboarding-autoservicio-backend.md), `ActionSelectionPage`, `AuthPage`, `App` y API de autenticación
- Paralelización: puede desarrollarse en paralelo con el backend usando el contrato acordado; requiere backend para la verificación end-to-end

## Resultado

Actualizar la experiencia inicial para que una persona nueva pueda pasar de la entrada pública al registro completo, indicar el nombre de la organización y terminar dentro de la organización recién creada. El formulario debe compartir convenciones de login y mantener separados registro normal, Google e invitaciones.

## Alcance

- Sección/tab de registro visible desde la modal o pantalla inicial no autenticada.
- Campos de nombre completo, correo, contraseña, confirmación, organización y términos.
- Eliminación del selector de rol y tratamiento explícito de `organization_name`.
- Estados de validación, carga, error seguro para email existente y recuperación de respuesta perdida.
- Mensaje opcional de verificación posterior sin bloqueo.
- Navegación a `/t/{organizationSlug}` con la sesión devuelta por backend.
- Preservación del login, Google, aceptación de invitaciones y rutas de `SPEC-40`.

## Criterios de cierre

- Al abrir el sitio sin sesión se puede cambiar entre login y registro sin abandonar el flujo.
- El registro no depende de `VITE_ALLOW_SYNTHETIC_REGISTRATION` para funcionar en el camino de producto aprobado.
- El usuario ve y completa el nombre de organización; el rol no aparece como campo editable.
- Los errores se muestran sin enumerar si un email ya tiene cuenta y orientan a login cuando corresponde.
- No se muestra CAPTCHA ni una casilla de verificación de email obligatoria.
- Un alta válida navega al slug retornado por backend y muestra el contexto de la organización del nuevo owner.
- Un usuario autenticado no obtiene un botón o acción frontend que intente crear otra organización.
- La invitación existente continúa llevando al flujo de aceptación y no crea una organización del invitado.
- Los roles `owner`, `admin`, `member`, `viewer` e `inquilino` conservan su UI y rutas previstas.
- El formulario es usable con teclado, lector de pantalla, móvil, foco visible y errores asociados a sus campos.

## Evidencia requerida para cierre

- Pruebas de componentes/página para cambio login-registro, validaciones y estados de error.
- Prueba con respuesta de alta exitosa que verifique la ruta final y el slug recibido.
- Prueba con email existente que confirme que no se filtran membresías ni se habilita creación.
- Prueba de regresión para login, Google callback, invitación y entrada autenticada con múltiples membresías.
- Verificación manual o automatizada de accesibilidad y responsive en la entrada inicial.
