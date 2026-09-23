# Guía de implementación — SPEC-47

Estado: pending; documento de planificación. No acredita implementación, migración aplicada ni despliegue. Esta SPEC no requiere cambios de esquema: amplía consultas de lectura y corrige la presentación del frontend.

## 1. Punto de partida y secuencia

| Área | Punto de partida |
| --- | --- |
| Dashboard interno | ArrangementOrdersDashboard muestra órdenes, estado, propiedades y controles por audiencia. |
| Propiedades | ArrangementPropertiesSection lista propiedades y ArrangementPropertyPanel gestiona miembros e invitaciones. |
| Tarjetas | ArrangementRequestCard se reutiliza para manager, viewer, inquilino y personal. |
| Consultas | useArrangementOrders y useArrangementCollection usan TanStack Query, cursores y scope de organización. |
| Contratos | arrangementsApi, arrangementPropertiesApi y arrangementRequestsApi validan DTOs con IDs técnicos. |
| Autorización | SPEC-39/42/43/44/45 ya definen capacidades, contexto y filtros server-side. |

Orden de entrega:

1. [TASK-47-01](./TASK-47-01-ocultamiento-de-identificadores-y-contrato-de-presentacion.md) inventaría cada render de ID, separa datos operativos de texto mostrado y actualiza todas las audiencias.
2. [TASK-47-02](./TASK-47-02-busqueda-de-propiedades.md) agrega el filtro de nombre de propiedad, paginación y estados de UI.
3. [TASK-47-03](./TASK-47-03-busqueda-de-ordenes-y-vistas-de-roles.md) agrega la búsqueda de órdenes, su combinación con status y la regresión de manager/viewer/tenant/personal.
4. [TASK-47-04](./TASK-47-04-pruebas-compatibilidad-y-rollout.md) cierra pruebas, documentación y activación.

No comenzar por retirar campos de los DTOs. Primero identificar qué IDs son necesarios para acciones y cache, y luego eliminar únicamente sus usos de presentación.

## 2. Inventario de presentación y redacción

| Superficie | Uso actual a revisar | Resultado requerido |
| --- | --- | --- |
| ArrangementPropertiesSection | Imprime property.id debajo del nombre. | Mostrar solo nombre, estados y acciones autorizadas. |
| ArrangementPropertyPanel | Imprime property.id en el encabezado del diálogo. | Mostrar nombre de la propiedad sin su ID. |
| ArrangementPropertyPanel | Usa member.id e invitation.id como claves y argumentos. | Conservar uso técnico; no interpolarlos en texto, labels o atributos accesibles. |
| ArrangementRequestCard | Imprime property.id y order.id. | Mostrar nombre de propiedad y contenido de la orden sin IDs. |
| ArrangementAssignmentControls | Imprime order.id en el diálogo y assignee.id en la opción del selector. | Mostrar contexto por nombre, ocupación y estado disponible. |
| InquilinoArrangements | Imprime el ID recibido en el mensaje de solicitud enviada. | Confirmar envío sin incluir el identificador. |
| PersonalArrangements | Reutiliza ArrangementRequestCard. | Heredar la redacción y conservar el scope asignado. |
| Ordenes internas | Usa order.id como key, en rutas de mutación y en IDs HTML derivados. | Es válido mientras no aparezca en texto, aria, title, data-* o URL visible. |

La revisión debe usar pruebas de texto renderizado y del árbol accesible. No basta con que el ID no sea visible por CSS: no debe estar en el contenido de un elemento ni en una propiedad que un lector de pantalla o herramienta de inspección pueda presentar como información de dominio.

Separar los modelos con una convención explícita:

- Identidad operativa: order.id, property.id, membership.id, invitation.id, asset.id y version. Se conserva para llamadas autorizadas, claves y reconciliación.
- Presentación: property.name, order.name/description, assignee.name, occupation, status, dates y labels. Solo estos datos forman el texto de producto.
- Contexto técnico: IDs de elementos HTML generados por el componente. No deben reutilizar identificadores de dominio.

## 3. Contrato de búsqueda y backend

Agregar search como parámetro opcional a:

- GET /api/organizations/:organization/arrangements/properties.
- GET /api/organizations/:organization/arrangements/orders.

Reglas del parámetro:

1. Aceptar texto UTF-8, trim, normalización Unicode y un límite razonable, por ejemplo 100 caracteres.
2. Tratar vacío como ausencia de filtro.
3. Buscar propiedades por name y órdenes por name, description y property.name.
4. No incluir IDs en el predicado de búsqueda ni aceptar una opción de búsqueda por ID.
5. Aplicar organización, rol, audiencia, membresía y capacidades antes del filtro y de la paginación.
6. Ligar el cursor firmado a organización, audiencia, membresía si aplica, status, search y limit.
7. Mantener un orden estable; los IDs pueden usarse como desempate interno sin devolverse como texto nuevo.

La API puede conservar los IDs en la respuesta porque las acciones de asignar, rechazar, cambiar estado, abrir archivos y gestionar invitaciones los requieren. Si se crean view models frontend, marcar explícitamente qué campos son operativos para evitar su interpolación accidental.

