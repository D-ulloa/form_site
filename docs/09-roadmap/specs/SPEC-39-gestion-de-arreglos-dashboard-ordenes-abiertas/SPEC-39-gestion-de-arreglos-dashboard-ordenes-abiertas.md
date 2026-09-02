# SPEC-39 — Dashboard de gestión de arreglos y órdenes abiertas

- Estado: `pending`
- Fecha: `2026-09-02`
- Prioridad: `medium`
- Autor: `redacted`

## Objetivo

Reemplazar la página placeholder de gestión de arreglos por un dashboard con alcance por organización para consultar órdenes abiertas. El dashboard debe mostrar una lista de órdenes con los datos mínimos de nombre, estado e identificador, permitir filtrar la lista por estado e incluir una acción `Generar propiedad` que, en esta primera versión, no ejecute ninguna operación.

La funcionalidad debe integrarse con la autenticación, el contexto de organización, el layout, la tipografía, los espaciados y la paleta ya existentes. El alcance de esta SPEC se limita a la consulta y presentación del listado, el filtro por estado y la presencia de la acción sin comportamiento.

## Contexto

La SPEC-38 estableció la ruta `/t/:organizationSlug/arrangements` y una página placeholder como punto de entrada para la futura gestión de arreglos. Esta SPEC define el primer contenido funcional de esa área: una vista de seguimiento de órdenes abiertas para los usuarios que pertenecen a la organización.

La primera versión necesita un modelo de órdenes intencionalmente pequeño. Cada orden solo debe contemplar un nombre, un estado y un identificador persistido en la base de datos. No se deben anticipar en este cambio los detalles de reparaciones, mantenimiento, propiedades, asignaciones, responsables, fechas, costos, archivos ni otros atributos del dominio.

## Requisitos funcionales

### Acceso al dashboard

- Un usuario autenticado que sea miembro de la organización, o que tenga cualquier otro estado de usuario válido dentro de esa organización, debe poder entrar a la gestión de arreglos.
- La página debe permanecer disponible en:

  ```text
  /t/:organizationSlug/arrangements
  ```

- El acceso debe utilizar el mismo límite de autenticación, autorización y contexto de organización establecido por las demás páginas con alcance de organización.
- El slug de la URL no debe conceder acceso por sí mismo. La organización activa debe provenir del contexto de ruta validado.
- Los controles de acceso existentes para usuarios autenticados y miembros o estados válidos de la organización no deben debilitarse ni duplicarse de forma divergente.

### Dashboard de órdenes

- La ruta debe renderizar un dashboard de gestión de arreglos dentro del shell visual existente.
- El dashboard debe mostrar una lista de órdenes abiertas pertenecientes exclusivamente a la organización activa.
- Cada orden visible debe mostrar únicamente, como información de dominio, los siguientes campos:
  - nombre;
  - estado; y
  - identificador.
- El identificador debe ser estable y corresponder al registro persistido en la base de datos.
- La lista debe tener un estado claro cuando no existan órdenes que mostrar, sin inventar órdenes ni datos simulados.
- La carga de órdenes debe respetar el contexto de organización en cada consulta y respuesta.

### Modelo mínimo de órdenes

- Debe existir una representación persistida de una orden con los campos mínimos de nombre, estado e identificador.
- El identificador debe ser único conforme a las convenciones de persistencia existentes.
- El nombre y el estado deben ser valores almacenados y retornados por la fuente de datos; no deben derivarse exclusivamente en el frontend.
- La organización propietaria de la orden debe quedar determinada por el modelo o mecanismo de alcance existente, de modo que una consulta no pueda devolver órdenes de otra organización.
- Esta versión no define campos adicionales ni requiere relaciones con propiedades, usuarios, archivos, proveedores o servicios externos.
- Las reglas específicas del ciclo de vida y el catálogo definitivo de estados deben permanecer acotados a lo necesario para listar y filtrar los valores actualmente disponibles. Si se requiere un estado inicial para crear datos de prueba o fixtures, debe documentarse como una decisión de implementación y no como una expansión del dominio.

