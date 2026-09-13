# Guía de implementación — SPEC-43

Estado del documento: guía aplicada localmente y migración SPEC-43 aplicada/verificada en desarrollo `multi-tenant` (`kcobkbtieyowdmsvtsvv`) el 2026-09-12. [Evidencia de implementación, pruebas y migración](../../../06-testing/spec43-arrangement-requests.md); [runbook de rollout](../../../03-operation/spec43-arrangement-requests-runbook.md). Despliegue de aplicación, pruebas alojadas de Storage y gates de producción pendientes.

Ajustes concretos durante la implementación: se agregó `POST /arrangements/inquilino/order-drafts/:id/cancel` para cancelar bajo lock y devolver un recibo si el envío ya ganó la carrera; el contrato interno completo se solicita con `X-Arrangement-Contract: 2`; el contrato/cursor SPEC-39 se conserva para clientes anteriores. `requestCursor.ts` implementa la nueva tupla y `orderCursor.ts` queda para esa compatibilidad. La proyección del draft devuelve la sesión activa para recuperar respuestas perdidas y cancelar sin crear otro lote. Un draft que tuvo archivos exige un lote verificado aunque el anterior haya sido revocado. El baseline POL-09 adoptado sí fija 24 horas para uploads sin asociar; se usa esa cifra localmente, conservando el gate de aprobación de producción.

La secuencia recomendada es: contrato y persistencia segura → API y vínculo privado de assets → dashboard del inquilino → dashboard interno y cambios de estado → pruebas reales y rollout. `TASK-43-01` fija los contratos que consumen las dos tareas de UI; las tareas de UI pueden prepararse en paralelo una vez acordados sus DTOs.

## Puntos de integración del repositorio

| Área | Código vigente a extender |
| --- | --- |
| Organización/capacidades | `backend/src/organizations/types.ts`, `backend/src/organizations/roleCapabilities.ts`, `frontend/src/features/organizations/types.ts` |
| Contexto y ruta tenant | `backend/src/identity/organizationHome.ts`, `backend/src/identity/identityRepository.ts`, `backend/src/routes/identity.ts`, `frontend/src/app/contexts/OrganizationContext.tsx`, `frontend/src/pages/InquilinoHomePage.tsx` |
| Órdenes/API | `backend/src/arrangements/arrangementOrderRepository.ts`, `backend/src/arrangements/types.ts`, `backend/src/arrangements/orderCursor.ts`, `backend/src/services/listArrangementOrders.ts`, `backend/src/routes/arrangements.ts`, `backend/src/index.ts` |
| Assets/rate limit | `backend/src/assets/types.ts`, `receiverPolicy.ts`, `assetDomain.ts`, `assetRepository.ts`, `assetService.ts`, `storageAdapter.ts`, `backend/src/platform/rateLimit.ts`; las piezas de asset hoy no se montan desde `index.ts` |
| Dashboard | `frontend/src/features/arrangements/types.ts`, `services/arrangementsApi.ts`, `hooks/useArrangementOrders.ts`, `components/ArrangementOrdersDashboard.tsx`; Inicio es `frontend/src/pages/InquilinoHomePage.tsx` |
| Carga UI | `frontend/src/components/ui/FileDropzone.tsx` y límites de `frontend/src/features/properties/utils/uploadLimits.ts`; ambos implementan otra allowlist/cupo y no se comparten sin adaptar |
| Persistencia/evidencia | Migraciones SPEC-39/40/42 y SPEC-31 como base inmutable; añadir migración SPEC-43, `supabase/tests/spec43_setup.sql`, `supabase/tests/spec43_arrangement_requests.sql`, pruebas de `backend/tests/` y `frontend/tests/` |

## Punto de partida comprobado

