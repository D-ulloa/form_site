# Guía de implementación — SPEC-39

Fecha del plan y ejecución local: `2026-09-10`. Estado: implementado y verificado localmente. La secuencia siguiente conserva el plan de trabajo; la evidencia final y el estado del despliegue están en [`TASK-39-01`](./TASK-39-01-dashboard-de-ordenes-abiertas.md) y el [procedimiento de verificación](../../../06-testing/spec39-arrangements.md).

[`TASK-39-01`](./TASK-39-01-dashboard-de-ordenes-abiertas.md) se mantiene como una tarea única de extremo a extremo. La secuencia es persistencia → API protegida → consulta frontend → dashboard → evidencia. Las decisiones siguientes concretan la [SPEC-39](./SPEC-39-gestion-de-arreglos-dashboard-ordenes-abiertas.md) sobre el código actual.

## Punto de partida comprobado

- `frontend/src/App.tsx` ya registra `arrangements` dentro de `OrganizationRouteBoundary`. No hace falta crear otra ruta ni otro mecanismo de autenticación.
- `frontend/src/pages/ArrangementsPage.tsx` contiene el shell, el encabezado y `Inicio`; toma el slug de `useOrganization()`. Solo su `<main>` está vacío.
- `frontend/src/pages/ActionSelectionPage.tsx` ya incluye `Gestión de arreglos` como cuarta acción.
- `OrganizationRouteBoundary` espera el contexto confirmado, cancela consultas al cambiar de organización y asigna un `epoch`. `tenantQueryKey` permite separar las consultas por UUID y época del contexto.
- No hay una tabla, un repositorio ni un endpoint de órdenes de arreglos. Los contratos y el dominio de propiedades no son una fuente alternativa de órdenes.
- `SessionService.context`, `OrganizationScope`, `assertRowsInOrganization`, el cliente de servicio de plataforma y los errores seguros son los puntos de reutilización del backend.
- Las pruebas `ArrangementsNavigation.test.tsx` y `arrangements-navigation.spec.ts` exigen un `<main>` vacío, cero botones y ninguna consulta de arreglos. Esas expectativas del placeholder deben actualizarse; las de navegación y acceso siguen vigentes.

## Decisiones propuestas

### Disponibilidad y estados mínimos

Como no existe un ciclo de vida previo, usar provisionalmente `open` e `in_progress` como los dos estados consultables de una orden abierta. `open` será el valor inicial de fixtures y el valor por defecto de persistencia. Estos nombres son una decisión de implementación propuesta, no un catálogo definitivo impuesto por la SPEC.

Guardar `status` como texto no vacío, sin enum de PostgreSQL ni motor de transiciones. La lectura SQL debe incluir explícitamente solo esos dos valores; un valor desconocido o terminal no se considera abierto por omisión. El predicado de disponibilidad tendrá una sola definición en la consulta SQL. Las opciones visibles provienen de los valores realmente presentes en las órdenes autorizadas, no de una lista frontend fija.

No crear datos de demostración en la migración ni un endpoint para generar fixtures. La base de producción vacía mostrará el estado vacío hasta que exista una fuente de carga autorizada en otro alcance.

### Acceso y compatibilidad

Mantener la ruta bajo el límite existente y resolver cada lectura HTTP mediante `sessions.context(request, organizationParam, 'arrangements.read')`. Construir `OrganizationScope` únicamente con `context.organization.id`.

Agregar `arrangements.read` al tipo de capacidad y al registro compartido de `backend/src/organizations/types.ts` y `roleCapabilities.ts`, para los cuatro roles actuales (`owner`, `admin`, `member`, `viewer`). Actualizar el tipo frontend de capacidades, la versión del registro y sus pruebas. Todos esos roles con membresía y organización activas deben poder leer; no exigir administración de contratos ni permiso de escritura. No introducir una matriz paralela de roles. Las sesiones inválidas y las membresías suspendidas, removidas o ajenas siguen siendo rechazadas por el servicio compartido.

