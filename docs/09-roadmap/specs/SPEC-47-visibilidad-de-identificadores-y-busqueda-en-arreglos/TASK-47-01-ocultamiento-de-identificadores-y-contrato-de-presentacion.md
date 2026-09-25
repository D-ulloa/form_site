# TASK-47-01 — Ocultamiento de identificadores y contrato de presentación

- Estado: `implemented` (verificado localmente el 2026-09-24; sin migración; despliegue y smoke tests alojados pendientes)
- SPEC: [SPEC-47](./SPEC-47-visibilidad-de-identificadores-y-busqueda-en-arreglos.md)
- Dependencias: componentes de arreglos de SPEC-39/42/43 y controles de asignación de SPEC-45.
- Secuencia: primero; define la frontera entre datos operativos y texto de producto.

## Resultado

Eliminar la representación visual y accesible de IDs de propiedades, miembros, invitaciones y órdenes en todas las vistas de arreglos, conservando los valores internos necesarios para acciones autorizadas.

## Alcance

- Inventario de todos los usos de IDs en tarjetas, secciones, diálogos, selectores, mensajes y confirmaciones.
- Redacción de ArrangementRequestCard, ArrangementPropertiesSection, ArrangementPropertyPanel, ArrangementAssignmentControls, InquilinoArrangements y PersonalArrangements.
- DTO/view model o convenciones de componente que impidan interpolar IDs operativos en texto.
- Pruebas de DOM, accesibilidad, clipboard y mensajes para owner, admin, member, viewer, inquilino y personal.

## Secuencia concreta

1. Buscar usos de order.id, property.id, member.id, membership.id e invitation.id en JSX, labels, errores, toasts, URLs y contenido copiado.
2. Clasificar cada uso como operación interna, key de React, identificación HTML o presentación; solo la última categoría se elimina y las identificaciones HTML no deben reutilizar IDs de dominio.
3. Quitar el ID de la tarjeta, el panel de propiedad, el selector de personal, el diálogo de rechazo/asignación y el recibo de solicitud enviada.
4. Sustituir el contexto textual por nombre, ocupación, estado, fecha o una frase neutral que no confirme un identificador.
5. Verificar el árbol accesible y el texto completo renderizado, no solamente la apariencia visual.
6. Mantener las mutaciones y las claves de cache funcionando con los IDs internos.

## Criterios de cierre

- No hay ID de dominio en texto, aria-label, title, tooltip, data-* o clipboard de ninguna vista de arreglos.
- Las acciones de propiedad, invitación, asociación, asignación, estado, rechazo y assets siguen funcionando.
- Personal e inquilino conservan el alcance actual y no reciben datos adicionales.
- Las respuestas de error no exponen IDs ni cursores técnicos.
- Los tests identifican al menos un fixture de propiedad, miembro, invitación y orden que no aparece en el DOM accesible.

## Evidencia requerida

- Test de componentes o browser por cada superficie compartida.
- Inspección de texto visible y árbol accesible en los seis roles/superficies.
- Prueba de regresión de mutaciones con IDs internos y de cambio de organización.

## Referencias

- [Guía de implementación](./IMPLEMENTATION-GUIDE.md), sección 2.
- [TASK-47-03 — Búsqueda de órdenes y vistas de roles](./TASK-47-03-busqueda-de-ordenes-y-vistas-de-roles.md).