### Filtro por estado

- El dashboard debe permitir filtrar las órdenes mostradas por estado.
- El control de filtro debe exponer los estados disponibles en las órdenes consultables, junto con una opción para ver todos los estados.
- Al seleccionar un estado, la lista debe mostrar únicamente las órdenes de la organización activa cuyo estado coincida con el filtro seleccionado.
- El filtro debe actualizar la presentación sin perder el contexto de organización ni introducir consultas a otra organización.
- El comportamiento del filtro debe ser comprensible y accesible mediante teclado, con una etiqueta o nombre accesible que indique que filtra por estado.
- Si el filtro seleccionado no tiene resultados, el dashboard debe mostrar un estado vacío específico para ese filtro sin presentar registros de otra categoría.

### Acción `Generar propiedad`

- El dashboard debe incluir una acción visible con la etiqueta exacta `Generar propiedad`.
- La acción debe ubicarse junto a los controles principales del dashboard siguiendo las convenciones visuales existentes.
- En esta versión, la acción no debe crear propiedades, órdenes ni ningún otro registro.
- La acción no debe navegar a una ruta no especificada, abrir un formulario, llamar a un endpoint ni iniciar una integración.
- Debe conservar un comportamiento deliberadamente inerte mientras mantiene un nombre accesible, foco visible y el tratamiento de interacción definido por el sistema de diseño existente.
- La presencia de la acción prepara un punto de extensión para una especificación futura; su comportamiento no debe inferirse de esta SPEC.

### Navegación del encabezado

- El dashboard debe conservar el shell y el encabezado de la página de gestión de arreglos.
- El encabezado debe mantener una acción visible `Inicio`.
- Al seleccionarla, debe volver a:

  ```text
  /t/:organizationSlug
  ```

- La navegación de retorno debe conservar el slug de la organización activa y continuar pasando por los controles existentes.

## Flujo y comportamiento esperado

1. Un usuario autenticado con un estado válido dentro de una organización entra a `/t/:organizationSlug/arrangements`.
2. La aplicación valida la sesión y el contexto de organización mediante el límite de rutas existente.
3. El dashboard consulta y muestra las órdenes abiertas de la organización activa, mostrando el nombre, estado e identificador de cada una.
4. El usuario selecciona un estado y la lista se limita a las órdenes que coinciden con ese estado.
5. El usuario puede seleccionar `Todos` para volver a ver las órdenes de todos los estados disponibles dentro del conjunto consultable.
6. El usuario puede ver la acción `Generar propiedad`, pero seleccionarla no produce navegación, mutación, consulta adicional ni otro efecto de dominio.
7. El usuario selecciona `Inicio` y vuelve a `/t/:organizationSlug` dentro de la misma organización.

## Reglas de negocio

- Una orden solo puede aparecer si pertenece a la organización activa.
- El acceso a la ruta no puede otorgarse mediante el slug sin una sesión válida y un estado válido dentro de la organización.
- La lista se limita a órdenes abiertas según el criterio de disponibilidad definido por la fuente de datos; esta SPEC no introduce un ciclo de vida completo de órdenes.
- Nombre, estado e identificador son los únicos datos de dominio requeridos en la interfaz de esta versión.
- El filtro por estado no modifica órdenes ni persiste preferencias.
- `Generar propiedad` es una acción sin operación en esta versión y no debe tener efectos secundarios.
- No se agregan reglas de negocio para crear propiedades, asignar órdenes, registrar reparaciones, gestionar mantenimiento ni cerrar órdenes.
- No se cambian los permisos de la organización fuera de los límites de acceso ya aplicados a sus páginas.

## Validaciones y manejo de errores

