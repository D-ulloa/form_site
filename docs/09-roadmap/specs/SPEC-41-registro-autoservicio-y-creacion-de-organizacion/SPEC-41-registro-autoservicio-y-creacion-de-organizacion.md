# SPEC-41 — Registro autoservicio y creación de organización para el propietario inicial

- Estado: `pending`
- Fecha: `2026-09-03`
- Prioridad: `high`
- Autor: `redacted`

## Objetivo

Convertir el alta desde la entrada inicial del sitio en el camino canónico para incorporar un nuevo cliente: además de iniciar sesión, una persona no registrada podrá crear su cuenta, proporcionar el nombre de su organización y recibir una organización nueva con esa persona como propietario (`owner`).

El flujo debe conservar el comando privilegiado de aprovisionamiento de organizaciones para operaciones internas y migraciones, pero no debe utilizarlo desde el navegador. Una cuenta existente no podrá crear organizaciones nuevas mediante el registro autoservicio, aunque pertenezca a cero, una o varias organizaciones.

## Contexto

La entrada inicial (`ActionSelectionPage`) actualmente ofrece únicamente el acceso de inicio de sesión. El formulario de registro existente está cerrado fuera de escenarios sintéticos de desarrollo y los caminos legacy de autenticación global no representan una organización ni una membresía de propietario.

La plataforma ya dispone de organizaciones, membresías, sesiones con contexto de organización, invitaciones y un comando operativo de aprovisionamiento. El modelo permite que un usuario pertenezca a varias organizaciones; esta especificación no elimina esa capacidad. La nueva regla es más específica: el alta autoservicio solo puede crear la organización inicial para una identidad de Auth verdaderamente nueva.

La verificación de correo no será obligatoria para completar el alta. Puede existir como una acción recomendada o posterior, pero no podrá impedir que el nuevo propietario acceda a su organización. No se incorporará CAPTCHA.

## Requisitos funcionales

### Entrada inicial y formulario de alta

- La vista/modal inicial para una persona no autenticada debe permitir elegir entre iniciar sesión y registrarse.
- El registro debe solicitar, como mínimo: nombre completo, correo electrónico, contraseña, confirmación de contraseña, nombre visible de la organización y aceptación de los términos requeridos.
- El formulario no debe permitir seleccionar el rol. La persona que completa el alta siempre será creada como `owner` de la organización nueva.
- El nombre de organización debe ser un dato explícito del alta. No se debe reutilizar silenciosamente `company` como autoridad ni permitir que `role` proveniente del cliente decida privilegios.
- No se debe añadir CAPTCHA, challenge equivalente ni dependencia de un proveedor CAPTCHA.
- Las validaciones de accesibilidad, teclado, móvil y errores deben ser equivalentes a las del inicio de sesión existente.

### Elegibilidad del registro autoservicio

- Solo se permite el alta cuando el correo no corresponde a una identidad de Auth existente.
- Una identidad existente no podrá crear una organización autoservicio, incluso si no tiene membresías activas.
- Una identidad existente que ya pertenece a una o más organizaciones tampoco podrá crear una organización autoservicio.
- Una sesión activa no podrá invocar el registro para crear una organización nueva.
- La respuesta para un correo existente debe evitar la enumeración de cuentas. La interfaz puede orientar a iniciar sesión, pero no debe revelar membresías ni crear una organización.
- La regla se debe aplicar en backend y en la capa de persistencia; ocultar el botón en frontend no es un control suficiente.

### Creación de cuenta y organización

- El backend debe crear o provisionar la identidad nueva, el perfil, la organización, sus settings, la membresía inicial y el evento de auditoría.
- La membresía inicial debe tener rol `owner`, estado activo y capacidades derivadas por el sistema. El cliente no puede alterar estos valores.
- El nombre recibido se guarda como nombre visible/display name, sujeto a las validaciones de organización existentes.
- El slug se genera en backend a partir del nombre, con normalización, manejo de palabras reservadas, colisiones y unicidad. El nombre visible y el slug no deben confundirse.
- El plan, locale y timezone iniciales deben provenir de defaults configurables del servidor o de una política aprobada; no deben ser privilegios controlables desde el formulario.
- La operación debe dejar evidencia suficiente para reintentar o recuperar un alta cuyo resultado no haya llegado al navegador.
- Al finalizar, el backend debe devolver la sesión de aplicación normal con la membresía del propietario y el slug; el frontend debe navegar a `/t/{organizationSlug}`.

