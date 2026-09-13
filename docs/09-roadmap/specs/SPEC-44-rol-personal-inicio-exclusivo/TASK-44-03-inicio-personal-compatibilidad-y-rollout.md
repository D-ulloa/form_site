# TASK-44-03 — Inicio personal, compatibilidad y rollout

- Estado: `ready`
- SPEC: [SPEC-44](./SPEC-44-rol-personal-inicio-exclusivo.md)
- Dependencias: TASK-44-01 para rol, capacidad y proyección; TASK-44-02 para aceptar y refrescar invitaciones.
- Paralelización: la página puede prepararse tras fijar el destino del contexto; cierre conjunto tras integrar invitación y autorización reales.

## Resultado

Crear el destino exclusivo `/t/:organizationSlug/personal` con contenido de producto vacío, proteger el resto de las rutas y certificar el nuevo rol en el flujo completo de organización.

## Alcance

- Resolución del destino luego de login, selección de organización y aceptación.
- Redirección desde `/t/:organizationSlug` y denegación de rutas internas.
- Página con título `Inicio`, shell compartido y controles globales mínimos.
- Revalidación/limpieza de contexto al cambiar sesión, organización, estado o rol.
- Pruebas de compatibilidad y viewport, migración de desarrollo y smoke test conforme al proceso de entrega elegido.

## Criterios de cierre

- Una membresía personal activa solo ve su Inicio dentro de la organización autorizada.
- El contenido no tiene acciones ni solicitudes a APIs de producto.
- Suspensión/remoción detiene el acceso y los cambios de organización no conservan contenido anterior.
- No existen bucles de redirección, errores de consola ni overflow en 1280×800, 390×844 y 320×740.
- Se ejecutan regresiones de SPEC-40/42/43 y roles existentes.
- La evidencia distingue implementación, aplicación de migración, despliegue y smoke test.

## Evidencia requerida

- Pruebas de contexto/rutas para personal, roles internos e inquilino.
- Pruebas browser de inicio, navegación directa, rutas denegadas y logout.
- Ejecución de migración/RPC contra base desechable y plan de rollout compatible.
- Evidencia del entorno seleccionado si se aplica migración o se despliega.

## Referencias

- [Guía de implementación](./IMPLEMENTATION-GUIDE.md), secciones 4–6.
- [TASK-44-01](./TASK-44-01-rol-personal-perfil-y-autorizacion.md).
- [TASK-44-02](./TASK-44-02-invitacion-desde-gestion-de-arreglos.md).
