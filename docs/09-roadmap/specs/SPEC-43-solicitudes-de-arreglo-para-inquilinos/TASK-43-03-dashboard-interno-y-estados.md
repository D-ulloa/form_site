# TASK-43-03 — Dashboard interno y ciclo de estados

- Estado: `in_progress`
- SPEC: [SPEC-43](./SPEC-43-solicitudes-de-arreglo-para-inquilinos.md)
- Dependencias: TASK-43-01 para consultas/capacidades/API; dashboard y propiedades de SPEC-39/42.
- Paralelización: puede desarrollarse en paralelo con TASK-43-02 una vez estabilizados los contratos de TASK-43-01.

## Resultado

Ampliar `Gestión de arreglos` para que el equipo interno consulte solicitudes de todas las propiedades, vea descripciones y archivos, y gestione sus estados según su rol.

## Alcance

- Listado completo y paginado de solicitudes enviadas, cuatro estados y filtro con opciones fijas.
- Mostrar descripción, estado, ID, propiedad (nombre e ID), fecha disponible y archivos verificados.
- Mantener filas legacy sin propiedad como histórico interno con sus datos desconocidos marcados, sin inferir ni exponerlas al inquilino.
- Controles de estado para `owner`, `admin` y `member`; lectura de los mismos datos y adjuntos para `viewer`.
- Guardado con `expected_version`, conflicto recuperable, invalidación del cache del contexto y auditoría de cambios.
- Conservar sección `Propiedades`, permisos de SPEC-42, navegación, shell, estados vacíos/errores y responsividad.

## Criterios de cierre

- El filtro siempre ofrece `Todos`, `Sin procesar`, `En proceso`, `Solucionado` y `Archivados`, mapeados a valores estables de dominio.
- `Todos` incluye `open`, `in_progress`, `solved` y `archived`; no se limita a las primeras páginas o a los estados visibles en fixtures.
- Los cuatro roles internos leen solo la organización activa y ven detalle/adjuntos solo mediante autorización de arreglos.
- Owner/admin/member cambian estado entre los cuatro valores, incluso archived → open; viewer no recibe control y la API rechaza su mutación directa.
- Dos cambios concurrentes no se pisan: una versión obsoleta recibe conflicto y la interfaz ofrece actualizar.
- Los cambios de estado no modifican descripción o archivos, y dejan auditoría sin contenido privado.
- Propiedades y acciones de SPEC-42 siguen funcionando y no quedan afectadas por el filtro de órdenes.
- Los errores iniciales, continuación, filtro vacío y actualización conflictiva se distinguen de un listado vacío normal.

## Evidencia requerida

- Pruebas de componente/API para roles y etiquetas de estado, filtro estable, propiedades, assets, carga/error/conflicto y reapertura.
- Recorrido contra API y base real: orden visible, cambio a cada estado, filtro y reapertura desde archived.
- Pruebas browser en tamaños soportados, keyboard/focus, enlaces temporales bajo demanda, consola y overflow.

## Referencias

- [Guía de implementación](./IMPLEMENTATION-GUIDE.md), sección 5.
- [TASK-43-01](./TASK-43-01-persistencia-api-y-assets.md).
- [TASK-43-04](./TASK-43-04-pruebas-compatibilidad-y-rollout.md).

## Implementación local — 2026-09-12

Código y validación local implementados. [Evidencia y comandos](../../../06-testing/spec43-arrangement-requests.md); [runbook de despliegue](../../../03-operation/spec43-arrangement-requests-runbook.md). El cierre remoto y los gates SPEC-31/POL-09 siguen pendientes; no se declara despliegue ni certificación del proveedor.
