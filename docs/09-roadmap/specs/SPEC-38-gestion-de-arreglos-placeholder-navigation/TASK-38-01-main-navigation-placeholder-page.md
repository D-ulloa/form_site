# TASK-38-01 — Navegación principal y página placeholder de gestión de arreglos

- Estado: `completed`
- SPEC: [`SPEC-38`](./SPEC-38-gestion-de-arreglos-placeholder-navigation.md)
- Dependencias: página principal autenticada, contexto de organización y límite de rutas existente.
- Paralelización: tarea única; la implementación de la ruta, la página y sus pruebas se cierra como una unidad.

## Resultado

Agregar la acción `Gestión de arreglos` a la navegación principal de la organización, crear la ruta `/t/:organizationSlug/arrangements` dentro del límite de organización, renderizar su página placeholder visualmente consistente y conectar la acción `Inicio` de vuelta a `/t/:organizationSlug`.

## Criterios de cierre

- La página principal muestra las cuatro acciones en el orden definido por SPEC-38.
- La nueva acción usa el patrón visual y de interacción de las acciones existentes, incluyendo teclado y focus visible.
- La navegación a la ruta de arreglos conserva el slug y pasa por las comprobaciones actuales de sesión y organización.
- La página placeholder reutiliza el shell existente, mantiene vacío el contenido y no carga datos ni controles de arreglos.
- `Inicio` es visible, accesible y vuelve a la página principal de la misma organización.
- Las tres acciones existentes conservan sus etiquetas, destinos y comportamiento.
- Se agregan o actualizan las pruebas frontend necesarias para cubrir la navegación, la protección de la ruta y el retorno a la organización correcta.
- No se modifican backend, base de datos, storage, integraciones ni permisos fuera del límite existente.

## Evidencia requerida para cierre

- Resultado de las pruebas frontend relevantes para la página principal, la nueva ruta y la navegación de retorno.
- Comprobación en los viewports soportados de que el shell no genera overflow y mantiene la consistencia visual.
- Confirmación del diff de que el cambio permanece dentro del alcance frontend definido por SPEC-38.

## Evidencia de cierre — 2026-09-10

- `frontend/src/pages/ActionSelectionPage.tsx` agrega `Gestión de arreglos` como cuarta acción y conserva los tres flujos existentes. El encabezado permite wrap para evitar overflow en pantallas de 320 px.
- `frontend/src/App.tsx` registra `arrangements` como ruta hija de `OrganizationRouteBoundary`. `ArrangementsPage.tsx` usa `useOrganization()`, mantiene el contenido vacío y enlaza `Inicio` con el slug confirmado.
- Se corrigió una condición de carga del límite existente: al volver a la organización previa durante una validación pendiente, un contexto limpiado espera la nueva respuesta en lugar de redirigir a `/`. Se mantienen las comprobaciones de acceso y se descartan respuestas obsoletas.
- `frontend/tests/integration/ArrangementsNavigation.test.tsx`: 15 pruebas aprobadas sobre rutas reales, orden de acciones, flujos existentes, ida y vuelta en Azar/Solar, acceso directo, respuestas 401/403/404/503, sesión no disponible y cambios de organización.
- `cd frontend && npm test`: 24 archivos, 137 pruebas aprobadas.
- `cd frontend && npm run lint`: aprobado.
- `cd frontend && npm run build`: aprobado; Vite informa la advertencia de bundle mayor a 500 kB.
- `cd frontend && npm run test:e2e -- tests/e2e/arrangements-navigation.spec.ts`: 5 pruebas aprobadas con sesión y contexto simulados; sin escrituras a servicios externos.
- Viewports comprobados: 1280×800, 390×844 y 320×740. Sin overflow horizontal ni errores de consola en el flujo autenticado; se verificaron foco visible, activación por teclado, `Inicio`, historial del navegador y recarga directa. Las capturas `organization-home.png` y `arrangements-placeholder.png` se generan en `frontend/test-results/` por viewport.
- La navegación del placeholder solo realiza las solicitudes existentes de sesión/contexto. El diff de implementación se limita a frontend, pruebas y documentación; no introduce servicios, datos, permisos ni consultas del dominio de arreglos.
