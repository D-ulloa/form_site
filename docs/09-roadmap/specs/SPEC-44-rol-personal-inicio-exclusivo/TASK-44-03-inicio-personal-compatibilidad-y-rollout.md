# TASK-44-03 — Inicio personal, compatibilidad y rollout

- Estado: `implemented` (verificado localmente; migración aplicada a desarrollo `multi-tenant`; despliegue y smoke test pendientes)
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

## Secuencia concreta

1. Extender `home_destination` y `OrganizationAccessBoundary` a los tres destinos explícitos. Exigir rol/capacidad confirmados; evitar que personal llegue a montar cualquier pantalla interna.
2. Extraer el shell visual de `InquilinoHomePage` a un componente compartido y crear `PersonalHomePage`. Personal muestra solo `Inicio` en main; inquilino conserva sus solicitudes de SPEC-43.
3. Registrar `/t/:organizationSlug/personal`. Reutilizar navegación a la organización tras aceptación, selección y login; el contexto del servidor determina la redirección final.
4. Verificar baja, revalidación focus/visibilidad, cambio de identidad y A → B → A con respuestas tardías. Comprobar por red que personal solo usa sesión/contexto/logout y no consultas de producto.
5. Ejecutar el recorrido real para cuenta nueva y existente, perfiles distintos de la misma identidad en dos organizaciones, persistencia tras login y regresiones SPEC-26/27/35/37/39/40/41/42/43.
6. Crear `docs/06-testing/spec44-personal-invitations.md` con comandos, entorno, resultados y límites. Incluir SQL/upgrade/concurrencia, navegador en los tres viewports y cobertura de los 12 criterios de aceptación.
7. Preparar gate de nueva emisión, secuencia esquema → backend compatible → frontend → habilitación y recuperación compatible con filas personales existentes. Registrar migración, despliegue y smoke test solo cuando se ejecuten.

El plan no acredita validación runtime ni rollout. La documentación de preparación debe conservar explícitamente cualquier prueba o acción de entrega pendiente.

## Evidencia local — 2026-09-12

Implementación y verificaciones completadas: [resultados, comandos reproducibles y pendientes de rollout](../../../06-testing/spec44-personal-invitations.md). La migración también se aplicó y verificó en la rama de desarrollo `multi-tenant` (`kcobkbtieyowdmsvtsvv`). `PERSONAL_INVITATIONS_ENABLED=true` está configurado en `backend/.env` para desarrollo local. El valor por defecto continúa siendo `false`; despliegue de aplicaciones y smoke test alojado pendientes.

## Referencias

- [Guía de implementación](./IMPLEMENTATION-GUIDE.md), secciones 4–6.
- [TASK-44-01](./TASK-44-01-rol-personal-perfil-y-autorizacion.md).
- [TASK-44-02](./TASK-44-02-invitacion-desde-gestion-de-arreglos.md).