- La navegación directa a la ruta debe pasar por los controles actuales de sesión y organización.
- Un usuario sin sesión o sin un estado válido de acceso debe recibir el comportamiento de rechazo ya establecido por la aplicación, sin exposición de órdenes.
- Un slug o contexto de organización inválido debe resolverse con el manejo de rutas existente y no debe renderizar datos de arreglos.
- Los errores de carga de órdenes deben usar el patrón de error existente y no mostrar registros parciales sin indicar que la carga fue incompleta.
- Un conjunto vacío debe distinguirse de un error de carga.
- El filtro debe conservar la legibilidad, el foco y la accesibilidad en los viewports soportados.
- La lista y sus controles no deben producir overflow horizontal ni perder información esencial en tamaños de escritorio o móvil.
- Las pruebas frontend y de integración relevantes deben comprobar el alcance por organización, la lista mínima, el filtro y el carácter inerte de `Generar propiedad`.

## Criterios de aceptación

1. Un usuario autenticado con un estado válido dentro de una organización puede acceder al dashboard en `/t/:organizationSlug/arrangements`.
2. El dashboard muestra exclusivamente las órdenes abiertas de la organización activa.
3. Cada orden muestra su nombre, estado e identificador persistidos.
4. El usuario puede filtrar la lista por estado y volver a mostrar todos los estados disponibles.
5. El resultado del filtro nunca incluye órdenes de otra organización.
6. El dashboard muestra un estado vacío adecuado cuando no hay órdenes o cuando el filtro no devuelve resultados.
7. La acción visible `Generar propiedad` existe y no produce navegación, mutación, consulta adicional ni efecto de dominio al seleccionarse.
8. La acción `Inicio` permanece visible y accesible, y vuelve a `/t/:organizationSlug` conservando la organización activa.
9. La página reutiliza el shell, la paleta, la tipografía, los espaciados y las convenciones responsive existentes.
10. La ruta conserva los controles actuales de autenticación y autorización de organización.
11. No se agregan campos de orden, comportamiento de propiedades, integraciones ni reglas de ciclo de vida fuera del alcance mínimo de esta SPEC.

## Notas técnicas

- Reutilizar la ruta y el shell creados para la página placeholder de SPEC-38.
- Revisar `frontend/src/App.tsx` y los componentes de contexto de organización para mantener el límite de acceso existente.
- Reutilizar las convenciones visuales de `frontend/src/pages/ActionSelectionPage.tsx` y de la página placeholder de arreglos para el encabezado, acciones, estados vacíos y controles.
- La fuente de datos debe aplicar el alcance de organización en servidor o en la capa de persistencia, no únicamente mediante filtrado del cliente.
- El modelo de datos debe mantener el conjunto mínimo de campos solicitado: identificador, nombre, estado y la referencia de organización necesaria para el aislamiento.
- La acción `Generar propiedad` puede implementarse como una acción deshabilitada o como una acción enfocada sin handler efectivo, siempre que conserve la etiqueta, la accesibilidad y el carácter inerte contratados.
- Los detalles internos de componentes, catálogo de estados, iconografía y composición son decisiones de implementación mientras se mantengan los requisitos funcionales, de seguridad y de alcance.
- La creación de propiedades o la ampliación del modelo de órdenes debe especificarse por separado.

## Referencias

- `docs/09-roadmap/specs/SPEC-38-gestion-de-arreglos-placeholder-navigation/SPEC-38-gestion-de-arreglos-placeholder-navigation.md` — ruta placeholder, navegación y shell inicial de gestión de arreglos.
- `docs/09-roadmap/specs/SPEC-38-gestion-de-arreglos-placeholder-navigation/IMPLEMENTATION-GUIDE.md` — convenciones de implementación y validación de la ruta existente.
- `docs/09-roadmap/specs/completed/21-SPEC-administrar-contratos-navigation.md` — especificación previa de navegación principal y criterios de aceptación.
- `docs/07-development/engineering-standards.md` — convenciones frontend, backend y de persistencia.
- `frontend/src/App.tsx` — topología actual de rutas y límite de organización.
