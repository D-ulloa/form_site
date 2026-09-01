# Guía de implementación — SPEC-38

`TASK-38-01` es una tarea única y debe ejecutarse como un flujo frontend completo: primero se reutilizan las convenciones existentes, después se agrega la navegación y la página placeholder, y finalmente se validan el acceso, la navegación y el comportamiento responsive.

## Secuencia

1. Revisar `frontend/src/pages/ActionSelectionPage.tsx` y `frontend/src/App.tsx` para identificar el patrón actual de las acciones, el shell del encabezado y el límite de rutas con alcance de organización.
2. Agregar `Gestión de arreglos` después de las tres acciones existentes, sin modificar sus etiquetas, orden, destinos ni comportamiento.
3. Registrar `/t/:organizationSlug/arrangements` junto a las demás rutas de organización y hacer que use el mismo contexto y controles de sesión/acceso.
4. Crear la página placeholder reutilizando el shell visual actual. Mantener el área de contenido vacía y agregar únicamente la acción `Inicio` requerida.
5. Conectar `Inicio` con `/t/:organizationSlug`, preservando el slug y las convenciones de accesibilidad del encabezado.
6. Agregar o ajustar las pruebas frontend para verificar:
   - las cuatro acciones y su orden;
   - la navegación a la ruta placeholder;
   - la aplicación del límite de autenticación y organización;
   - la ausencia de contenido o consultas de dominio de arreglos;
   - la acción `Inicio` y el retorno al contexto correcto; y
   - la conservación del comportamiento de las tres acciones existentes.
7. Ejecutar las comprobaciones frontend relevantes y revisar la página en los tamaños soportados para detectar overflow, pérdida de foco o divergencias visuales.

## Restricciones de implementación

- No crear endpoints, tablas, migraciones, almacenamiento, integraciones ni modelos de arreglos.
- No introducir copy temporal, datos simulados o controles de producto en la página placeholder.
- No duplicar ni debilitar la lógica existente de autenticación, autorización o selección de organización.
- No cambiar la paleta, tipografía, espaciado ni tratamiento visual establecido por el sitio.
- Si la estructura interna del router o del shell requiere una decisión de diseño, elegir la opción que mantenga la ruta dentro del límite de organización y documentar cualquier excepción en la evidencia de cierre.