- SPEC-39 registra `arrangement_orders` con `id`, `organization_id`, `name` y `status`. El RPC `spec39_list_arrangement_orders` expone solo `open` e `in_progress`; el backend y el dashboard llaman el listado de órdenes abiertas.
- El dashboard interno ya usa `arrangements.read` para los cuatro roles internos y presenta el filtro, paginación y la sección de propiedades.
- SPEC-42 agregó `arrangement_properties` y `arrangement_property_id` a la membresía. Una propiedad admite varios inquilinos; cada membresía `inquilino` tiene a lo sumo una propiedad. Su API de propiedades no debe confundirse con el owner de órdenes.
- SPEC-40 registra `InquilinoHomePage` como una pantalla de Inicio vacía y mantiene al inquilino fuera de rutas internas. La proyección pública del contexto omite `arrangement_property_id`, aunque la fila de membresía ya lo tiene; por eso el epoch/cache de frontend actual no detecta por sí solo un cambio de propiedad.
- El registro de capacidades de backend está en versión `5`. La política actual no concede escritura de estados a `member`; esta SPEC agrega una capacidad explícita y limitada.
- SPEC-39 registra que la tabla remota de desarrollo `multi-tenant` tenía cero órdenes al aplicar su migración el 2026-09-11. Repetir el inventario en el destino exacto antes de SPEC-43: el conteo puede haber cambiado y nunca reemplaza la consulta remota actual.
- El árbol tiene tipos, políticas de receptor, repositorio, adaptador Storage y servicio de assets SPEC-31, además de RPC/tablas para sesión e intención. `createAssetService` no está instanciado ni montado en `backend/src/index.ts`: no existen rutas HTTP de inicio/finalización/revocación/vista para esta plataforma ni un authorizer de owner `arrangement_order`.
- La migración SPEC-31 limita owner types y paths a contratos, propiedades, branding y exports; sus categorías tampoco incluyen arreglos. `AssetPrincipalType` representa el tipo de principal y debe seguir siendo `member` para una sesión autenticada: `inquilino` es el rol de la membresía y se autoriza mediante capabilities/owner checks, no como un principal nuevo.
- Los receptores actuales `property.image` y `property.video` permiten hasta 30 imágenes de 10 MB y 10 videos de 100 MB por receptor. La subida legacy de propiedades limita el formulario a 20 archivos/1 GB; el servicio genérico admite 40 descriptores, suma bytes para la reserva de cuota, pero no impone por sí mismo un tope duro agregado de 1 GB. SPEC-43 debe fijar e imponer sus propios máximos de 30/10, 40 combinados y 1 GB por solicitud tanto en servidor como en cliente.
- SPEC-31 sigue marcado como pendiente de prerequisitos/aprobación. Su runbook de 2026-08-19 antecede al contexto/router organizacional actual: hoy se montan los routers de contexto y arreglos, pero no los endpoints HTTP del servicio de assets. POL-09 aún gobierna retención/gracia/base legal y el código no ofrece una política de limpieza lista para activar. No inventar vencimientos, clasificación de retención ni una garantía de escaneo. La carga de SPEC-43 depende de cerrar o aprobar expresamente esas políticas y de configurar/verificar buckets privados.

## Gate de dependencia de assets

La capacidad de adjuntar medios es parte de SPEC-43, no una ampliación opcional del alcance de esta implementación. TASK-43-01 puede desarrollar el enlace sobre los primitives existentes, pero el flujo no se habilita hasta demostrar autorización por owner, asociación SQL explícita, verificación de contenido acorde a la política aprobada, límites efectivos, expiración/limpieza y buckets privados. Si un gate de SPEC-31 (incluido POL-09 o una política de contenido activo/escaneo aplicable) sigue sin resolver, se puede continuar el resto del trabajo localmente, pero no se declara completo ni se despliega SPEC-43 con medios habilitados.

## 1. Capacidades, migración y consultas

Incrementar el registro de capacidades a la versión `6` sin cambiar otras capacidades existentes:

| Capacidad | Roles |
| --- | --- |
| `arrangements.read` | `owner`, `admin`, `member`, `viewer` |
| `arrangements.status.update` | `owner`, `admin`, `member` |
| `inquilino.home.read` | `inquilino` (existente) |
| `inquilino.arrangements.read` | `inquilino` |
| `inquilino.arrangements.create` | `inquilino` |

Actualizar tipos/registros backend y frontend, parser del contexto de organización, errores de autorización y pruebas de rutas. No agregar capacidades internas al conjunto de `inquilino` ni agregar `arrangements.status.update` a `viewer`.

