# TASK-44-01 — Rol personal, perfil y autorización

- Estado: `ready`
- SPEC: [SPEC-44](./SPEC-44-rol-personal-inicio-exclusivo.md)
- Dependencias: modelo de organización/membresía, invitaciones y capacidades de SPEC-26/37/40/42.
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

## Referencias

- [Guía de implementación](./IMPLEMENTATION-GUIDE.md), secciones 1 y 2.
- [TASK-44-02](./TASK-44-02-invitacion-desde-gestion-de-arreglos.md).