El estado de membresía y el estado de organización son conceptos diferentes: el endpoint actual de contexto puede resolver organizaciones `suspended` o `pending_deletion` sin otorgar capacidades de datos. Reutilizar `hasOrganizationCapability` evita convertir ese contexto en autorización de lectura: la nueva capacidad queda denegada en esos estados por las reglas ya existentes. Conservar la resolución del shell y mostrar el rechazo de acceso a datos cuando corresponda. El frontend debe comprobar la capacidad confirmada antes de montar la consulta, y la API comprobarla independientemente. No modificar las reglas de suspensión, baja, lectura de organización o exportación.

SPEC-40 todavía está pendiente y define que `inquilino` no puede acceder a arreglos. No implementarlo aquí ni otorgarle `arrangements.read` cuando exista. Si se integra antes o durante SPEC-39, reutilizar su control central de acceso tanto en esta ruta como en la API y agregar el caso de rechazo; una redirección frontend por sí sola no protege los datos.

### Lectura paginada y filtro

Aplicar el filtro de estado en SQL y paginar con orden estable por UUID ascendente. Esto respeta las consultas acotadas de los estándares sin agregar `created_at` al modelo. Propuesta: 25 elementos por página, máximo 100, consultando un elemento adicional para detectar continuación.

El catálogo `available_statuses` debe calcularse sobre todas las órdenes abiertas de la organización, antes del filtro elegido y del cursor. Así, seleccionar un estado o llegar a otra página no oculta las demás opciones. Un estado válido como texto pero sin coincidencias devuelve una lista vacía; nunca amplía la consulta a todos los estados.

## 1. Persistencia y repositorio

Agregar una migración nueva `supabase/migrations/<timestamp>_spec39_arrangement_orders.sql`, con timestamp posterior a las migraciones existentes. No editar las de SPEC-38; el número SPEC-38 también identifica trabajo histórico de Make ajeno a este dashboard.

La tabla propuesta es `public.arrangement_orders`:

| Columna | Contrato |
|---|---|
| `id` | UUID, clave primaria, `gen_random_uuid()` |
| `organization_id` | UUID obligatorio, FK a `public.organizations(id)`, borrado restringido |
| `name` | Texto obligatorio, no vacío después de trim; límite propuesto de 200 caracteres |
| `status` | Texto obligatorio, no vacío después de trim; límite propuesto de 64 caracteres; default `open` |

Agregar `unique (id, organization_id)` e índices con organización primero para las lecturas `(organization_id, id)` y `(organization_id, status, id)`. Habilitar y forzar RLS; revocar acceso a `PUBLIC`, `anon` y `authenticated`. Dar a `service_role` únicamente los permisos que requiera la lectura. Las fixtures se insertan con el usuario de preparación de la base de pruebas.

Implementar una RPC de lectura `spec39_list_arrangement_orders` con UUID organizacional obligatorio, estado opcional, UUID de continuación opcional y límite acotado. Usar una sola consulta para devolver la página y los estados disponibles bajo el mismo snapshot. La organización debe formar parte de todos los predicados, incluidos los del catálogo de estados.

Preferir `SECURITY INVOKER` para esta lectura con `service_role`; fijar un search path seguro, calificar objetos con `public` y restringir `EXECUTE` a `service_role`. La RPC recibe el alcance ya validado por el servidor: el navegador nunca la invoca directamente.

Agregar `backend/src/arrangements/types.ts` y `arrangementOrderRepository.ts`. La interfaz solo necesita `listOpen(scope, query)`. Obtener el cliente exclusivamente de `createPlatformServiceRoleClient`, validar el UUID organizacional del resultado y ejecutar `assertRowsInOrganization` sobre cada fila antes de proyectarla. Un fallo de RPC, una respuesta malformada o una fila de otra organización falla la respuesta completa; no descartar silenciosamente la fila incorrecta ni convertir el fallo en `[]`.

## 2. Contrato HTTP y servicio

Crear `backend/src/routes/arrangements.ts` con router de parámetros heredados e inyección del servicio de sesión y del servicio de órdenes para pruebas. Montarlo en `backend/src/index.ts` junto a las rutas de organización:

```text
GET /api/organizations/:organization/arrangements/orders
    ?status=<valor>&limit=25&cursor=<cursor-opaco>
```

El segmento puede ser slug o UUID, como permite el resolver actual. El frontend usará el UUID confirmado. Omitir `status` significa `Todos`; no enviar la etiqueta de interfaz como valor de dominio. Rechazar parámetros repetidos, tipos inválidos, longitudes excesivas, límites fuera de rango y cursores inválidos. No aceptar un `organization_id` alternativo en query o body.

Respuesta pública:

```ts
interface ArrangementOrdersPage {
  organization_id: string;
  items: Array<{ id: string; name: string; status: string }>;
  available_statuses: string[];
  next_cursor: string | null;
}
```

`organization_id` es metadato para comprobar el contexto; no es una columna visible del listado. Los campos internos de alcance por fila no se serializan como datos de dominio adicionales.

Agregar `backend/src/services/listArrangementOrders.ts` para coordinar validación de consulta, cursor, repositorio y proyección. Usar un cursor firmado ligado al UUID organizacional, el filtro exacto, el orden, el tamaño de página y la versión del criterio de disponibilidad. Reutilizar `PLATFORM_CURSOR_SECRET` y el patrón de firma de `backend/src/platform/cursor.ts` en un pequeño `backend/src/arrangements/orderCursor.ts` con payload basado en UUID. El codec actual exige `created_at`: no inventar una fecha ni agregar una columna solo para reutilizarlo. No cambiar el formato de los cursores existentes.

Agregar una política de lectura `arrangements.orders.read` al registro distribuido de `backend/src/platform/rateLimit.ts` (propuesta inicial: 120 solicitudes por minuto por organización/miembro). Consumirla después de autenticar y autorizar, antes de consultar órdenes, usando el almacén compartido y `PLATFORM_RATE_LIMIT_PEPPER`; no crear un contador local. Esta clave identifica un límite de tasa y es independiente de la capacidad `arrangements.read`.

Conservar `IdentityAccessError` y su HTTP de rechazo. Validaciones HTTP producen 400; fallos de dependencia usan `safeErrorEnvelope`; el límite produce 429 con `Retry-After`. Respuestas y errores llevan las cabeceras privadas existentes, incluido `Cache-Control: no-store`. No registrar nombres de órdenes, credenciales ni errores crudos de Supabase.

## 3. Cliente y estado de consulta

Agregar en `frontend/src/features/arrangements/`:

- `types.ts`: la proyección pública de orden y página.
- `services/arrangementsApi.ts`: GET con Axios, `withCredentials`, prefijo DEV/`/_/backend`, parámetros y `AbortSignal`; verificar el `organization_id` retornado y la forma de los datos antes de aceptarlos.
- `hooks/useArrangementOrders.ts`: consulta paginada con TanStack Query y `tenantQueryKey(organization.id, epoch, 'arrangements', 'orders', { status, limit })`; cada página recibe su cursor desde esa consulta.
- `components/ArrangementOrdersDashboard.tsx`: controles y estados de presentación, dejando el shell en la página.

Obtener organización y época exclusivamente de `useOrganization()`. No volver a solicitar la sesión desde el dashboard. Consumir la señal de cancelación y no usar datos de la organización o filtro anteriores como `placeholderData`. Reiniciar estado seleccionado y paginación al cambiar UUID/época; una instancia del dashboard con key de ambos valores permite hacerlo sin un segundo contexto.

El filtro vive en memoria y empieza en `Todos`; no escribir preferencias, URL ni almacenamiento local. Al cambiarlo se muestra la primera página de la consulta correspondiente. Un botón `Cargar más` permite alcanzar el resto sin descargar silenciosamente una colección ilimitada. Las opciones siempre incluyen `Todos` y los estados devueltos por el servidor. Si un estado seleccionado desaparece tras una recarga, conservarlo como selección para mostrar su vacío específico hasta que el usuario lo cambie.