Crear una migración nueva posterior a SPEC-42. Antes de fijar una restricción, consultar la distribución real de `arrangement_orders.status` y el conteo de filas. Aceptar `open` y `in_progress` ya existentes; cualquier valor distinto de `open`, `in_progress`, `solved` o `archived` requiere una decisión explícita de mapeo documentada antes de migrar. No reasignar estados desconocidos silenciosamente.

La evidencia SPEC-39 de cero filas en desarrollo es solo un dato histórico; la migración y el corte deben usar un inventario actual del destino seleccionado. Documentar conteos por estado y resultado de la decisión sin exportar datos personales.

Extender `arrangement_orders` sin tocar la migración SPEC-39. La migración debe soportar:

- `description`, `arrangement_property_id`, `created_by_membership_id`, `created_at`, `submitted_at`, `updated_at`, `version`, `submission_state`, clave de idempotencia y fingerprint de payload;
- FK compuestas por organización para membresía y propiedad;
- una condición que permite filas `legacy` históricas con datos ausentes, pero exige propiedad, autor y descripción válida en todo draft nuevo/enviado;
- valores de estado exactos `open`, `in_progress`, `solved`, `archived`;
- índices para listado de organización/estado/fecha/ID, historial de propiedad/fecha/ID, borradores del autor/estado y claves idempotentes;
- RLS habilitado y forzado, sin privilegios browser directos, y RPC `SECURITY DEFINER` con `search_path` fijo y grants mínimos al rol de servicio;
- eventos permitidos para `arrangement.order_submitted` y `arrangement.order_status_changed`.

Extender `organization_events_event_type_check` en la misma migración hacia adelante, conservando íntegro el allowlist efectivo de SPEC-26/37/40/42 y agregando solo esos dos eventos. Las RPCs de envío y estado escriben evento y cambio de fila dentro de la misma transacción; una repetición idempotente no agrega un segundo evento. No editar migraciones ya aplicadas.

Mantener `name` para la compatibilidad con el contrato viejo. Para una nueva solicitud, el servidor asigna de forma determinística un resumen derivado de la descripción, recortado a 200 caracteres; la descripción original es el contenido canónico. No aceptar `name` del cliente.

Las filas SPEC-39 anteriores se marcan como `legacy`, no reciben propiedad, autor, descripción ni fecha real inventada. El listado interno puede mostrarlas como registros históricos sin fecha/propiedad conocida; el API de inquilino solo consulta filas `submitted` con asociación válida. Archivos, propiedades, actores o fechas no se deducen por texto o proximidad.

## 2. Repositorio y contratos HTTP

Conservar el punto de entrada interno actual y ampliar su consulta/DTO:

```text
GET /api/organizations/:organization/arrangements/orders
    ?status=<open|in_progress|solved|archived>&limit=25&cursor=<cursor-opaco>
PATCH /api/organizations/:organization/arrangements/orders/:orderId/status
```

`GET` requiere `arrangements.read`, scope de organización validado, paginación estable y cursor ligado a UUID de organización, filtro, orden y tamaño. Sin `status` significa todos los estados; un estado fuera del enum devuelve `400`. El listado devuelve solo `submitted` y `legacy`, nunca borradores. La página debe proyectar descripción (nula solo para legacy), resumen compatible, estado, propiedad (ID/nombre si existe), fechas conocidas, versión, identificador y metadatos seguros de archivos. No incluye URL firmada, ruta interna ni identidad del solicitante tenant. Incluir las filas legacy internas con campos desconocidos nulos, sin confundirlas con una solicitud nueva.

`PATCH` requiere `arrangements.status.update`; el body contiene únicamente `status` y `expected_version`. Rechazar estados no permitidos y versiones obsoletas. Derivar actor, organización y membresía de la sesión. El RPC bloquea/revalida la organización y la membresía, actualiza estado/version/fecha e inserta auditoría en una sola transacción.

Usar un cursor opaco autenticado que transporte la tupla de ordenamiento y esté ligado a organización, propiedad (tenant), filtro, tamaño y orden. Actualizar `createOrderCursorCodec` desde el cursor actual UUID-ascendente. El historial tenant ordena por `submitted_at DESC, id DESC`; el listado interno usa la misma tupla con filas legacy de fecha desconocida al final y desempate por ID. Una fecha nula histórica no se sustituye por la fecha de migración.