No agregar migración por esta SPEC. Si la estrategia de búsqueda requiere un índice nuevo, documentarlo como cambio aditivo de rendimiento y conservar el contrato de rollback; no modificar migraciones anteriores.

## 4. Hook, cache y comportamiento de búsqueda

- Extender useArrangementCollection con un valor search para properties. El valor debe formar parte de tenantQueryKey junto con organización, epoch y colección.
- Extender useArrangementOrders con search. La clave debe incluir search, status, membresía y rol/audiencia.
- Debounce de 250–350 ms, AbortSignal por consulta y cancelación al cambiar organización, sesión, rol o membresía.
- Al cambiar search o status, reiniciar cursor y páginas. No reutilizar un cursor generado con otro filtro.
- Mantener resultados previos solo si el estado visual indica que se están actualizando; una respuesta tardía nunca puede reemplazar la consulta vigente.
- Evitar una consulta de búsqueda para viewer, inquilino o personal si la SPEC no la habilita. Esos componentes solo reciben la redacción de presentación.
- Los mensajes de carga, vacío y error deben referirse a propiedades u órdenes, no a IDs técnicos.

Para órdenes, el servidor combina search y status. Para propiedades, search se aplica al listado general. El panel de una propiedad conserva sus listados de inquilinos e invitaciones sin añadir búsqueda de miembros en esta entrega.

## 5. UX, autorización y accesibilidad

En ArrangementOrdersDashboard:

- Mostrar Buscar órdenes para owner/admin/member junto al filtro de estado.
- No montar el campo para viewer; conservar el filtro de estado existente si su capacidad lo permite.
- Mantener Propiedades y su barra Buscar propiedades para owner/admin/member.
- Mantener Generar propiedad, asignación, rechazo, archivos, invitaciones y cambio de estado según capacidades actuales.

En las vistas de inquilino y personal:

- No agregar búsqueda.
- Retirar IDs de tarjetas y confirmaciones sin reducir el contenido autorizado.
- Mantener los controles de archivos, solicitud y actualización compartida.

El input debe tener label visible o asociado, foco visible, botón Limpiar accesible y estado de resultados anunciable sin producir ruido por cada tecla. En móvil, los controles pueden apilarse; no usar el ID como ayuda para diferenciar tarjetas.

Las consultas siguen siendo de lectura autorizada. No confiar en que ocultar el ID evita acceso: cada endpoint y mutación conserva sus guards, RLS, CSRF/origen y errores seguros.

## 6. Verificación, rollout y recuperación

Checks base después de implementar:

    npm --prefix backend test
    npm --prefix backend run typecheck
    npm --prefix backend run build
    npm --prefix frontend test
    npm --prefix frontend run lint
    npm --prefix frontend run build
    npm --prefix frontend run test:e2e -- tests/e2e/arrangements-navigation.spec.ts tests/e2e/arrangements-database.spec.ts tests/e2e/inquilino-arrangements.spec.ts tests/e2e/personal-assignments.spec.ts
    git diff --check

Matriz mínima:

- Owner, admin, member y viewer en una organización con propiedades y órdenes repetidas.
- Personal e inquilino con tarjetas, confirmaciones y archivos autorizados.
- Propiedades en páginas múltiples, búsqueda vacía, coincidencia parcial, Unicode, limpieza y resultado sin coincidencias.
- Órdenes en páginas múltiples, combinación de búsqueda y status, consulta larga, limpieza y cursor obsoleto.
- Scope A/B, organización cambiada, respuesta tardía, sesión revocada y error de red.
- Inspección de DOM y accesibilidad para detectar IDs de propiedad, miembro, invitación y orden en texto, aria, title, data-* y clipboard.
- Acciones de crear/seleccionar propiedad, asociar/invitar, asignar/rechazar, cambiar estado y abrir asset después de ocultar los IDs.
- Consola limpia, teclado/foco y viewports 1280×800, 390×844 y 320×740.

Rollout:

1. Entregar primero frontend y backend capaces de tolerar search ausente para no romper clientes existentes.
2. Activar el filtro server-side y después la barra para roles owner/admin/member.
3. Verificar con datos de más de una página y dos organizaciones que el filtro no sea local ni cruce scope.
4. Revisar screenshots y snapshots accesibles sin IDs antes de marcar la SPEC como lista.
5. Registrar por separado checks locales, cambios de API, configuración, despliegue y smoke tests alojados.

La recuperación puede deshabilitar search y dejar el listado sin filtro, siempre que el frontend tolere la respuesta anterior. Si hubiera que revertir la UI, no se debe restaurar la impresión de IDs: conservar la redacción como requisito de privacidad. No hay downgrade de esquema en esta SPEC.

## Restricciones de implementación

- No reemplazar autorización por ocultación de IDs.
- No eliminar IDs del contrato técnico si una mutación o consulta autorizada los necesita.
- No interpolar IDs en cadenas visibles, accesibles, URLs de usuario, clipboard, logs de frontend o telemetría.
- No hacer búsqueda exclusivamente en el cliente sobre la página ya descargada.
- No ampliar el scope de viewer, inquilino o personal.
- No cambiar estados, asignaciones, archivos, propiedades, invitaciones ni migraciones aplicadas.