No reintentar 400/401/403/404. Ante pérdida de acceso, retirar los datos y cancelar/eliminar las consultas de arreglos del contexto afectado. Para 401, refrescar la autenticación y usar el destino de login; para 403/404, usar el retorno a `/` del límite existente, de modo que una nueva entrada valide otra vez el contexto. No seguir mostrando una página previamente autorizada desde caché. Para errores de carga usar `AlertInline` y una acción explícita de reintento. Si falla la primera página, no mostrar un vacío normal. Si falla `Cargar más` o una recarga, identificar claramente que la lista está incompleta o desactualizada.

## 4. Dashboard y accesibilidad

Mantener el encabezado y `Inicio` en `ArrangementsPage.tsx`; el destino sigue siendo `/t/${organization.slug}` tomado del contexto confirmado. Agregar en el contenido el título `Gestión de arreglos`, el listado de órdenes abiertas y los controles principales.

Usar `Select` con etiqueta `Filtrar por estado`, opción `Todos` de valor vacío y opciones derivadas de `available_statuses`. Renderizar únicamente nombre, estado e identificador completo por orden; las traducciones de etiqueta, si se usan, no cambian el valor almacenado ni el enviado al filtro. Reutilizar superficies, tipografía y clases existentes. Una lista semántica con filas que se apilan en móvil evita necesitar una tabla ancha. Permitir el ajuste de nombres largos, estados y UUID sin ocultar información esencial.

Implementar `Generar propiedad` como `Button type="button"`, con nombre exacto, sin `onClick`, sin enlace y sin formulario contenedor. Mantenerlo enfocable y agregar el mismo foco visible que usa `Inicio`. No usar `disabled` nativo en esta propuesta porque se quiere verificar el acceso por teclado. No agregar toast, modal, analytics ni invalidación de consultas al activarlo.

Estados distinguibles:

| Situación | Presentación propuesta |
|---|---|
| Cargando | `Cargando órdenes…`, con anuncio de estado |
| Sin órdenes abiertas | `No hay órdenes abiertas en esta organización.` |
| Filtro sin coincidencias | `No hay órdenes abiertas con este estado.` y filtro conservado |
| Error inicial | Alerta de error y reintento, sin presentarlo como lista vacía |
| Error de continuación/recarga | Alerta que explica que los resultados no están completos/actualizados |

Mantener `Inicio`, el filtro y `Generar propiedad` disponibles durante los estados normales de carga, vacío y error de datos.

## 5. Pruebas y evidencia de aceptación

| Capa | Archivo propuesto o existente | Casos necesarios |
|---|---|---|
| Repositorio/servicio | `backend/tests/unit/spec39-arrangement-orders.test.ts` | Alcance obligatorio, afirmación de filas retornadas, proyección mínima, validación, cursor firmado y ligado a organización/filtro, error seguro |
| Autorización | `backend/tests/unit/spec26-organization-governance.test.ts` | Capacidad para los cuatro roles en organización activa; denegación por suspensión/baja de membresía u organización; versión del registro y capacidades anteriores preservadas |
| API | `backend/tests/integration/arrangements-routes.test.ts` | Roles actuales, sesión inválida/expirada, membresía no activa/ajena, organización sin capacidad efectiva, slug inválido, rechazo antes de leer órdenes, UUID resuelto en servidor, filtro SQL, límite de tasa y cabeceras privadas |
| Migración | `backend/tests/integration/spec39-migration-contract.test.ts` | Cuatro columnas, FK, índices, RLS, grants y restricciones de RPC; solo evidencia estructural |
| Base real | `supabase/tests/spec39_arrangement_orders.sql` | Aplicar la migración en base desechable, insertar fixtures A/B, probar restricciones y denegación de roles browser, y ejecutar la lectura real con alcance A y B |
| Frontend | `frontend/tests/integration/ArrangementsDashboard.test.tsx` | Proyección, valores de filtro, catálogo completo, paginación, vacíos/error, cancelación, cambio de organización y respuestas tardías; ausencia de consulta sin capacidad y limpieza de datos tras 401/403/404 |
| Navegación | `frontend/tests/integration/ArrangementsNavigation.test.tsx` | Actualizar solo las expectativas del placeholder; conservar cuarta acción, rutas anteriores, sesión/contexto, slug confirmado e `Inicio` |
| Navegador | `frontend/tests/e2e/arrangements-navigation.spec.ts` | Sustituir las comprobaciones de shell vacío por dashboard; navegación directa/recarga, teclado, foco, red y overflow |

