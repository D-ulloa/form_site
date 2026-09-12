# SPEC-42 — Propiedades e invitaciones de inquilinos desde Gestión de arreglos

- Estado: `implemented` — verificado localmente y migraciones aplicadas a la rama Supabase de desarrollo `multi-tenant` el 2026-09-12; despliegue de la aplicación pendiente.
- Fecha: `2026-09-12`
- Prioridad: `high`
- Autor: `redacted`

## Objetivo

Activar la acción `Generar propiedad` del dashboard de `Gestión de arreglos` para crear una propiedad con un identificador generado por el sistema y un nombre elegido por la persona que la crea. Desde ese mismo dashboard, un usuario autorizado podrá seleccionar la propiedad, agregar un inquilino y generar su enlace de invitación.

La propiedad debe quedar vinculada a la invitación antes de compartir el enlace. Al completar su incorporación, el invitado debe obtener una membresía `inquilino` y su asociación a esa propiedad en una misma transacción. No debe existir un paso posterior obligatorio para asignarle la propiedad.

## Contexto

- SPEC-39 implementó `/t/:organizationSlug/arrangements`, el listado de órdenes abiertas, su filtro y la acción `Inicio`. `Generar propiedad` permanece inerte; esta SPEC reemplaza expresamente esa restricción.
- SPEC-40 incorporó el rol `inquilino`, su alta por invitación y el destino exclusivo `/t/:organizationSlug/inquilino`. La invitación y la membresía todavía no contienen una asociación de propiedad.
- El flujo vigente de SPEC-37 genera enlaces manuales, establece un handoff de invitación y separa la activación de cuenta de la aceptación que crea la membresía. SPEC-42 reutiliza ese flujo.
- La aplicación también tiene `Agregar nueva propiedad` y el dominio de propiedades de SPEC-30, con formularios, borradores, revisiones y procesos externos. El registro mínimo de este dashboard no debe activar esos procesos por inferencia.
- Un participante `Inquilino` de un contrato no equivale a una membresía `inquilino`; la nueva asociación no deriva permisos ni vínculos de un formulario contractual.

## Decisiones de alcance

Las decisiones de cardinalidad y registro independiente fueron confirmadas por el usuario el `2026-09-12`. Los permisos, datos mínimos del invitado y tratamiento de miembros existentes son criterios propuestos para completar este alcance con los controles actuales.

| Tema | Propuesta para esta versión |
| --- | --- |
| Cardinalidad — confirmada | Una propiedad admite varios inquilinos; cada membresía `inquilino` tiene una sola propiedad asociada dentro de su organización. Una misma identidad puede tener otra propiedad en otra organización. |
| Relación con el alta de propiedades existente — confirmada | Crear un registro independiente y mínimo para Gestión de arreglos, con ID automático y nombre manual. Sin sincronización ni conversión automática al dominio de SPEC-30. |
| Permisos de gestión | `owner` y `admin` pueden crear propiedades, asociar inquilinos y generar invitaciones. `member` y `viewer` conservan la lectura del dashboard y pueden ver ID/nombre de las propiedades, sin datos de inquilinos ni controles de gestión. |
| Datos del invitado | Pedir correo para generar la invitación. El nombre del invitado se completa durante su registro mediante el formulario existente. |
| Inquilinos ya incorporados | Permitir asociar una membresía activa `inquilino` sin propiedad. No emitir otra invitación para una persona que ya es miembro activo de la misma organización. |

## Requisitos funcionales

### Crear una propiedad desde el dashboard