Agregar endpoints de inquilino separados del endpoint interno para que su scope de propiedad no dependa del filtro del cliente:

```text
GET  /api/organizations/:organization/arrangements/inquilino/orders
POST /api/organizations/:organization/arrangements/inquilino/order-drafts
POST /api/organizations/:organization/arrangements/inquilino/order-drafts/:draftId/submit
```

Estas rutas se montan bajo el router existente `/api/organizations/:organization/arrangements`; usar las rutas tenant como `/arrangements/inquilino/...` para conservar esa convención. Añadir junto al draft:

```text
POST /api/organizations/:organization/arrangements/inquilino/order-drafts/:draftId/assets/sessions
POST /api/organizations/:organization/arrangements/inquilino/order-drafts/:draftId/assets/sessions/:sessionId/finalize
POST /api/organizations/:organization/arrangements/inquilino/order-drafts/:draftId/assets/sessions/:sessionId/revoke
GET  /api/organizations/:organization/arrangements/inquilino/orders/:orderId/assets/:assetId/view
GET  /api/organizations/:organization/arrangements/orders/:orderId/assets/:assetId/view
```

Los endpoints de sesión solo operan sobre un draft propio; no reciben el `owner_type`, capability, actor ni la propiedad. Los dos endpoints de vista comparten una consulta relacional segura, con capabilities separadas según el contexto. Agregar políticas distribuidas para listado tenant, creación/envío, cambio de estado y vista; usar las políticas `asset.*` existentes para cargas solo donde sus claves/scope sean adecuadas y probar el store distribuido.

La lectura requiere `inquilino.arrangements.read`; se filtra por `arrangement_property_id` de la membresía confirmada en cada página. Devuelve órdenes `submitted`, cursor estable, estado, descripción, identificador, fecha y metadatos seguros de archivos. Puede incluir `created_by_you` como booleano; no envía identidad de otros inquilinos.

Cuando el contexto confirmado trae `arrangement_property_id = null`, la página presenta el estado neutral sin pedir historial. El servidor vuelve a comprobarlo en lectura, draft, upload, submit y vista de assets; nunca convierte la ausencia de propiedad en un listado normal vacío ni acepta una propiedad alternativa del cliente.

La creación de draft requiere `inquilino.arrangements.create`, una descripción válida y clave idempotente. La organización, actor y propiedad se derivan del contexto; propiedades adicionales en el body se rechazan. El draft empieza oculto, asociado al actor/membresía/propiedad/fingerprint y vence según política de uploads. La operación de envío exige que el actor sea el creador, valida todas las referencias/assets completados y marca el registro `submitted` con estado inicial `open` y auditoría atómica. Un draft de una membresía o propiedad distinta no se puede enviar.

La clave de creación enlaza organización, membresía y fingerprint: mismo intento/contenido devuelve el mismo draft; misma clave con otro contenido produce conflicto. El submit debe ser idempotente ante doble clic, retry y respuesta perdida: revalidar el draft bloqueado, devolver el recibo ya persistido si fue enviado y no repetir la asociación ni el evento. No aceptar del cliente `asset_id`, propiedad, autor, estado inicial ni lista de identidades; el RPC resuelve los assets desde sesiones/drafts verificados del mismo owner.

Usar la validación de query existente: parámetros repetidos, límites/cursor inválidos, strings vacíos y formatos mal formados devuelven 400; autorización conserva los errores existentes; fallos de dependencia usan `safeErrorEnvelope`; límite de tasa distribuido, CSRF para mutaciones y headers `no-store` siguen las rutas de SPEC-39/42. Además de la validación HTTP, RPCs de inicialización/finalización, envío y cambio de estado revalidan bajo locks organización, membresía activa, owner y propiedad actual donde cambie el estado durable; una comprobación de servicio previa no basta para cerrar una carrera con suspensión o cambio de contexto. No registrar descripción, filename sensible, URL firmada, token ni excepción cruda del proveedor.

## 3. Cargas y lectura de archivos

Extender el servicio de assets de SPEC-31; no crear una carga multipart paralela ni aceptar `storage_path`/`public_path` enviado por navegador.