Actualizar `frontend/tests/fixtures/organizations.ts` con la capacidad de lectura correspondiente. Usar fixtures con dos organizaciones, UUID persistidos distintos, nombres repetidos, ambos estados abiertos y al menos un estado excluido como `closed`. Incluir más de una página y colocar un estado únicamente fuera de la primera página: debe aparecer igualmente en el selector. Verificar recorrido completo sin duplicados y rechazo de un cursor de otra organización o filtro. Insertar fixtures solo en pruebas y limpiar mediante transacción/rollback o teardown propio.

Las pruebas de acceso HTTP deben usar el `SessionService` real con repositorio de identidad controlado para los casos de autorización; un mock de `sessions.context` que siempre permite acceso no acredita el rechazo. Para persistencia, probar tanto que la lectura A excluye filas/estados de B como que un usuario solo miembro de A no obtiene datos llamando al endpoint de B. RLS protege contra el navegador; el aislamiento del cliente privilegiado depende además del alcance explícito y sus afirmaciones.

Para `Generar propiedad`, esperar primero que termine la carga y registrar solicitudes, URL y estado antes de activarlo. Probar click, Enter y Space: no debe haber solicitudes adicionales, navegación, cambios de lista/filtro, creación de registros ni aparición de formularios. Para el filtro, comprobar selección mediante teclado y foco visible.

Ejecutar el navegador en los tamaños ya cubiertos: `1280×800`, `390×844` y `320×740`, con nombres/estados largos. Conservar screenshots, ausencia de errores de consola y comprobación de `scrollWidth <= innerWidth`. Las pruebas de navegador con respuestas interceptadas acreditan UI; agregar un recorrido contra la API/base desechable para acreditar los datos persistidos y el aislamiento completo.

Comandos de cierre desde la raíz, después de implementar:

```bash
npm --prefix backend test
npm --prefix backend run typecheck
npm --prefix backend run build
npm --prefix frontend test
npm --prefix frontend run lint
npm --prefix frontend run build
npm --prefix frontend run test:e2e -- tests/e2e/arrangements-navigation.spec.ts
```

El repositorio actual no tiene un ejecutor de pruebas PostgreSQL reales. Preparar la base Supabase desechable y documentar el comando de ejecución del SQL nuevo, por ejemplo `psql "$SPEC39_TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/spec39_arrangement_orders.sql`, una vez aplicadas las migraciones. No sustituir esa evidencia por tests que solo inspeccionan el texto SQL ni marcar el aislamiento real como comprobado si falta ese entorno.

## 6. Entrega y orden de activación

1. Completar migración, repositorio, consulta protegida y pruebas de base/API.
2. Completar hook, dashboard y adaptación de las pruebas existentes de SPEC-38.
3. Validar todo el recorrido y actualizar `docs/05-integrations/api-contracts.md`, `docs/06-testing/testing-strategy.md` y la configuración operativa relevante. Registrar el criterio provisional de órdenes abiertas, la ausencia de carga productiva en esta SPEC y los secretos de plataforma que usa la lectura.
4. Aplicar la migración antes de desplegar el endpoint; desplegar backend antes que el frontend que lo consume. Comprobar `PLATFORM_CURSOR_SECRET`, `PLATFORM_RATE_LIMIT_PEPPER` y la disponibilidad de la persistencia del limitador. No requiere un proveedor externo nuevo.
5. Registrar evidencia en `TASK-39-01` y cambiar estados solo tras satisfacer los criterios de cierre. Ante rollback, restaurar la versión anterior de aplicación y conservar la migración/datos; no eliminar órdenes ni modificar migraciones aplicadas.

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
