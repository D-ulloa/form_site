# SPEC-38 — Gestión de arreglos, navegación principal y página placeholder

- Estado: `pending`
- Fecha: `2026-08-26`
- Prioridad: `medium`
- Autor: `redacted`

## Objetivo

Agregar un cuarto acceso principal a la página de inicio de una organización autenticada y dirigirlo a una página placeholder con alcance por organización para la futura funcionalidad de gestión de arreglos. La página inicial debe permanecer intencionalmente vacía, conservar el lenguaje visual existente e incluir una acción `Inicio` para volver a la página de inicio de la organización.

Este cambio se limita a navegación, routing y shell frontend. No implementa funcionalidad de gestión de arreglos ni requiere cambios en backend, base de datos o servicios externos.

## Contexto

La aplicación necesita un punto de entrada visible para una futura área de gestión de arreglos. Establecer ahora la acción de navegación, la ruta estable y una página placeholder consistente permite preparar el flujo sin definir prematuramente el dominio que se implementará después.

La página debe integrarse con la autenticación, el contexto de organización, el layout, la tipografía, los espaciados y la paleta ya existentes. La ruta no puede convertirse en una vía para omitir los controles actuales de sesión o de acceso a la organización.

## Requisitos funcionales

### Acción `Gestión de arreglos`

- La página principal de una organización autenticada debe mostrar una cuarta acción primaria con la etiqueta exacta `Gestión de arreglos`.
- Debe aparecer después de las tres acciones existentes y conservar este orden:
  1. `Agregar nueva propiedad`
  2. `Generar contrato`
  3. `Administrar contratos`
  4. `Gestión de arreglos`
- Debe reutilizar el patrón de tarjeta o acción primaria existente, incluyendo accesibilidad de teclado y estados de hover/focus visibles.
- Al seleccionarla, debe navegar a la página placeholder con alcance de la organización activa.
- Las tres acciones existentes deben conservar sus etiquetas, posiciones, destinos y comportamiento actuales.

### Ruta placeholder con alcance de organización

- La página debe estar disponible en:

  ```text
  /t/:organizationSlug/arrangements
  ```

- La ruta debe permanecer dentro del límite de rutas existente para organizaciones y tomar la organización desde el contexto de ruta validado.
- Debe aplicar el mismo comportamiento de autenticación y autorización de organización que las demás páginas con alcance de organización.
- La navegación directa no debe omitir las comprobaciones de sesión ni de acceso a la organización.
- Esta primera versión no debe cargar ni mostrar datos, controles o comportamiento de gestión de arreglos.

### Página placeholder

- Debe renderizar el shell visual existente del sitio: fondo, superficies, tipografía, espaciado, bordes, tratamiento de acentos y comportamiento responsive.
- El área de contenido debe permanecer intencionalmente vacía, aparte del shell compartido y la navegación requerida del encabezado.
- No se deben agregar copy temporal, registros simulados, controles falsos ni contenido explicativo no solicitado.
- Debe renderizar correctamente en los tamaños de escritorio y móvil soportados.

### Acción `Inicio`

- El encabezado de la página placeholder debe incluir una acción visible con la etiqueta exacta `Inicio`.
- Al seleccionarla, debe volver a:

  ```text
  /t/:organizationSlug
  ```

- Debe conservar el slug de la organización activa.
- Debe ser enfocable por teclado y tener un nombre accesible que coincida con su etiqueta visible.
- Debe seguir las convenciones de estilo existentes para enlaces o botones del encabezado.

## Flujo y comportamiento esperado

1. El usuario autenticado entra a la página principal de su organización y ve las cuatro acciones en el orden contratado.
2. Selecciona `Gestión de arreglos`.
3. La aplicación valida la sesión y el contexto de organización mediante el límite de rutas existente y muestra la página placeholder en `/t/:organizationSlug/arrangements`.
4. La página muestra el shell visual compartido, un área de contenido vacía y la acción `Inicio` en el encabezado.
5. El usuario selecciona `Inicio` y vuelve a `/t/:organizationSlug` dentro de la misma organización.
6. El botón de volver del navegador continúa funcionando según el comportamiento actual del router; esta SPEC no establece una política nueva de historial.