1. Extender con una migración posterior las restricciones de owner/path/categoría/proyección de SPEC-31, agregar `arrangement_order` y una asociación relacional explícita solicitud–asset con FKs compuestas por organización. Mantener el principal de sesión `member`; el capability y el owner check distinguen al inquilino. Definir categoría, retención y bucket según las políticas aprobadas de SPEC-31.
2. Instanciar y montar el servicio en el backend, añadiendo rutas HTTP protegidas para inicializar sesión en un draft, finalizar/revocar la sesión y pedir una vista temporal. Cada ruta deriva scope, actor y capability de `SessionService.context`; no confía en owner, capability, membership o path de JSON. El authorizer comprueba draft propio, estado, organización, membresía activa y propiedad actual. Finalizar o pedir una URL también vuelve a comprobar el owner.
3. Registrar receptores versionados específicos (`arrangement.image` y `arrangement.video`) para JPEG/PNG/WebP y MP4/WebM/QuickTime. Los máximos son 30 imágenes de 10 MB, 10 videos de 100 MB, 40 elementos combinados y 1 GB total por solicitud. Aplicar cada límite antes de emitir URLs y repetir validaciones al finalizar; el límite agregado requiere una comprobación explícita en el servicio, no solo reservar cuota.
4. La inicialización reserva cuota aprobada y emite intenciones de un solo uso con filename saneado y ruta aleatoria bajo la organización. Los buckets/configuración Storage permanecen privados; IDs de asset/session son referencias, nunca autoridad.
5. Exponer endpoints concretos bajo las rutas de inquilino: inicializar y finalizar/revocar sesiones de un `order-draft`; para leer, endpoints de vista de asset separados por contexto tenant e interno. La respuesta de inicialización devuelve URL firmada solo al caller actual; la UI la conserva en memoria efímera para esa carga.
6. El frontend sube directamente a la URL prefirmada y el submit no recibe rutas ni asset IDs arbitrarios. Si se quita o cancela un archivo durante la sesión, revocar la sesión completa y abrir otra para el conjunto restante; un intento parcial nunca se adjunta.
7. El finalizador inspecciona el objeto real, bytes y tipo detectado, aplica checksum/escaneo únicamente según la política aprobada y mantiene inaccesibles los objetos pendientes, rechazados o en cuarentena. Finalizar una sesión deja assets `verified`; la RPC de envío adjunta en forma atómica solo assets verificados de sesiones del draft, comprueba correspondencia exacta y marca asociaciones/estado `attached`.
8. El envío solo confirma cuando descripción y todos los archivos seleccionados están validados. El fallo conserva un draft reintentable o lo deja vencer bajo la política aprobada; nunca presenta una solicitud completa con una carga fallida silenciosamente.
9. Consultar una solicitud devuelve metadatos seguros. Al pulsar Ver/Descargar, reautorizar solicitud y asset por scope, estado y relación exacta, y emitir URL de vista breve bajo demanda. Internos —incluido `viewer`— requieren `arrangements.read`; tenant requiere `inquilino.arrangements.read` y propiedad actual coincidente. No se requiere `files.read` general.

Las vistas de viewer pertenecen al scope de arreglos, sin otorgar `files.read` general. Una URL firmada no se cachea ni se persiste. Borrar, archivar o revocar acceso nunca se emula con un link público.

## 4. Frontend del inquilino

Reemplazar el `InquilinoHomePage` vacío por una página de solicitudes conservando su header, `Cerrar sesión`, estilos y límite de ruta. No modificar el destino confirmado por servidor ni montar `ActionSelectionPage` para este rol. Extender la proyección de membresía del endpoint de contexto y el tipo frontend para llevar `arrangement_property_id` (nullable); incluirlo en la comparación de autoridad que rota el epoch y limpia queries al cambiar la propiedad.

En `frontend/src/features/arrangements/` o una subcarpeta `tenant/`, separar tipos, API/hooks, formulario y lista para reusar proyecciones seguras sin compartir autorización implícita. El botón `Solicitud de arreglo` abre el formulario con textarea requerido y un control de archivos configurado estrictamente a JPEG/PNG/WebP/MP4/WebM/QuickTime. El `FileDropzone` actual acepta formatos adicionales (GIF, HEIC/HEIF, AVI, entre otros) y usa un límite de 20, así que no se reutiliza sin reducir allowlist y límites. Mostrar progreso, cancelar/revocar antes de enviar, validación, reintento, error de envío y recibo.