### Verificación de correo

- La verificación de correo no es un prerrequisito para completar el alta.
- La cuenta y la membresía pueden quedar utilizables inmediatamente después de que Auth y el bootstrap de la organización hayan terminado correctamente.
- Si el proveedor mantiene el estado de correo no confirmado, la aplicación no debe bloquear por ese estado el acceso inicial definido en este SPEC. Si el proveedor exige confirmación para emitir sesión/password, el adaptador debe resolverlo mediante una configuración o flujo permitido por el proveedor, sin convertirlo en un paso visible obligatorio.
- Cualquier mensaje de “verificá tu correo” debe ser informativo, no una barrera ni una condición para crear la organización.

### Usuarios existentes e invitaciones

- El nuevo camino no crea membresías en organizaciones preexistentes.
- Una vez que el nuevo usuario sea propietario de su organización, podrá ser invitado a otra organización usando el flujo de invitaciones vigente, sujeto a las reglas de rol y aceptación existentes.
- El alta por invitación sigue siendo un camino distinto: una invitación no debe crear una organización del invitado.
- La restricción de este SPEC no cambia la posibilidad de que un usuario tenga membresías en varias organizaciones ni cambia el acceso por contexto de organización.

### Compatibilidad con aprovisionamiento operativo

- El comando `platform:provision-organization` y su flujo de aprobación, fingerprint, operador y evidencia se mantienen.
- El comando continúa siendo el camino para operaciones privilegiadas, migraciones y casos administrados; no se expone como endpoint público ni se ejecuta desde el navegador.
- El código compartido debe evitar divergencias entre el bootstrap autoservicio y el bootstrap operativo, pero ambos deben conservar sus controles de autorización y sus `creation_source` correspondientes.

## Flujo y comportamiento esperado

1. Una persona sin sesión abre el sitio y ve el acceso inicial con las opciones de iniciar sesión y registrarse.
2. Selecciona registro y completa nombre, correo, contraseña, confirmación, nombre de organización y términos.
3. El frontend valida formato, longitudes y confirmación, y envía el contrato de alta al endpoint de autenticación usando una solicitud protegida por origen, límite de tasa y controles de sesión.
4. El backend normaliza los datos y comprueba que no exista ya una identidad para el correo. Si existe, rechaza el bootstrap sin revelar detalles ni crear datos nuevos.
5. Para una identidad nueva, el backend crea la identidad y registra una operación de onboarding idempotente.
6. En una operación transaccional, crea el perfil, la organización, settings, membresía `owner` y evento de auditoría. El slug se genera y valida dentro del proceso.
7. El backend establece o devuelve la sesión de aplicación con la nueva membresía y el slug.
8. El frontend dirige al propietario a su organización. La verificación de correo, si se recomienda, aparece como aviso posterior y no interrumpe el acceso.
9. Si el cliente pierde la respuesta después de crear la identidad u organización, un reintento seguro o un mecanismo de recuperación debe devolver el resultado existente, sin duplicar la organización.
10. Una identidad existente que usa el formulario de registro recibe una orientación genérica hacia el inicio de sesión y no obtiene un segundo camino de creación.

## Reglas de negocio

- El rol del creador autoservicio es siempre `owner`.
- Solo una identidad de Auth nueva puede iniciar el bootstrap autoservicio.
- La prohibición para identidades existentes se evalúa por identidad/correo normalizado, no por la cantidad actual de membresías.
- El correo no confirmado no impide el alta según la decisión de producto de este SPEC.
- No se utiliza CAPTCHA.
- El cliente no puede escoger plan privilegiado, organización existente, `creation_source`, actor, rol, estado de membresía ni identificadores internos.
- El nombre de organización no debe convertirse en un identificador de autenticación ni otorgar permisos.
- Las organizaciones siguen aisladas por contexto y autorización de membresía.
- Por defecto, se recomienda que cada cuenta nueva tenga una única organización creada por este flujo. Las organizaciones adicionales para una cuenta existente requieren una decisión explícita o el camino operativo; no se habilitan por accidente durante esta implementación.
- El comando de plataforma conserva su autoridad y no se reemplaza por el formulario web.