## Reglas de negocio

- La organización activa siempre debe provenir del contexto de ruta validado; la URL no puede conceder acceso por sí misma.
- La ruta placeholder no crea ni consulta entidades de arreglos.
- No se agrega comportamiento de dominio para arreglos, reparaciones, mantenimiento, órdenes de trabajo o servicios de propiedad.
- Las acciones existentes de la página principal no cambian de etiqueta, orden, estilo, destino ni comportamiento.
- Las etiquetas `Gestión de arreglos` e `Inicio` y las rutas contratadas deben conservarse exactamente.
- No se introducen cambios en permisos más allá de los límites de acceso ya aplicados a las páginas de la organización.

## Validaciones y manejo de errores

- La navegación directa a la ruta placeholder debe pasar por los controles actuales de sesión y organización.
- Un usuario sin sesión o sin acceso debe recibir el comportamiento de rechazo ya establecido por la aplicación, sin una pantalla placeholder que exponga información de otra organización.
- Un slug o contexto de organización inválido debe resolverse con el manejo de rutas existente y no debe renderizar contenido de arreglos.
- La acción `Inicio` debe conservar foco y nombre accesible conforme a las convenciones actuales.
- La página no debe producir overflow ni perder legibilidad en los viewports soportados.
- Las pruebas frontend deben comprobar la nueva navegación, el retorno a la organización correcta, la protección de la ruta y la conservación de las tres acciones existentes.

## Criterios de aceptación

1. La página principal autenticada muestra las cuatro acciones con las etiquetas exactas y el orden definido.
2. Al seleccionar `Gestión de arreglos`, se navega a `/t/:organizationSlug/arrangements` para la organización activa.
3. Las tres acciones existentes conservan sus etiquetas, posiciones, destinos y comportamiento.
4. La ruta de arreglos permanece protegida por el límite existente de autenticación y organización.
5. La página de destino está vacía aparte del shell visual compartido y la navegación del encabezado.
6. La página usa la paleta y el lenguaje visual actuales y permanece consistente con la página principal en los tamaños soportados.
7. El encabezado de destino contiene una acción `Inicio` visible y accesible.
8. Al seleccionar `Inicio`, se navega a `/t/:organizationSlug` y se conserva el contexto de organización activo.
9. El alcance no introduce backend, base de datos, storage, integraciones ni comportamiento del dominio de arreglos.

## Notas técnicas

- Reutilizar la estructura de acciones y convenciones visuales de `frontend/src/pages/ActionSelectionPage.tsx`.
- Agregar la ruta junto a las demás rutas con alcance de organización en `frontend/src/App.tsx`, utilizando el mismo límite de contexto.
- Reutilizar el top bar o shell existente para el encabezado de la página placeholder.
- Un identificador estable de prueba para la nueva acción puede agregarse si coincide con las convenciones actuales del proyecto; no forma parte del contrato visible.
- Los detalles internos de componentes, iconografía y composición son decisiones de implementación mientras se mantengan las etiquetas, destinos, accesibilidad y consistencia visual contratados.
- La futura funcionalidad de gestión de arreglos debe especificarse por separado y no debe inferirse de esta ruta placeholder.

## Referencias

- `docs/09-roadmap/specs/completed/21-SPEC-administrar-contratos-navigation.md` — especificación previa de navegación principal y criterios de aceptación.
- `docs/09-roadmap/specs/completed/22-SPEC-contract-management-ui-and-access-control.md` — estilo previo de navegación y comportamiento de UI.
- `docs/07-development/engineering-standards.md` — convenciones frontend y de documentación.
- `frontend/src/pages/ActionSelectionPage.tsx` — acciones actuales de la página principal y convenciones visuales.
- `frontend/src/App.tsx` — topología actual de rutas y límite de organización.