Cache keys incluyen UUID de organización, epoch, ID de membresía y `arrangement_property_id`. Consultar solo tras confirmar contexto de inquilino con propiedad. Al cambiar user/organización/membresía/propiedad, cancelar queries, cerrar formulario que pertenece al contexto viejo y eliminar de caché textos, metadatos y URLs previas. No persistir URL firmadas ni en Query Cache duradero; solicitar vista nueva al activar cada archivo.

El historial enumera todas las órdenes `submitted` de la propiedad en orden descendente, incluyendo estados archivados. Distinguir `Tu solicitud` con booleano de servidor; no presentar nombre o correo de otros solicitantes. Cada archivo recibe su URL temporal solo bajo demanda.

Estados de página diferenciados: sin propiedad vinculada, cargando, vacío, historial con más páginas, error inicial, error al continuar, formulario válido, upload en curso, reintento de upload y envío confirmado. La falta de propiedad no se comunica como lista vacía normal.

## 5. Dashboard interno y cambio de estado

Actualizar `ArrangementOrdersDashboard` y sus types/schema/API/hook para consumir todas las solicitudes enviadas. Cambiar la copia “Órdenes abiertas” y las etiquetas que presentaban solo open/in-progress. Conservar la sección `ArrangementPropertiesSection`, permisos y paginación existentes.

El filtro expone siempre `Todos` (`status` omitido), `Sin procesar` (`open`), `En proceso` (`in_progress`), `Solucionado` (`solved`) y `Archivados` (`archived`). No deriva el selector solo de estados presentes en una página, porque debe mostrar los cuatro estados incluso con conteo cero. Al cambiar filtro, reiniciar cursor y no usar resultados viejos como placeholder.

Presentar descripción completa, estado, propiedad y archivos en una tarjeta o detalle accesible. Mantener nombre e ID de propiedad para que el equipo distinga órdenes de diferentes inmuebles. Archivos no se abren automáticamente ni exponen URLs largas.

Comprobar `arrangements.status.update` para renderizar el control de estado. Solo `owner`, `admin`, `member` lo reciben. `viewer` ve la misma información en modo lectura. Guardar estado con `expected_version`; mientras se guarda bloquear envíos duplicados y, si responde conflicto, refrescar el registro y explicar que alguien lo actualizó. Se puede seleccionar cualquiera de los cuatro estados desde cualquiera de los cuatro, incluida reapertura de archived a open.

Tras un cambio, invalidar/refrescar listados filtrados y vistas de detalle del scope actual. No invalidar en otra organización ni elevar automáticamente la lista a la primera página si deja de coincidir con filtro seleccionado; ofrecer comportamiento comprensible.

## 6. Pruebas y evidencia

| Capa | Cobertura mínima |
| --- | --- |
| Capacidades/contexto | Versión 6, inquilino con solo home/read/create, owner/admin/member con status.update, viewer sin mutación; estados de organización/membresía. |
| DB/RPC | FKs compuestas, constraints, RLS/grants, idempotencia, aislamiento A/B, owner por propiedad, solo drafts propios, envío una vez, status/version/auditoría atómicos, reapertura. |
| API | Sin property_id del cliente, sin propiedad/membresía/rol falsos, scope interno y tenant, lista multi-página, filtro/estados vacíos, autorización de assets, errores seguros, rate limit y no-store. |
| Assets | Tipos declarados y detectados, cantidades/tamaños, uploads opcionales, expiración/retry, session reuse/rejection, asset ajeno/no verificado/no asociado, URL temporal, viewer y tenant/property authorization. |
| Frontend tenant | Inicio protegido, botón/textarea, formulario sin archivos y con imágenes/videos, rechazo, progreso/reintento, historial de todos los estados y autores, no exposición de requester, paginación, 401/403, property/context switch y URLs temporales. |
| Frontend interno | Los cuatro roles leen; owner/admin/member cambian todos los estados; viewer read-only; filtro fijo, cero resultados, todos los históricos, descripción/files/property, conflictos de versión, reapertura. |
| Browser/API/DB | Recorrido tenant → upload privado opcional → submit → tenant property history → internal dashboard → status change/archive/reopen, contra Postgres desechable con respuesta persistida. |