- La ruta de entrada sigue siendo `/t/:organizationSlug/arrangements`.
- Para un `owner` o `admin` autorizado, `Generar propiedad` abre un formulario dentro del contexto del dashboard, con un único dato de producto obligatorio: `Nombre de la propiedad`.
- El nombre se recorta en sus extremos y debe contener entre 1 y 200 caracteres. Se presenta como texto, sin interpretar HTML. Se permiten nombres repetidos; el identificador distingue las propiedades.
- El identificador debe generarse en el servidor o la base de datos, ser estable, único e inmutable. El usuario no tiene que escribirlo ni puede escogerlo.
- Al confirmar, se persiste la propiedad en la organización validada y se muestra en una sección `Propiedades` con su nombre e identificador. Debe seguir disponible después de recargar o volver al dashboard.
- Cancelar no crea registros. Un error de validación conserva el nombre escrito y permite corregirlo.
- Un doble envío o un reintento de la misma operación no debe crear dos propiedades. La idempotencia no debe deduplicar creaciones intencionalmente distintas solo porque comparten nombre.
- No se requieren dirección, tipo de inmueble, fotografías, contrato ni otros atributos de producto. Organización, autoría, fechas técnicas, versión e idempotencia pueden existir para integridad y trazabilidad.

### Consultar y seleccionar propiedades

- La sección `Propiedades` lista únicamente registros de la organización activa, con paginación acotada cuando corresponda.
- Debe permitir seleccionar una propiedad para agregar inquilinos desde el propio dashboard, mediante una expansión, panel o diálogo conforme a los componentes existentes.
- El listado de órdenes abiertas, su filtro por estado y `Inicio` permanecen disponibles. Crear una propiedad no crea una orden ni asigna órdenes a esa propiedad.
- La sección de propiedades y la de órdenes tienen estados independientes de carga, vacío y error. La ausencia de órdenes no impide crear una propiedad.
- Los usuarios de lectura ven ID y nombre. Los datos de inquilinos e invitaciones requieren los permisos de gestión correspondientes y no se envían a esos usuarios.

### Agregar un inquilino y generar su invitación

- Un `owner` o `admin` selecciona una propiedad persistida y utiliza `Agregar inquilino`.
- Para invitar a una persona, ingresa su correo y confirma `Generar invitación`. El formulario muestra el nombre y el ID de la propiedad seleccionada.
- El backend valida correo, propiedad, organización y autoridad del invitante. El rol de esta operación es siempre `inquilino`; no hay selector de rol ni autoridad tomada del cuerpo de la solicitud.
- La invitación guarda la referencia de propiedad y el rol antes de devolver un enlace utilizable. La emisión no crea una membresía activa ni muestra al invitado como ya incorporado.
- Puede reutilizarse el aprovisionamiento de identidad/perfil de las invitaciones actuales; no se crea una identidad ficticia ni una membresía provisional para representar la invitación pendiente.
- El dashboard muestra la invitación pendiente asociada a la propiedad y permite copiar el enlace manual. Esta entrega no exige enviar correos automáticamente ni agregar un proveedor de entrega.
- Rotar o reemplazar un enlace conserva su propiedad y rol, invalida el enlace anterior y respeta las reglas actuales de handoff. No se cambia la propiedad al regenerar un enlace.
- Revocar o vencer una invitación impide incorporarse mediante ella y no crea una asociación activa. El dashboard distingue invitaciones pendientes de inquilinos incorporados y muestra los estados reales de invitación.
- Un reintento de emisión no debe crear múltiples invitaciones válidas para el mismo intento. Si se perdió el enlace devuelto una sola vez, se recupera mediante una rotación explícita, sin persistir el token crudo.
- Una invitación pendiente del mismo correo para otra propiedad produce un conflicto accionable; no se cambia de propiedad ni se reemplaza silenciosamente. Corregir la propiedad requiere revocar la invitación anterior y emitir otra explícitamente.

### Registro y aceptación con propiedad vinculada

