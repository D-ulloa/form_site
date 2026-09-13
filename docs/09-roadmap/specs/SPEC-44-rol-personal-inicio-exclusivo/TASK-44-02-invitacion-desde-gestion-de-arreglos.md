# TASK-44-02 — Invitación de personal desde Gestión de arreglos

- Estado: `implemented` (verificado localmente; migración aplicada a desarrollo `multi-tenant`; despliegue y smoke test pendientes)
- SPEC: [SPEC-44](./SPEC-44-rol-personal-inicio-exclusivo.md)
- Dependencias: TASK-44-01 para capacidades, perfil y contrato de aceptación; flujo de invitaciones de SPEC-37/42.
- Paralelización: puede comenzar con contrato de API fijado; su cierre requiere la persistencia y autorización de TASK-44-01.

## Resultado

Permitir que `owner`, `admin` y `member` generen una invitación de rol fijo `personal` desde el dashboard de `Gestión de arreglos` y compartan el enlace. La persona invitada completa sus datos requeridos durante la aceptación.

## Alcance

- Acción y formulario de invitación dentro del contexto de arreglos.
- Formulario de emisión con correo; no captura datos de perfil.
- Formulario de aceptación para que la persona invitada proporcione `Nombre`, `Número de contacto` y `Ocupación` antes de completar su incorporación.
- Reutilización de entrega configurada, enlace manual, rotación, revocación, handoff y aceptación existentes.
- Presentación de la invitación con rol `Personal` y ausencia de selector de rol u organización.
- Acceso controlado por API; el frontend no es la autoridad para mostrar o ejecutar la acción.
- Sin panel general de gestión de personal, asignación de propiedades ni distribución de solicitudes.

## Criterios de cierre

- Owner, admin y member pueden emitir la invitación solo desde la superficie autorizada de arreglos.
- Viewer, inquilino y personal no tienen acción ni autorización API para invitar personal.
- Member no puede invitar admin, member, viewer o inquilino, tampoco desde la API general.
- La persona invitada proporciona los tres campos requeridos durante la aceptación; el rol proviene del registro de invitación y el perfil se guarda junto con la membresía.
- La invitación pendiente no almacena los datos de perfil. Una validación fallida permite corregir y reintentar sin consumir la invitación.
- Invitaciones vencidas, revocadas, reemplazadas o de identidad incompatible no crean membership.
- Reintentos no duplican invitaciones válidas ni exponen tokens duraderos.
- Invitaciones existentes de otros roles y flujo de inquilino SPEC-42 conservan su comportamiento.

## Evidencia requerida

- Pruebas de endpoint y servicio por emisor, organización y rol destino.
- Pruebas de emisión/aceptación con el repositorio y persistencia real.
- Pruebas de integración del formulario, errores, copiado/recuperación de enlace y contexto.
- Recorrido browser con actor autorizado y no autorizado, sin invitación externa real.

## Secuencia concreta

1. Crear `routes/arrangementPersonal.ts`, montarlo bajo arreglos y conectar `OrganizationService.invitePersonal`. El body de emisión solo contiene `{ email }`; rol, propiedad y organización nunca son opciones del cliente.
2. Incorporar rutas dedicadas de creación, rotación y revocación en `/personal/invitations`. Reutilizar las políticas distribuidas y seguridad de mutación existentes; proponer que member recupere únicamente sus propias invitaciones personales y que owner/admin mantengan su autoridad de gestión.
3. Conectar preparación durable → provisioning autorizado → creación SQL → recibo de `InvitationWorkflowService`. Un replay sin enlace devuelve ID y acción recuperable, sin duplicar emisión ni guardar el token.
4. Extender `POST /api/invitations/accept`, repositorio/workflow y cliente para `personal_profile`, con rol resuelto en servidor. Conservar body vacío para los otros roles y errores corregibles antes del consumo.
5. Añadir `Invitar personal` y diálogo de correo al dashboard. Representar recibos con/sin `share_url`; limpiar enlace e intentos al cerrar o cambiar contexto. No añadir consultas de gobernanza para member.
6. Añadir el formulario de tres campos después de autenticarse en `InvitationAcceptPage`. Separar nombre global del registro y nombre de membresía; cubrir registro, login existente y retorno Google. Proteger respuestas tardías tras cambio de cuenta o invitación.
7. Actualizar etiqueta `Personal` en entrega, resolución y listas existentes; probar body estricto, doble envío, expiración, recuperación y regresiones SPEC-35/37/41/42.

Contratos detallados, política propuesta de recuperación y archivos de pruebas están en las secciones 2, 3 y 5 de la guía. No permitir nueva emisión hasta completar la compatibilidad de TASK-44-03.

## Evidencia local — 2026-09-12

Implementación y verificaciones completadas: [resultados, comandos reproducibles y pendientes de rollout](../../../06-testing/spec44-personal-invitations.md). La migración también se aplicó y verificó en la rama de desarrollo `multi-tenant` (`kcobkbtieyowdmsvtsvv`). `PERSONAL_INVITATIONS_ENABLED=true` está configurado en `backend/.env` para desarrollo local. El valor por defecto continúa siendo `false`; despliegue de aplicaciones y smoke test alojado pendientes.

## Referencias

- [Guía de implementación](./IMPLEMENTATION-GUIDE.md), secciones 3 y 5.
- [TASK-44-01](./TASK-44-01-rol-personal-perfil-y-autorizacion.md).
- [TASK-44-03](./TASK-44-03-inicio-personal-compatibilidad-y-rollout.md).