Agregar pruebas de contrato de migración y SQL real bajo nombres SPEC-43, más cobertura frontend/API focalizada. No aceptar solo pruebas que inspeccionan texto SQL para acreditar aislamiento, atomicidad o grants. No enviar archivos o invitaciones reales en las pruebas.

Ejecutar comprobaciones después de completar cambios; comandos base desde la raíz:

```bash
npm --prefix backend test
npm --prefix backend run typecheck
npm --prefix backend run build
npm --prefix frontend test
npm --prefix frontend run lint
npm --prefix frontend run build
npm --prefix frontend run test:e2e -- tests/e2e/inquilino-arrangements.spec.ts tests/e2e/arrangements-navigation.spec.ts
psql "$SPEC43_TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/spec43_setup.sql
psql "$SPEC43_TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/spec43_arrangement_requests.sql
git diff --check
```

El setup SQL debe rechazar una base no desechable/no vacía y aplicar únicamente las migraciones dependientes necesarias (SPEC-26/27/28/31/39/40/42 y SPEC-43); no copiar una prueba de contrato SQL como sustituto de RPCs bajo roles reales. Crear el setup antes de ejecutar el archivo de assertions.

Verificar los viewports `1280×800`, `390×844` y `320×740`, teclado/foco, consola, scroll horizontal y que no haya URL/path de Storage en la interfaz. Registrar entorno, resultados y limitaciones en `docs/06-testing/spec43-arrangement-requests.md`, enlazado por TASK-43-04.

## 7. Orden de rollout y recuperación

1. Revalidar estado de despliegue de SPEC-39/40/42 y completar los gates relevantes de SPEC-31. Hoy sus tareas previas registran despliegue de aplicación pendiente; confirmar versión alojada en vez de asumirlo. Comparar historial de migraciones remoto con el local y listar exactamente las pendientes; no incluir migraciones ajenas.
2. Inventariar conteos y estados distintos de `arrangement_orders`. Resolver valores desconocidos con un mapeo aprobado antes de imponer la restricción; no inventar propiedad/autor/fecha para filas legacy.
3. Aplicar migración aditiva primero en un entorno desechable. Ejecutar SQL, RLS, RPC, permisos y carga real; verificar datos/rollback allí. No activar uploads si falta asociación privada, política de retención/limpieza aprobada, configuración privada de Storage o verificación de contenido exigida por SPEC-31.
4. Desplegar backend compatible con ambos dashboards y capacidades nuevas; después frontend tenant/internal. Mantener el dashboard interno de lectura funcionando mientras el cliente nuevo se despliega.
5. Ejecutar un smoke test con una propiedad/inquilino de prueba, sin archivos reales sensibles o con media sintética permitida: creación, lectura de ambas vistas, cambio, archivo, reapertura y rechazo cross-tenant.
6. Registrar versión de esquema/backend/frontend y evidencia remota por separado de tests locales. No marcar SPEC/tareas como implementadas o desplegadas antes de los gates relevantes.
7. La recuperación puede detener nuevas cargas/cambios, pero debe preservar órdenes, asociaciones y assets. No revertir una migración aplicada ni borrar registros para volver a la aplicación previa. Si la versión anterior no reconoce el nuevo estado, servir una versión backend compatible antes de reabrir escrituras.

## Tareas

- [TASK-43-01 — Persistencia, permisos, APIs y asociación de archivos](./TASK-43-01-persistencia-api-y-assets.md): secciones 1–3.
- [TASK-43-02 — Inicio del inquilino y envío](./TASK-43-02-dashboard-inquilino-y-solicitud.md): secciones 4 y 6.
- [TASK-43-03 — Dashboard interno y estados](./TASK-43-03-dashboard-interno-y-estados.md): secciones 5 y 6.
- [TASK-43-04 — Pruebas, compatibilidad y rollout](./TASK-43-04-pruebas-compatibilidad-y-rollout.md): secciones 6 y 7.
