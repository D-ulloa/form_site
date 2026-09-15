# TASK-45-04 — Gestión interna y actualización compartida

- Estado: `implemented` (verificado localmente y migraciones aplicadas en desarrollo el 2026-09-12; despliegue y smoke tests alojados pendientes)
- SPEC: [SPEC-45](./SPEC-45-dashboard-personal-asignacion-y-rechazo-de-arreglos.md)
- Dependencias: contratos de asignación, contacto, estados y señales de TASK-45-01/02; vistas SPEC-43 y dashboard personal de TASK-45-03 para verificación integrada.
- Secuencia: desarrolla controles internos y sincronización; TASK-45-03 consume el mismo mecanismo de actualización.

## Resultado

Permitir que owner/admin/member asignen o rechacen desde Gestión de arreglos y que las sesiones autorizadas reflejen automáticamente el estado confirmado.

## Alcance

- Contacto del solicitante y responsable disponible/no disponible en las órdenes del gestor.
- Selector de personal activo, asignar/reasignar/quitar y confirmación de rechazo; errores recuperables y control de versión.
- Filtro `Rechazadas`, etiqueta `Rechazada` y reapertura sin responsable; preservación de filtros/propiedades/invitaciones existentes.
- Actualización autenticada entre navegadores mediante invalidaciones mínimas y refetch canónico, con reconexión y revocación.
- Compatibilidad de viewer e historial compartido de inquilinos, sin nuevos datos personales para esos lectores.

## Secuencia concreta

1. Agregar controles según capacidades y estado. El selector consulta la API dedicada, no gobernanza; contemplar vacío, homónimos, baja concurrente y conflicto de versión.
2. Conectar respuesta canónica de mutaciones al dashboard del actor. No anunciar éxito antes del commit ni sobrescribir con una versión nueva automáticamente.
3. Actualizar enums/parsers/etiquetas de todos los clientes antes de producir `rejected`. Mantener la acción de archivo y sus transiciones previas.
4. Implementar transporte de la sección 6 de la guía, verificando despliegue entre instancias y scope por audiencia. No exponer filas ni PII en señales.
5. Conectar las tres vistas a invalidación/refetch, limpiar datos revocados y refrescar al recuperar conexión o foco.
6. Probar sesiones separadas de gestor, personal e inquilino, incluidos usuarios con la segunda página ya cargada.

## Criterios de cierre

- Owner/admin/member asignan a un personal activo y ven `En proceso`; ese personal recibe la orden y el inquilino ve el estado automáticamente.
- Rechazar muestra `Rechazada` para el equipo e historial del inquilino y retira la orden del personal, sin perder contenido.
- Reasignar retira al anterior y aparece al nuevo responsable; quitar asignación devuelve `Sin procesar` y retira acceso personal.
- Resolver/archivar desde el control existente también retira asignación y se refleja entre sesiones. Reapertura de rechazo queda sin responsable.
- Viewer conserva lectura previa, sin contacto/selector/acciones; inquilinos ven el estado sin nombres/correos/teléfonos ajenos.
- Las señales y conexiones respetan sesión/organización/membresía/propiedad/asignación. No hay dependencia de un solo proceso HTTP.
- En el entorno sano definido, las sesiones visibles convergen dentro de 2 segundos del commit, medidos en prueba; no se usa recarga manual.
- Desconectar/reconectar, volver a la pestaña o perder eventos recupera datos canónicos. Una respuesta vieja no repone una orden revocada.
- Filtros, pagination, propiedades, invitaciones y formatos responsive previos siguen funcionando.

## Evidencia requerida

- Tests de UI/API para capacidades, transiciones, selección vacía, error, conflicto y respuesta perdida.
- Pruebas de señales autenticadas sin PII, membresía revocada, scope A/B y entrega entre procesos/instancias equivalentes al runtime previsto.
- Browser con sesiones simultáneas y medición de convergencia para asignar/reasignar/rechazar/cerrar, más recuperación offline.

## Referencias

- [Guía de implementación](./IMPLEMENTATION-GUIDE.md), secciones 5–6.
- [TASK-45-03](./TASK-45-03-dashboard-personal-y-archivos.md).
- [TASK-45-05](./TASK-45-05-pruebas-compatibilidad-y-rollout.md).

## Evidencia de entrega

Implementación y checks locales registrados en [pruebas SPEC-45](../../../06-testing/spec45-personal-assignments.md). Las dos migraciones se aplicaron y verificaron en desarrollo `multi-tenant` el 2026-09-12. El despliegue de aplicaciones y los smoke tests alojados siguen pendientes según el [runbook](../../../03-operation/spec45-personal-assignments-runbook.md).
