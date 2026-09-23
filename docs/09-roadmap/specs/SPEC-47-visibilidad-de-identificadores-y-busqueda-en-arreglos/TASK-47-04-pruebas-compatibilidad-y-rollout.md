# TASK-47-04 — Pruebas, compatibilidad y rollout

- Estado: pending
- SPEC: [SPEC-47](./SPEC-47-visibilidad-de-identificadores-y-busqueda-en-arreglos.md)
- Dependencias: TASK-47-01/02/03 integradas; backend, frontend, browser y fixtures de SPEC-39/42/43/44/45.
- Secuencia: preparar fixtures desde el inicio y cerrar solo con consultas reales y revisión de presentación.

## Resultado

Demostrar que los dashboards de arreglos ocultan IDs en todas las audiencias y que owner/admin/member pueden buscar propiedades y órdenes sin romper scope, paginación, acciones ni responsive.

## Alcance

- Tests de API y frontend para search, filtros, cursores y respuestas tardías.
- Fixtures A/B con varias propiedades, miembros, invitaciones, órdenes repetidas y más de una página.
- Browser para owner, admin, member, viewer, inquilino y personal.
- Inspección de DOM, accesibilidad, clipboard, screenshots, consola y URL.
- Compatibilidad con clientes sin search y recuperación sin migración destructiva.

## Matriz mínima

| Caso | Resultado verificable |
| --- | --- |
| Redacción property | Nombre visible; ID de propiedad ausente de DOM, aria y mensajes. |
| Redacción member | Nombre/ocupación visibles; ID de membresía ausente del selector y diálogos. |
| Redacción order | Orden y estado visibles; ID ausente de tarjetas, recibos y confirmaciones. |
| Todos los roles | Owner/admin/member/viewer/inquilino/personal no reciben IDs de dominio en su UI. |
| Propiedades | Búsqueda por nombre, limpieza, Unicode, repetidos, vacío y paginación. |
| Órdenes | Búsqueda por nombre/descripción/propiedad, status, limpieza y paginación. |
| Scope | A no ve resultados de B con search, cursor o respuesta tardía manipulados. |
| Acciones | Crear, asociar, invitar, asignar, rechazar, cambiar estado y assets siguen autorizados. |
| Compatibilidad | Respuesta sin search mantiene listado normal; no se requiere migración. |
| Responsive | Teclado, foco, screen reader, consola limpia y 1280×800/390×844/320×740. |

## Criterios de cierre

- Las pruebas ejercitan endpoint/servicio real y no solo filtros en memoria.
- Se verifica que IDs de fixtures no aparecen en texto renderizado, árbol accesible, atributos, clipboard o mensajes.
- Se prueba scope A/B, organización cambiada, membresía revocada, cursor obsoleto y respuesta tardía.
- Se mantienen verdes las regresiones de SPEC-39/42/43/44/45.
- La documentación distingue checks locales, backend/frontend desplegados y smoke tests alojados.
- La activación puede revertir el filtro a listado sin búsqueda sin restaurar IDs ni cambiar esquema.

## Evidencia requerida

- Comandos, resultados, fixtures, capturas y limitaciones reproducibles.
- Trazabilidad de los 13 criterios de aceptación de SPEC-47 a API, componentes y browser.
- Confirmación explícita de que no hubo migración, cambio de autorización o despliegue implícito.

## Referencias

- [Guía de implementación](./IMPLEMENTATION-GUIDE.md), sección 6.
- [TASK-47-01 — Ocultamiento de identificadores](./TASK-47-01-ocultamiento-de-identificadores-y-contrato-de-presentacion.md).
- [TASK-47-02 — Búsqueda de propiedades](./TASK-47-02-busqueda-de-propiedades.md).
- [TASK-47-03 — Búsqueda de órdenes y vistas de roles](./TASK-47-03-busqueda-de-ordenes-y-vistas-de-roles.md).
