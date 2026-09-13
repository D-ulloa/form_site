# TASK-44-02 — Invitación de personal desde Gestión de arreglos

- Estado: `ready`
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

## Referencias

- [Guía de implementación](./IMPLEMENTATION-GUIDE.md), secciones 3 y 5.
- [TASK-44-01](./TASK-44-01-rol-personal-perfil-y-autorizacion.md).
- [TASK-44-03](./TASK-44-03-inicio-personal-compatibilidad-y-rollout.md).
