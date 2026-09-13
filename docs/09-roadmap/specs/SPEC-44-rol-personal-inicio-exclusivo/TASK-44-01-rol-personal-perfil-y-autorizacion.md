# TASK-44-01 — Rol personal, perfil y autorización

- Estado: `implemented` (verificado localmente; migración aplicada a desarrollo `multi-tenant`; despliegue y smoke test pendientes)
- SPEC: [SPEC-44](./SPEC-44-rol-personal-inicio-exclusivo.md)
- Dependencias: modelo de organización/membresía, aprovisionamiento de identidad e invitaciones de SPEC-26/35/37/40/42, conservando el esquema posterior a SPEC-43.
- Paralelización: fija el contrato de rol, campos y autorización que consumen las tareas de invitación y navegación.

## Resultado

Agregar `personal` como rol válido de membresía, almacenar `Nombre`, `Número de contacto` y `Ocupación` en el alcance de una organización, y autorizar exclusivamente el Inicio personal y la emisión acotada de invitaciones desde arreglos.

## Alcance

- Tipos de rol y capacidades actualizados en backend, frontend y persistencia.
- Capacidad de Inicio solo para `personal` y capacidad dedicada para invitar personal asignada a `owner`, `admin` y `member`.
- Restricción servidor/base de datos para que dicha capacidad solo permita destino `personal`.
- Campos asociados a la membresía, con validación y aislamiento entre organizaciones.
- Persistencia atómica de `Nombre`, `Número de contacto` y `Ocupación`, enviados por la persona invitada durante la aceptación y ligados al membership de esa organización.
- Migración aditiva, RPC/repositorio y contratos API necesarios; sin cambios a migraciones aplicadas.

## Criterios de cierre

- `personal` es un rol persistido, independiente de estado y reconocido por el contexto.
- El rol no hereda capacidades internas y solo obtiene `personal.home.read`.
- Owner/admin/member pueden emitir el rol permitido por la operación dedicada; member no puede invitar otros roles.
- La aceptación requiere los tres campos enviados por la persona invitada y los guarda junto con la membresía; la invitación pendiente no contiene esos datos.
- No se filtran valores en logs, token, URL ni respuesta no autorizada.
- Las restricciones previas de roles, estados, ownership y gobernanza se conservan.

## Evidencia requerida

- Pruebas unitarias de capacidades y validación.
- Pruebas de migración, restricciones, RLS/grants y aceptación/perfil con base real desechable.
- Regresión de SPEC-26/37/40/42 y comprobación de aislamiento por organización.
- Diff revisado para confirmar que no se editan migraciones ya aplicadas.

## Secuencia concreta

1. Añadir `personal`, `personal.home.read` y `arrangements.personal.invite`; incrementar versión del registro. Mantener `allowedInvitationRoles` restringido y habilitar a owner/admin para gestionar el estado de una membresía personal.
2. Fijar `personal_profile: { name, contact_number, occupation }` y sus validadores. Persistir en columnas `personal_name`, `personal_contact_number`, `personal_occupation`, obligatorias para rol personal. La guía propone máximos de 120/64/120 caracteres tras trim.
3. Añadir migración posterior a SPEC-43 con constraints, guards y registro durable `arrangement_personal_invitation_operations`, sin propiedad y sin perfil/token/correo crudo.
4. Autorizar provisioning mediante referencia a una operación personal preparada. Actualizar actor confiable, repositorio y claim SQL de SPEC-35; probar que member no obtiene una entrada genérica de provisioning.
5. Extender el núcleo SQL de aceptación con validación/perfil/consumo/auditoría atómicos. Conservar adaptadores anteriores para otros roles y hacer que rechacen personal sin perfil; proteger recuperación ante commit perdido.
6. Revisar RPC de cambios de rol/ownership para que no creen personal por un camino alternativo. Conservar perfiles válidos durante suspensión/remoción/reactivación y rechazar asociaciones de propiedad incompatibles.
7. Añadir proyecciones explícitas para impedir que las columnas nuevas se serialicen desde rutas de gobernanza. Completar pruebas SQL de rollback, firmas/grants, aislamiento y upgrade antes de conectar el frontend.

Los contratos HTTP y formularios se conectan en TASK-44-02. Esta tarea entrega persistencia y autoridad comprobables de forma independiente; no se cierra solo con tipos o checks textuales de SQL.

## Evidencia local — 2026-09-12

Implementación y verificaciones completadas: [resultados, comandos reproducibles y pendientes de rollout](../../../06-testing/spec44-personal-invitations.md). La migración también se aplicó y verificó en la rama de desarrollo `multi-tenant` (`kcobkbtieyowdmsvtsvv`). `PERSONAL_INVITATIONS_ENABLED=true` está configurado en `backend/.env` para desarrollo local. El valor por defecto continúa siendo `false`; despliegue de aplicaciones y smoke test alojado pendientes.

## Referencias

- [Guía de implementación](./IMPLEMENTATION-GUIDE.md), secciones 1–3.
- [TASK-44-02](./TASK-44-02-invitacion-desde-gestion-de-arreglos.md).