- El enlace sigue usando `/invitations/accept` y los mecanismos vigentes de token, handoff, sesión, origen y validación del correo invitado.
- La resolución válida puede mostrar el nombre y el ID de la propiedad de esa invitación, junto con la organización y el rol. No expone otros inquilinos ni un listado de propiedades.
- Una persona nueva activa/registra su cuenta con el flujo de invitación. Una persona con cuenta existente inicia sesión y acepta, sin crear otra identidad u organización.
- La activación de Auth puede completarse antes de aceptar, conforme al flujo actual. En ese estado todavía no existe una membresía `inquilino` nueva; la invitación ya contiene la propiedad de destino.
- La incorporación se considera completa cuando la aceptación crea o reactiva la membresía y persiste su propiedad en la misma transacción que consume la invitación y registra la auditoría.
- Si la asociación no puede persistirse, la aceptación completa debe revertirse. No debe quedar una membresía nueva activa y sin propiedad, ni una invitación consumida sin la asociación correspondiente.
- Tanto el registro por invitación como la aceptación comprueban que la invitación `inquilino` tenga una propiedad válida. La aceptación revalida todo, aunque la resolución o el registro anteriores hayan sido correctos.
- El invitado no puede elegir, omitir ni sustituir la propiedad, el rol o la organización en la URL, formulario o solicitud de aceptación. La autoridad es la invitación persistida.
- Después de aceptar se refresca la sesión/contexto y se aplica el destino de SPEC-40: `/t/:organizationSlug/inquilino`. Su página `Inicio` conserva el contenido de producto vacío y no obtiene capacidades adicionales.
- Los accesos posteriores usan el inicio de sesión normal y conservan la asociación persistida sin reutilizar el enlace.

### Asociar a un inquilino existente

- Desde `Agregar inquilino` se puede elegir una membresía activa con rol `inquilino` de la misma organización que todavía no tenga propiedad.
- El servidor asocia esa membresía a la propiedad seleccionada con control de versión y auditoría. No cambia su rol ni crea otra identidad, membresía o invitación.
- Repetir la misma asociación es seguro. Intentar asociar una membresía que ya tiene otra propiedad produce conflicto; el traslado entre propiedades queda fuera de esta entrega.
- Una cuenta existente que aún no pertenece a la organización usa la invitación normal. Una membresía activa de otro rol no se convierte silenciosamente en inquilino al ingresar su correo.
- Las membresías suspendidas o removidas no se reactivan mediante esta acción. La aceptación de una nueva invitación puede conservar la reactivación autorizada vigente, pero no sobrescribir una asociación previa a otra propiedad.

### Cerrar caminos alternativos sin propiedad

- Desde la activación de SPEC-42, toda nueva invitación con rol `inquilino` requiere una propiedad. El formulario general de miembros debe dirigir a este dashboard para ese rol o solicitar la misma referencia utilizando el servicio común.
- Los endpoints y RPC anteriores no pueden seguir creando o aceptando invitaciones nuevas de inquilino sin propiedad. Los otros roles conservan sus contratos y no reciben una propiedad por defecto.
- Un cambio autorizado de rol hacia `inquilino`, incluido un rol resultante de transferencia de ownership, debe exigir una propiedad válida y persistir ambos cambios atómicamente. Si el camino todavía no soporta esa asociación, debe rechazar la transición con un error accionable, sin cambiar el rol.
- Las membresías `inquilino` previas no se eliminan ni se asocian por correo, contrato, nombre o cercanía de fechas. Las que no tienen propiedad se identifican como pendientes de asociación para un administrador y pueden completarse desde el dashboard.
- Las invitaciones previas de inquilino sin propiedad no pueden completar nuevas incorporaciones después del corte. Un administrador debe reemplazarlas explícitamente desde una propiedad; los enlaces antiguos quedan inutilizables.
- Suspender o remover una membresía conserva su referencia histórica y elimina el acceso conforme a SPEC-40. La referencia por sí sola no otorga acceso ni debe presentarse como un inquilino activo.

## Flujo y comportamiento esperado

1. Un propietario o administrador abre `Gestión de arreglos` en su organización.
2. Selecciona `Generar propiedad`, escribe un nombre y confirma.
3. El sistema crea un registro con ID automático y lo muestra en `Propiedades`.
4. Selecciona esa propiedad, utiliza `Agregar inquilino`, ingresa el correo y genera la invitación.
5. El sistema persiste la invitación `inquilino` vinculada a la propiedad y devuelve un enlace para copiar y compartir.
6. El invitado abre el enlace, revisa organización y propiedad, y registra su cuenta o inicia sesión.
7. Al aceptar, el servidor valida la invitación y guarda membresía, propiedad, consumo de invitación y auditoría en una transacción.
8. El inquilino llega a su `Inicio` exclusivo con la propiedad ya asociada. El dashboard muestra la incorporación después de actualizar sus datos.
9. Un segundo invitado puede incorporarse a la misma propiedad con su propia invitación y membresía.
10. Si ya existe una membresía activa `inquilino` sin propiedad, el administrador puede asociarla directamente desde el mismo dashboard, sin enviar otra invitación.

