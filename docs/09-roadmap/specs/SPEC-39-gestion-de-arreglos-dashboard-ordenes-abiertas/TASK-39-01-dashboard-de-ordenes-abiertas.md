# TASK-39-01 — Dashboard de órdenes abiertas de gestión de arreglos

- Estado: `pending`
- SPEC: [`SPEC-39`](./SPEC-39-gestion-de-arreglos-dashboard-ordenes-abiertas.md)
- Dependencias: ruta placeholder de SPEC-38, autenticación, contexto de organización, persistencia con alcance organizacional y convenciones actuales de API/frontend.
- Paralelización: tarea única; el modelo mínimo, la consulta, el dashboard, el filtro y las pruebas se cierran como una unidad.

## Resultado

Reemplazar el placeholder de `/t/:organizationSlug/arrangements` por un dashboard protegido y con alcance por organización que liste órdenes abiertas con nombre, estado e identificador, permita filtrarlas por estado, conserve la acción `Inicio` y muestre una acción `Generar propiedad` sin comportamiento.

## Criterios de cierre

- Un miembro o usuario con cualquier otro estado válido dentro de la organización puede acceder al dashboard mediante los controles existentes.
- La base de datos o capa de persistencia contempla una orden con el conjunto mínimo de identificador, nombre, estado y referencia de organización necesaria para el aislamiento.
- La lista solo muestra órdenes abiertas pertenecientes a la organización activa.
- Cada fila o elemento de la lista muestra nombre, estado e identificador.
- El filtro permite seleccionar un estado disponible y volver a ver todos los estados.
- Los estados vacío, sin resultados y error siguen las convenciones existentes y no exponen datos de otra organización.
- `Generar propiedad` es visible, accesible y no ejecuta ninguna operación, navegación, consulta ni mutación.
- `Inicio` es visible, accesible y vuelve a `/t/:organizationSlug` con el contexto correcto.
- El dashboard mantiene el shell visual y el comportamiento responsive del sitio.
- Se agregan pruebas suficientes para el acceso, aislamiento, lectura, filtrado, acción inerte y navegación de retorno.
- No se agregan funcionalidades de creación de propiedades ni de gestión completa del ciclo de vida de órdenes.

## Evidencia requerida para cierre

- Resultado de las pruebas de persistencia, API y frontend relevantes para el dashboard.
- Evidencia de que un usuario de una organización no puede consultar órdenes de otra organización.
- Evidencia de que el filtro por estado devuelve solamente coincidencias del conjunto autorizado.
- Evidencia de que `Generar propiedad` no dispara navegación, solicitudes ni mutaciones.
- Comprobación en los viewports soportados de que la lista y sus controles no generan overflow y mantienen la consistencia visual.
- Confirmación del diff de que los cambios permanecen dentro del alcance de SPEC-39.
