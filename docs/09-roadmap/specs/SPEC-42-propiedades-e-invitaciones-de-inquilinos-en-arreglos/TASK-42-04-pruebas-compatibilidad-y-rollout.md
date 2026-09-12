# TASK-42-04 — Pruebas integrales, compatibilidad y rollout

- Estado: `implemented` — verificado localmente y migraciones aplicadas a la rama Supabase de desarrollo `multi-tenant` el 2026-09-12; despliegue de la aplicación pendiente.
- SPEC: [SPEC-42](./SPEC-42-propiedades-e-invitaciones-de-inquilinos-en-arreglos.md)
- Dependencias: `TASK-42-01`, `TASK-42-02` y `TASK-42-03` para el cierre integral; infraestructura de pruebas de invitaciones, arreglos e inquilinos.
- Paralelización: fixtures y matriz de pruebas pueden prepararse con contratos definidos; las pruebas de cierre requieren las tres tareas integradas.

## Resultado

Demostrar con persistencia real que crear una propiedad e invitar desde Gestión de arreglos incorpora al inquilino con su propiedad desde la aceptación, sin romper aislamiento, permisos ni flujos anteriores. Dejar documentado el corte de invitaciones antiguas y separar la evidencia local del despliegue alojado.

## Alcance

- Fixtures de organizaciones A/B, todos los roles, propiedades, identidades nuevas/existentes y membresías/invitaciones legacy sin asociación.
- Recorrido completo de navegador, API, repositorio y base de datos; adaptadores de Auth controlados cuando el entorno lo requiera.
- Pruebas de carreras, fallos parciales, recuperación y atomicidad.
- Regresión de dashboard, navegación exclusiva, invitaciones generales, onboarding owner y propiedad completa.
- Procedimiento de migración/corte, reemplazo de invitaciones legacy, asociación de miembros previos y recuperación compatible.
- Documento `docs/06-testing/spec42-property-invitations.md`, actualización de documentación API/operativa y evidencia enlazada desde las tareas.

## Matriz mínima de verificación

| Caso | Resultado verificable |
| --- | --- |
| Owner/admin crea propiedad e invita a cuenta nueva | ID/nombre persistidos; invitación ligada; registro/aceptación crea membresía con la misma propiedad y abre Inicio |
| Cuenta existente sin membresía acepta | Misma identidad, nueva membresía organizacional y propiedad correcta; ninguna organización nueva |
| Dos inquilinos aceptan invitaciones de una propiedad | Dos membresías distintas referencian el mismo ID |
| Misma identidad en A y B | Propiedad de cada membresía en su propia organización; sin contaminación de consultas o contexto |
| Inquilino previo activo sin propiedad | Asociación explícita con versión; no nueva cuenta ni invitación |
| Intento de segunda propiedad | Conflicto y referencia original intacta |
| Doble clic, retry y carreras | Una propiedad por intento, una invitación lógica vigente y una asociación por membresía |
| Fallo dentro de aceptación | No queda membresía nueva ni invitación consumida sin asociación/auditoría; Auth puede seguir activado sin membresía |
| Respuesta perdida después del commit | Recuperación autenticada del estado confirmado sin duplicar ni reactivar una membresía posteriormente suspendida |
| Rotación/revocación/vencimiento/reemplazo | Enlace anterior inválido; propiedad inmutable en el enlace válido |
| Campos de invitado manipulados e IDs ajenos | Rechazo seguro; no cambio de rol, propiedad u organización |
| Invitación general, aceptación legacy y cambio de rol | No nueva incorporación/transición a inquilino sin propiedad |
| Filas legacy sin propiedad | Invitación requiere reemplazo; membresía previa conserva acceso y puede asociarse explícitamente |
| Member/viewer/inquilino | Lectores sin mutaciones ni datos de inquilinos; inquilino sin acceso a arreglos |
| Cambio de organización/rol/estado durante solicitudes | No datos ni enlaces previos, ni efectos autorizados con un contexto que ya dejó de ser válido |

## Criterios de cierre

- Las pruebas SQL ejecutan las funciones reales con sus dependencias; no se sustituyen por assertions sobre el texto de migraciones.
- Al menos un recorrido browser completo usa API/repositorio/base reales y verifica la referencia persistida al finalizar la aceptación, no solo una etiqueta en pantalla.
- Se cubren cuenta nueva, existente, múltiples inquilinos por propiedad, scope A/B, idempotencia concurrente y rollback por fallo inyectado.
- Los caminos generales y RPC previos se prueban explícitamente para descartar incorporación sin propiedad tras el corte.
- La regresión conserva las órdenes/filtros de SPEC-39, aislamiento/destino de SPEC-40, invitaciones de otros roles, owner de SPEC-41 y ausencia de efectos sobre el dominio completo de propiedades.
- Pasan las suites y comprobaciones relevantes de backend/frontend, SQL y browser indicadas en la guía; cada limitación del entorno queda registrada.
- Las capturas verifican los viewports soportados, teclado, foco y ausencia de overflow/errores de consola.
- El procedimiento de rollout identifica cómo tratar filas previas y clientes antiguos, sin asignar propiedades por inferencias ni aplicar migraciones ajenas.
- La recuperación detiene nuevas operaciones cuando sea necesario y preserva asociaciones, membresías y la garantía de aceptación atómica.
- Los documentos distinguen implementación/verificación local de migración y despliegue remotos. Los gates externos pendientes no se presentan como completados.

## Evidencia requerida para cierre

- Comandos y resultados reproducibles, versiones del entorno y capturas en el documento de pruebas de SPEC-42.
- Matriz de criterios de aceptación de la SPEC y pruebas que los verifican, incluyendo fallos y carreras.
- Inventario de invitaciones/membresías legacy por entorno, sin secretos ni datos personales en la evidencia general.
- Runbook de asociación/reemplazo explícito y recuperación, con contratos de API actualizados.
- Cuando se realice el rollout, registro independiente de esquema/backend/frontend desplegados y smoke test alojado. La tarea no atribuye a esta redacción ninguna ejecución remota.

## Referencias

- [Evidencia local y comandos reproducibles](../../../06-testing/spec42-property-invitations.md): suites backend/frontend, SQL real, seis carreras y recorrido browser con persistencia.
- [Runbook de migración, filas legacy y recuperación](../../../03-operation/spec42-property-invitations-runbook.md). El inventario y ambas migraciones se completaron en desarrollo; el despliegue y los smoke tests alojados permanecen pendientes. [Evidencia de la migración](../../../06-testing/spec42-property-invitations.md#development-migration--2026-09-12).

- [Guía de implementación](./IMPLEMENTATION-GUIDE.md), secciones 6 y 7.
- [TASK-42-01](./TASK-42-01-propiedades-minimas-y-api.md).
- [TASK-42-02](./TASK-42-02-asociacion-e-invitacion-atomica.md).
- [TASK-42-03](./TASK-42-03-dashboard-y-flujo-de-invitacion.md).