## Reglas de negocio y autorización

- La propiedad pertenece a una sola organización. Toda referencia de invitación o membresía debe apuntar a una propiedad de esa misma organización.
- La asociación pertenece a la membresía de organización, no al perfil o identidad global de Auth.
- Solo `owner` y `admin` activos en una organización activa pueden realizar las mutaciones de esta SPEC. Las capacidades se comprueban en servidor y en la transacción; ocultar botones no sustituye estos controles.
- `member` y `viewer` no pueden crear propiedades, asociar miembros ni generar invitaciones. `inquilino` conserva únicamente `inquilino.home.read` y no puede consultar el dashboard ni sus APIs.
- El ID de una propiedad identifica un registro y no concede acceso. Los IDs de otra organización se resuelven con el error genérico existente, sin revelar datos ajenos.
- La combinación de rol y estado de membresía determina si una asociación corresponde a un inquilino activo. Una asociación histórica no convierte a un miembro interno o suspendido en inquilino activo.
- Ni la creación de propiedad ni la asociación crean contratos, órdenes, assets, revisiones, carpetas de Drive, filas de Sheets o ejecuciones de Make.

## Validaciones y manejo de errores

- Nombre vacío/excesivo y correo inválido producen errores de campo antes de cualquier efecto de dominio o proveedor.
- Propiedad o membresía ajena/inexistente produce un error seguro y no crea invitaciones ni revela identidad o datos de otra organización.
- Una invitación ausente, vencida, revocada, reemplazada, sin propiedad válida o incompatible con la identidad autenticada no permite completar la incorporación.
- Los conflictos de propiedad, membresía ya activa o versión desactualizada se explican al administrador sin reasignaciones implícitas.
- Una caída posterior a la activación de Auth deja al usuario capaz de iniciar sesión y retomar una invitación vigente; no justifica aceptar sin propiedad ni borrar la identidad.
- Si la aceptación se confirmó pero se perdió su respuesta, se puede recuperar el contexto autenticado y la asociación persistida. Un reintento no duplica membresías ni asociaciones y no reactiva por accidente una membresía suspendida después.
- Cambiar organización, identidad, rol o estado retira datos anteriores, cancela solicitudes y cierra formularios que pertenecían al contexto anterior.
- Los tokens y enlaces de invitación no se guardan en logs, auditoría, almacenamiento local ni cachés persistentes. El enlace se muestra solo en el recibo de emisión o rotación autorizado.

## Criterios de aceptación

