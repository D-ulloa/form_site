# Guía de implementación — SPEC-39

`TASK-39-01` es una tarea de extremo a extremo para reemplazar la página placeholder de gestión de arreglos por un dashboard mínimo de órdenes. Debe conservar el límite de organización de SPEC-38, introducir solo el modelo y la lectura necesarios, y cerrar con validaciones de acceso, aislamiento, filtrado y comportamiento inerte de la acción preparada.

## Secuencia

1. Revisar la ruta, el shell y la página placeholder creados para SPEC-38, junto con los mecanismos actuales de autenticación, autorización y contexto de organización.
2. Revisar las convenciones existentes de persistencia, consultas con alcance de organización, respuestas de API, estados de carga, estados vacíos y manejo de errores.
3. Definir la representación mínima persistida de una orden con identificador, nombre, estado y la referencia necesaria a la organización. No agregar atributos de dominio no requeridos.
4. Agregar la lectura de órdenes abiertas con alcance obligatorio a la organización activa, manteniendo el filtro de aislamiento en la fuente de datos o en el servidor.
5. Reemplazar el contenido placeholder por el dashboard, mostrando para cada orden únicamente nombre, estado e identificador y reutilizando el shell visual existente.
6. Agregar el control de filtro por estado, incluyendo la opción para ver todos los estados disponibles, sin mutar datos ni perder el contexto de organización.
7. Agregar la acción visible `Generar propiedad` con comportamiento inerte: no debe navegar, llamar servicios, crear registros ni generar efectos secundarios.
8. Mantener la acción `Inicio` y conectarla con `/t/:organizationSlug`, conservando las convenciones de accesibilidad y navegación existentes.
9. Agregar o ajustar las pruebas frontend, de API y de persistencia necesarias para verificar:
   - el acceso de miembros y otros estados válidos de usuario;
   - el rechazo de usuarios sin sesión o sin acceso;
   - el aislamiento entre organizaciones;
   - la lista mínima de órdenes;
   - el filtrado por estado;
   - los estados vacío, sin resultados y error;
   - la ausencia de efectos al seleccionar `Generar propiedad`; y
   - el retorno a la organización correcta mediante `Inicio`.
10. Ejecutar las comprobaciones relevantes y revisar la página en los viewports soportados para detectar overflow, pérdida de foco o divergencias visuales.

## Restricciones de implementación

- Mantener la ruta `/t/:organizationSlug/arrangements` dentro del límite de autenticación y organización existente.
- No permitir que el cliente seleccione una organización distinta de la validada por el contexto de ruta.
- No filtrar órdenes de otra organización después de cargarlas; la consulta debe nacer con el alcance correcto.
- No agregar creación, edición, eliminación, cierre, asignación ni detalle de órdenes.
- No crear propiedades ni conectar la acción `Generar propiedad` a un endpoint, navegación, formulario o integración.
- No agregar campos de orden más allá del identificador, nombre, estado y referencia de aislamiento organizacional necesaria.
- No introducir datos simulados en producción ni copy temporal que no esté contratado por esta SPEC.
- No duplicar ni debilitar la lógica existente de autenticación, autorización o selección de organización.
- No cambiar la paleta, tipografía, espaciado ni tratamiento visual establecido por el sitio.
- Si el sistema actual requiere una decisión sobre el catálogo de estados, documentarla en la evidencia de cierre sin convertirla en una ampliación del dominio.
