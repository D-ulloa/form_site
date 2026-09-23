# TASK-47-03 — Búsqueda de órdenes y vistas de roles

- Estado: pending
- SPEC: [SPEC-47](./SPEC-47-visibilidad-de-identificadores-y-busqueda-en-arreglos.md)
- Dependencias: contrato de presentación de TASK-47-01; listado/estados de SPEC-43; asignación y vistas compartidas de SPEC-45; TASK-47-02 para consistencia de búsqueda.
- Secuencia: después de estabilizar el contrato server-side; puede desarrollarse en paralelo con TASK-47-02.

## Resultado

Agregar búsqueda por nombre, descripción o propiedad a las órdenes de owner, admin y member, y verificar que viewer, inquilino y personal mantengan su alcance con los IDs ocultos.

## Alcance

- Input Buscar órdenes junto al filtro de estado, con limpieza y estados de carga/error/vacío.
- Parámetro search en la consulta paginada de órdenes.
- Combinación AND entre texto y status, con cursor y cache ligados a ambos.
- Mensajes, confirmaciones y diálogos sin ID de orden, propiedad o miembro.
- Regresión de asignar, reasignar, quitar, rechazar, cambiar estado, abrir assets y actualización entre sesiones.

## Secuencia concreta

1. Extender listArrangementOrders y useArrangementOrders con search, sin cambiar las mutaciones.
2. Implementar el filtro server-side sobre nombre, descripción y nombre de propiedad, con scope y status aplicados antes de paginar.
3. Montar la barra solo para owner/admin/member; no otorgar búsqueda al viewer, inquilino o personal.
4. Quitar el ID del contexto del diálogo de asignación/rechazo y del mensaje de envío tenant.
5. Probar respuesta tardía, segunda página, limpieza, cambio de organización y reconexión.
6. Revisar que las invalidaciones de SPEC-45 no pierdan ni mezclen el texto de búsqueda vigente.

## Criterios de cierre

- Owner, admin y member encuentran órdenes en cualquier página por los campos contratados.
- Search y status no se sobrescriben ni se pierden al paginar o actualizar.
- Viewer conserva lectura previa sin barra de búsqueda nueva y sin IDs visibles.
- Personal e inquilino no reciben una ampliación de consulta ni muestran IDs en tarjetas/recibos.
- Las acciones existentes continúan enviando IDs internos y pasan sus guards.
- Las actualizaciones compartidas, errores y reconexiones conservan el filtro o lo reinician de forma explícita y segura.

## Evidencia requerida

- Tests API/servicio para combinación search-status, scope A/B, cursor, consulta inválida y paginación.
- Tests de componente/browser para roles, mutaciones, DOM accesible y mensajes.
- Browser con órdenes repetidas, más de una página, personal/inquilino simultáneos, reconexión y los tres viewports.

## Referencias

- [Guía de implementación](./IMPLEMENTATION-GUIDE.md), secciones 3–6.
- [TASK-47-01 — Ocultamiento de identificadores](./TASK-47-01-ocultamiento-de-identificadores-y-contrato-de-presentacion.md).
- [TASK-47-02 — Búsqueda de propiedades](./TASK-47-02-busqueda-de-propiedades.md).