## API y persistencia

- El contrato público de alta debe aceptar el nombre completo, correo, contraseña, nombre de organización y términos. Se recomienda conservar `POST /api/auth/register` como endpoint canónico para evitar una ruta duplicada, eliminando la respuesta permanente `REGISTRATION_CLOSED`.
- El contrato no debe aceptar `role` como fuente de autorización. `company` puede dejar de ser público o mantenerse únicamente como compatibilidad explícita, mapeado a `organization_name` sin ambigüedad.
- La implementación debe agregar una migración hacia adelante; no se deben editar migraciones históricas.
- Se recomienda un servicio de onboarding autoservicio y una RPC de servicio dedicada, por ejemplo `spec41_create_self_service_organization`, o una abstracción equivalente con el mismo límite de seguridad. No basta con quitar el rechazo actual de `self_service` sin agregar controles de identidad, idempotencia y origen.
- El RPC de creación debe ser invocable solo por el rol de servicio/worker autorizado; el navegador no debe poder ejecutar directamente la creación.
- La transacción debe aplicar constraints existentes para organización, settings, owner, evento y unicidad. El evento debe identificar correctamente al miembro creador cuando la arquitectura lo permita, sin falsear un operador de plataforma.
- Se debe usar una clave de idempotencia/operation intent vinculada a la identidad nueva y al intento de alta, sin guardar contraseñas ni tokens crudos.

## Validaciones y manejo de errores

- Correo inválido, contraseña fuera de política, confirmación distinta, nombre vacío/excesivo o términos no aceptados deben producir errores de campo sin crear identidad ni organización.
- Correo ya existente debe producir una respuesta segura y accionable, sin confirmar si tiene membresías, sesiones u organizaciones.
- Un slug reservado, inválido o en colisión debe resolverse mediante generación alternativa segura o error recuperable; nunca debe terminar apuntando a otra organización.
- Reintentos con la misma operación deben ser idempotentes y devolver el mismo resultado lógico.
- Dos altas concurrentes para el mismo correo no deben crear dos identidades ni dos organizaciones.
- Si Auth se crea y la transacción de organización falla, el estado debe quedar recuperable mediante operación pendiente/reanudación o compensación documentada; no se debe borrar indiscriminadamente una identidad que pueda haber sido utilizada.
- Si se crea la organización y se pierde la respuesta, una recuperación autenticada debe localizar la operación y entregar el contexto correcto.
- No se deben registrar contraseñas, tokens, secretos ni datos completos de invitación en logs.
- Los límites de tasa deben cubrir intentos por IP, correo normalizado y operación, sin depender de CAPTCHA.

## Criterios de aceptación

1. La entrada inicial muestra inicio de sesión y registro para una persona sin sesión.
2. El registro solicita nombre completo, correo, contraseña, confirmación, nombre de organización y términos.
3. El formulario no ofrece selector de rol y el backend crea al registrante como `owner`.
4. Un registro válido de una identidad nueva crea exactamente una cuenta, una organización, sus settings, una membresía owner y el evento de auditoría correspondiente.
5. El usuario termina autenticado y es dirigido al slug de su organización.
6. El nombre visible de la organización proviene del campo enviado por el usuario y el slug es generado de forma segura por el backend.
7. La verificación de correo no bloquea la creación, la sesión ni el acceso inicial.
8. No existe integración ni requisito de CAPTCHA.
9. Un correo asociado a una identidad existente no puede crear organización, tenga o no tenga membresías.
10. Un usuario ya autenticado no puede reutilizar el endpoint para crear otra organización autoservicio.
11. El cliente no puede elevar permisos enviando `role`, `plan_key`, `creation_source` u otros campos internos.
12. Los reintentos y carreras por correo/operación no producen duplicados.
13. Las fallas parciales quedan reanudables o se reportan con un estado operativo recuperable.
14. El flujo de invitaciones existente continúa funcionando y un propietario recién creado puede ser invitado a otra organización conforme a sus reglas.
15. El aprovisionamiento por comando continúa funcionando, con sus controles de operador, fingerprint y aprobación intactos.
16. Las rutas y capacidades de miembros, administradores, propietarios e `inquilino` no se mezclan con el onboarding nuevo; `owner` conserva su ámbito normal de organización.
17. Las pruebas cubren aislamiento entre organizaciones, autenticación, errores, idempotencia, concurrencia y pérdida de respuesta.

