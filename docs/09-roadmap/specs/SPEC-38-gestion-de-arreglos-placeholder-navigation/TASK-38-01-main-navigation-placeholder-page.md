# TASK-38-01 — Navegación principal y página placeholder de gestión de arreglos

- Estado: `pending`
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
