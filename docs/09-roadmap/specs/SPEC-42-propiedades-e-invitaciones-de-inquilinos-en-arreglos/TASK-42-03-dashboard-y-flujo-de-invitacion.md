# TASK-42-03 — Dashboard de propiedades y flujo de invitación

- Estado: `implemented` — verificado localmente y migraciones aplicadas a la rama Supabase de desarrollo `multi-tenant` el 2026-09-12; despliegue de la aplicación pendiente.
- SPEC: [SPEC-42](./SPEC-42-propiedades-e-invitaciones-de-inquilinos-en-arreglos.md)
- Dependencias: shell/contexto y dashboard de SPEC-39/40; contratos de `TASK-42-01` y `TASK-42-02`; aceptación de invitación existente.
- Paralelización: puede desarrollarse con contratos fijados durante el trabajo backend; su cierre requiere integración con las APIs reales.

## Resultado

Permitir crear una propiedad, seleccionarla, agregar un inquilino y copiar su invitación sin salir del contexto de Gestión de arreglos. La pantalla de aceptación debe mostrar la propiedad vinculada por el servidor y llevar al inquilino a su Inicio exclusivo al completar la incorporación.

## Alcance

- Activación de `Generar propiedad` para propietarios/administradores y formulario de nombre con componentes actuales.
- Sección `Propiedades` con ID/nombre, paginación y estados propios de carga, vacío y error.
- Panel/diálogo de propiedad con invitaciones, inquilinos asociados y acción `Agregar inquilino` para gestores.
- Invitación por correo con enlace manual y acciones explícitas de copiar, rotar y revocar.
- Selección/asociación de un inquilino activo previo sin propiedad, con control de versión.
- Proyección de propiedad de solo lectura en `InvitationAcceptPage`, reutilizando registro/login y aceptación existentes.
- Ajuste del panel general de miembros para emitir inquilinos por el flujo con propiedad.
- Invalidación de consultas, limpieza de contexto y tratamiento de errores recuperables/conflictos.

## Criterios de cierre

- Un gestor crea una propiedad desde `Generar propiedad` con un único campo de producto obligatorio; cancelar no escribe y una espera no permite doble envío accidental.
- Una creación exitosa muestra el ID/nombre persistidos y permite invitar inmediatamente sin una recarga manual obligatoria.
- El listado sigue siendo correcto al recargar o cambiar organización; no mezcla propiedades con el alta completa existente.
- Órdenes abiertas, filtro, paginación e `Inicio` conservan sus funciones; un listado de órdenes vacío no bloquea propiedades.
- `member`/`viewer` ven ID/nombre pero no controles ni datos de inquilinos/invitaciones. El inquilino no monta el dashboard ni inicia sus consultas.
- `Agregar inquilino` identifica la propiedad elegida y permite invitar por correo o asociar un inquilino elegible existente.
- La UI distingue invitación pendiente, aceptada, vencida/revocada/reemplazada y membresía activa/inactiva según respuestas reales.
- Un conflicto por otra propiedad, identidad ya incorporada o versión obsoleta no se resuelve sobrescribiendo datos; permite refrescar/corregir.
- El recibo manual permite copiar el enlace; la pérdida del recibo ofrece rotación explícita y los enlaces no se guardan en almacenamiento persistente ni telemetría.
- La aceptación muestra solo la propiedad de la invitación resuelta, sin selector ni campos editables de propiedad/rol/organización.
- Tras aceptar, se refresca contexto y se aplica el destino de SPEC-40. `Inicio` del inquilino sigue sin funcionalidades de producto.
- Invitaciones de otros roles, login normal, Google y registro owner de SPEC-41 conservan su comportamiento.
- Cambiar usuario, organización, rol o estado cancela trabajo anterior, descarta respuestas tardías y retira los datos/enlaces del contexto previo.
- Formularios, diálogos, errores y foco funcionan por teclado y mantienen legibilidad y ausencia de overflow en los viewports usados por SPEC-39.

## Evidencia requerida para cierre

- Pruebas de integración de formulario, creación, actualización de lista, selección, invitación/copia y asociación de miembro previo.
- Pruebas de lectura por rol y ausencia de consultas de miembros/invitaciones para lectores y de APIs de arreglos para inquilinos.
- Pruebas de errores, reintentos, cambio de contexto y respuestas tardías.
- Regresión actualizada de SPEC-39: retirar únicamente la expectativa de acción inerte sustituida por SPEC-42, preservando filtros y navegación.
- Capturas y recorrido browser a 1280×800, 390×844 y 320×740, con foco/teclado, sin errores de consola ni overflow.
- Validación integrada con las APIs implementadas antes de marcar la tarea completa; los mocks solos no prueban incorporación persistida.

## Referencias

- [Evidencia local y comandos reproducibles](../../../06-testing/spec42-property-invitations.md): suites backend/frontend, SQL real, seis carreras y recorrido browser con persistencia.
- [Runbook de migración, filas legacy y recuperación](../../../03-operation/spec42-property-invitations-runbook.md). El inventario y ambas migraciones se completaron en desarrollo; el despliegue y los smoke tests alojados permanecen pendientes. [Evidencia de la migración](../../../06-testing/spec42-property-invitations.md#development-migration--2026-09-12).

- [Guía de implementación](./IMPLEMENTATION-GUIDE.md), secciones 3, 5 y 6.
- [TASK-42-01](./TASK-42-01-propiedades-minimas-y-api.md).
- [TASK-42-02](./TASK-42-02-asociacion-e-invitacion-atomica.md).
