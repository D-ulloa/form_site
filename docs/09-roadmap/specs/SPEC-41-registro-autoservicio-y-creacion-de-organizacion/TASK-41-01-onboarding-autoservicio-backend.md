# TASK-41-01 — Onboarding autoservicio, identidad y bootstrap de organización

- Estado: `pending`
- SPEC: [`SPEC-41`](./SPEC-41-registro-autoservicio-y-creacion-de-organizacion.md)
- Dependencias: `SPEC-26`, `SPEC-35`, `SPEC-36`, servicio de sesión y repositorio de organizaciones existentes
- Paralelización: puede ejecutarse en paralelo con `TASK-41-02` después de fijar el contrato HTTP; bloquea `TASK-41-03` en las pruebas end-to-end

## Resultado

Implementar el servicio backend canónico para que una identidad de Auth nueva se registre con los datos de usuario y nombre de organización, cree exactamente un bootstrap de organización con el registrante como `owner` y devuelva una sesión de aplicación con contexto válido.

El servicio debe rechazar identidades existentes, soportar verificación de email no obligatoria, ser idempotente y conservar el camino de aprovisionamiento por comando.

## Alcance

- Contrato de registro/onboarding y errores seguros.
- Operación/intención durable para coordinar creación de identidad y transacción de organización.
- Adaptación del servicio de identidad sin reutilizar la sesión global legacy.
- Migración nueva y RPC/servicio de bootstrap autoservicio protegido.
- Perfil, organización, settings, owner y auditoría.
- Slug server-side, defaults de plan/locale/timezone y límites de tasa configurables.
- Sesión final y navegación lógica por slug.
- Compatibilidad/regresión del comando `platform:provision-organization`.

## Criterios de cierre

- El endpoint valida nombre, correo, contraseña, confirmación, organización y términos en backend.
- El endpoint rechaza una identidad existente con respuesta anti-enumeración y no crea organización.
- El endpoint rechaza una sesión activa que intente crear otra organización.
- La identidad nueva puede completar alta sin verificación de correo obligatoria y obtiene una sesión utilizable según la política aprobada del proveedor.
- La transacción crea una organización, settings, perfil, membresía activa `owner` y evento de auditoría; el cliente no puede escoger rol ni plan privilegiado.
- El slug es único, seguro, reservado correctamente y reproducible/reanudable durante un retry.
- La misma operación o dos solicitudes concurrentes no generan duplicados.
- Una falla después de crear Auth deja una operación recuperable y no expone secretos.
- El navegador no puede ejecutar directamente el RPC/servicio protegido.
- El comando de plataforma conserva sus controles y pasa sus pruebas existentes.

## Evidencia requerida para cierre

- Migración nueva aplicada en un entorno de prueba y verificada sin editar migraciones históricas.
- Pruebas de servicio/API para éxito, validaciones, identidad existente con y sin membresías, sesión activa, errores de proveedor, idempotencia y rate limit.
- Pruebas de base de datos para rollback, unicidad de slug y carreras por correo/operación.
- Prueba de sesión que demuestre membresía `owner` y contexto `/t/{slug}`.
- Prueba de regresión del comando de plataforma y de invitación a una organización adicional.
- Revisión de logs que confirme ausencia de contraseñas, tokens y secretos.