1. `Generar propiedad` abre el formulario para un `owner` o `admin` y crea un registro con ID automático y nombre manual válido.
2. La propiedad persiste después de recargar, solo aparece en su organización y no activa el formulario completo ni integraciones de propiedades.
3. Un reintento del mismo intento de creación devuelve la misma propiedad; dos creaciones distintas pueden compartir nombre.
4. El dashboard conserva órdenes abiertas, filtros, paginación, navegación a `Inicio`, shell y comportamiento responsive.
5. Desde una propiedad se genera y copia una invitación `inquilino` que contiene esa propiedad antes de compartirse.
6. La invitación pendiente se distingue de una membresía incorporada; varias personas pueden ser invitadas a la misma propiedad.
7. Una cuenta nueva completa registro y aceptación con membresía y propiedad persistidas atómicamente; una cuenta existente puede aceptar sin duplicar identidad.
8. La manipulación de organización, rol o propiedad por el invitado no altera la asociación del servidor.
9. Un fallo al persistir la asociación revierte membresía, aceptación y auditoría de esa incorporación.
10. Vencimiento, revocación, rotación y reemplazo impiden utilizar enlaces anteriores y conservan la propiedad de la invitación válida.
11. Reintentos, doble clic y carreras no crean asociaciones duplicadas ni trasladan un inquilino a otra propiedad.
12. Un administrador puede asociar un inquilino activo previo sin propiedad; una membresía ya asociada a otra propiedad produce conflicto.
13. Nuevas invitaciones y transiciones hacia `inquilino` no pueden eludir el requisito de propiedad mediante endpoints o RPC previos.
14. Invitaciones antiguas sin propiedad requieren reemplazo explícito; membresías anteriores conservan sus accesos y se corrigen sin asociaciones inventadas.
15. `member` y `viewer` solo leen ID/nombre de propiedades; los datos de inquilinos y las mutaciones quedan reservados a quienes tienen autorización.
16. El inquilino termina en su `Inicio` exclusivo, conserva la asociación en siguientes sesiones y no obtiene acceso a propiedades, miembros, contratos o arreglos.
17. Suspensión, remoción, cambios de organización y respuestas tardías no dejan datos ni acceso anterior en pantalla.
18. Las pruebas cubren el recorrido completo con persistencia real, aislamiento A/B, rollback transaccional, reintentos y regresión de SPEC-39/40/41.

## Fuera de alcance

- Editar, archivar o eliminar propiedades; trasladar o desvincular inquilinos; varias propiedades por membresía en una organización.
- Migrar, sincronizar o fusionar registros con el dominio de SPEC-30 o el alta completa de propiedades.
- Asociar órdenes, crear solicitudes de arreglos desde el inquilino o implementar su ciclo de vida.
- Crear o inferir relaciones con contratos, cobros, garantes, propietarios contractuales o archivos.
- Agregar funcionalidades de producto a `Inicio` del inquilino, selección pública de propiedades o registro público con rol `inquilino`.
- Automatizar la entrega del enlace por correo u otros canales.

## Referencias

- [Evidencia local y comandos reproducibles](../../../06-testing/spec42-property-invitations.md): suites backend/frontend, SQL real, seis carreras y recorrido browser con persistencia.
- [Runbook de migración, filas legacy y recuperación](../../../03-operation/spec42-property-invitations-runbook.md). El inventario y ambas migraciones se completaron en desarrollo; el despliegue y los smoke tests alojados permanecen pendientes. [Evidencia de la migración](../../../06-testing/spec42-property-invitations.md#development-migration--2026-09-12).

- [Guía de implementación](./IMPLEMENTATION-GUIDE.md).
- [TASK-42-01 — Propiedad mínima y API](./TASK-42-01-propiedades-minimas-y-api.md).
- [TASK-42-02 — Asociación e invitación](./TASK-42-02-asociacion-e-invitacion-atomica.md).
- [TASK-42-03 — Dashboard y aceptación](./TASK-42-03-dashboard-y-flujo-de-invitacion.md).
- [TASK-42-04 — Pruebas y rollout](./TASK-42-04-pruebas-compatibilidad-y-rollout.md).
- [SPEC-39 — Dashboard de órdenes abiertas](../SPEC-39-gestion-de-arreglos-dashboard-ordenes-abiertas/).
- [SPEC-40 — Rol de inquilino e inicio exclusivo](../SPEC-40-rol-inquilino-inicio-exclusivo/).
- [SPEC-41 — Registro autoservicio](../SPEC-41-registro-autoservicio-y-creacion-de-organizacion/).
- [SPEC-26 — Gobierno de organizaciones](../pending/26-SPEC-multi-tenant-organizations-memberships-onboarding-and-lifecycle.md).
- [SPEC-30 — Dominio de propiedades](../pending/30-SPEC-multi-tenant-properties-submissions-modifications-and-management.md).
- [SPEC-37 — Invitaciones y activación](../pending/37-SPEC-production-member-invitation-delivery-and-activation.md).
- [Estándares de ingeniería](../../../07-development/engineering-standards.md).
