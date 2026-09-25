# TASK-47-02 — Búsqueda de propiedades

- Estado: `implemented` (verificado localmente el 2026-09-24; sin migración; despliegue y smoke tests alojados pendientes)
- SPEC: [SPEC-47](./SPEC-47-visibilidad-de-identificadores-y-busqueda-en-arreglos.md)
- Dependencias: contrato de presentación de TASK-47-01; listado de propiedades de SPEC-42.
- Secuencia: después de fijar la forma de consulta y puede avanzar en paralelo con TASK-47-03.

## Resultado

Agregar una búsqueda server-side por nombre en Propiedades para owner, admin y member, con paginación, limpieza, estados de UI y scope de organización intactos.

## Alcance

- Input Buscar propiedades con label, placeholder, limpiar, debounce y estados de carga/error/vacío.
- Parámetro search en el listado de propiedades y cursor ligado al filtro.
- Query key y hook con organización, epoch, colección y texto de búsqueda.
- Búsqueda parcial normalizada, sin consultar ni mostrar IDs.
- Compatibilidad con crear propiedad, seleccionar propiedad, asociar inquilinos e invitaciones.

## Secuencia concreta

1. Definir normalización y límite de search en backend y cliente.
2. Aplicar el filtro dentro del scope de organización antes de paginar.
3. Extender useArrangementCollection y ArrangementPropertiesSection sin duplicar una consulta global.
4. Reiniciar cursor y cancelar respuestas al cambiar la consulta o el contexto.
5. Mostrar mensajes distintos para organización vacía y búsqueda sin coincidencias.
6. Probar roles owner/admin/member/viewer y conservar el acceso de viewer sin barra nueva.

## Criterios de cierre

- Owner, admin y member encuentran propiedades por nombre en todas las páginas autorizadas.
- Limpiar restaura el listado completo y selecciona correctamente una propiedad.
- Una respuesta tardía o cursor cruzado no mezcla búsquedas ni organizaciones.
- No se agrega ID visible para diferenciar propiedades con el mismo nombre.
- Crear y gestionar propiedades conserva su autorización y funcionamiento.

## Evidencia requerida

- Tests de API para search, normalización, paginación, cursor incompatible y scope A/B.
- Tests de componente para debounce, limpiar, carga, vacío, error y selección.
- Browser con varias páginas, nombres Unicode/repetidos, owner/admin/member/viewer y responsive.

## Referencias

- [Guía de implementación](./IMPLEMENTATION-GUIDE.md), secciones 3–5.
- [TASK-47-01 — Ocultamiento de identificadores](./TASK-47-01-ocultamiento-de-identificadores-y-contrato-de-presentacion.md).