## Consultas y decisiones pendientes

Estas consultas deben resolverse antes de cerrar la implementación. Se incluyen recomendaciones para no ocultar decisiones de producto dentro del código:

- **Plan inicial:** ¿el plan por defecto debe ser `standard`? Recomendación: sí, usando un default del servidor.
- **Nombre legal:** ¿se requiere además un nombre legal separado? Recomendación: no para este flujo; solicitar solo nombre visible y agregar el legal después desde la configuración.
- **Estado de email en el proveedor:** dado que la verificación no es obligatoria, ¿se permite sesión con email no confirmado o se debe marcar la identidad como confirmada al completar el alta? Recomendación: mantener la verificación como no bloqueante y documentar la configuración exacta de Supabase/Auth elegida.
- **Organizaciones adicionales:** ¿una cuenta nueva podrá crear otra organización en el futuro? Recomendación: no mediante autoservicio en esta entrega; usar el comando operativo hasta que exista una política explícita.
- **Google:** ¿el registro de Google debe estar disponible desde la nueva sección? Recomendación: sí, preservando el intento de registro y aplicando la misma regla: una identidad Google ya existente no puede crear una organización.
- **Campos legacy:** ¿se elimina `company` y `role` del contrato y del formulario? Recomendación: eliminar `role` de forma obligatoria y reemplazar `company` por `organization_name`; cualquier compatibilidad debe ser transitoria y sin autoridad.
- **Límites operativos:** ¿qué límites de tasa y límites por IP/correo se desean? Recomendación inicial: reutilizar la infraestructura existente y establecer valores configurables antes del canary.

## Notas técnicas

- La solución debe reutilizar `SessionService`, las capacidades por membresía y las validaciones del dominio de organizaciones.
- No se debe reutilizar `contractPasswordAuth` ni su sesión global de administrador para el camino canónico.
- El registro por invitación y el handoff de invitación siguen siendo distintos del registro inicial.
- La nueva ruta debe poder deshabilitarse mediante feature flag/kill switch durante el despliegue, sin borrar el código ni alterar el comando de plataforma.
- La activación de la política no requiere migrar automáticamente usuarios existentes ni crear organizaciones retroactivas.
- Cualquier cambio de `creation_source` o actor de auditoría debe quedar documentado y cubierto por migración y pruebas de regresión.

## Referencias

- [`SPEC-38`](../SPEC-38-gestion-de-arreglos-placeholder-navigation/)
- [`SPEC-39`](../SPEC-39-gestion-de-arreglos-dashboard-ordenes-abiertas/)
- [`SPEC-40`](../SPEC-40-rol-inquilino-inicio-exclusivo/)
- [`SPEC-26` — Gobierno de organizaciones](../pending/26-SPEC-multi-tenant-organizations-memberships-onboarding-and-lifecycle.md)
- [`SPEC-35` — Provisionamiento de identidad y perfil](../pending/35-SPEC-production-auth-user-and-profile-provisioning.md)
- [`SPEC-36` — Provisionamiento de organizaciones](../pending/36-SPEC-production-organization-and-initial-owner-provisioning.md)
- [`SPEC-37` — Invitaciones manuales](../pending/37-SPEC-production-member-invitation-delivery-and-activation.md)
