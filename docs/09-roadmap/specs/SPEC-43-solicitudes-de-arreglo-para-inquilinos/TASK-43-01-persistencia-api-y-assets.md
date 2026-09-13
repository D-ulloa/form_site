# TASK-43-01 — Persistencia, permisos, APIs y asociación de archivos

- Estado: `in_progress`
- SPEC: [SPEC-43](./SPEC-43-solicitudes-de-arreglo-para-inquilinos.md)
- Dependencias: SPEC-39/40/42 y los primitives de SPEC-31. SPEC-31 aún está en estado pendiente de prerequisitos/aprobación; retención POL-09, asociación del owner, autorización HTTP y limpieza de uploads son gates explícitos antes de habilitar medios.
- Paralelización: fija schema, capacidades y DTOs requeridos por TASK-43-02 y TASK-43-03; la UI puede avanzar con mocks de contrato revisados, pero el cierre requiere este contrato integrado.

## Resultado

Permitir crear, enviar, consultar y cambiar solicitudes con persistencia y autorización de servidor. La organización, membresía, propiedad y actor siempre provienen del contexto validado; assets y órdenes comparten el scope de organización y la propiedad correspondiente.

## Alcance

- Migración aditiva de `arrangement_orders`, borradores, descripción, propiedad, autor, fechas/versionado, idempotencia, estados y relación con assets.
- Inventario previo de filas y estados legacy; restricciones nuevas sin asignar propiedad, autor o fecha por inferencia.
- Capacidades versión 6: lectura/creación exclusiva del inquilino y actualización de estado para `owner`, `admin`, `member`; `viewer` read-only.
- RPCs/repositorios paginados para historial de propiedad y dashboard de organización, cambio optimista/auditado de estado y envío idempotente.
- Extensión hacia adelante de checks de owner/path/categoría de SPEC-31, asociación explícita solicitud–asset y receptores versionados privados. Mantener principal autenticado `member`; `inquilino` se comprueba como rol/capability de membership.
- Montaje real de `createAssetService` detrás de rutas HTTP protegidas para iniciar, finalizar, revocar y solicitar vista; hoy existen primitives de servicio/repositorio/adapter, pero no esas rutas en `backend/src/index.ts`.
- Verificación/limpieza privada por política SPEC-31 aprobada, límites de SPEC-43 aplicados en servidor (incluido 1 GB agregado) y autorización de adjuntos por relación exacta con orden/propiedad.
- Rutas HTTP, validación, límite de tasa, errores seguros y contrato DTO para ambas interfaces.

## Criterios de cierre

- Una solicitud nueva exige descripción válida, propiedad y membership compatibles de la misma organización, y actor activo `inquilino` con esa propiedad.
- El contexto confirmado expone `arrangement_property_id` nullable a la UI y su cambio rota el epoch/limpia datos de la propiedad anterior; el browser no proporciona el valor como autoridad.
- El servidor ignora o rechaza `organization_id`, `property_id`, `membership_id`, `user_id`, rol, status inicial y autor enviados por browser.
- La idempotencia evita duplicados concurrentes y rechaza la misma clave con fingerprint distinto.
- Las consultas internas contienen los cuatro estados y todas las propiedades de una organización. Las consultas de inquilino filtran en SQL/RPC a la propiedad de su membership y nunca aceptan otra propiedad del cliente.
- Las filas legacy permanecen legibles internamente con campos no disponibles nulos; no se retornan al historial tenant ni se modifican por inferencia.
- Solo `owner`, `admin` y `member` pueden cambiar `status`; `expected_version` y auditoría se procesan atómicamente. `archived` vuelve a `open` mediante la ruta autorizada.
- Las cargas de assets usan owner `arrangement_order`, política privada, verificación y autorización exacta. Assets sin verificar, de otro orden o de otro scope no se pueden adjuntar ni leer.
- La autorización de carga mantiene `AssetPrincipalType='member'`; se demuestra con una membresía `inquilino` autorizada por capability/owner, sin crear un principal de plataforma nuevo para el rol.
- La carga no se habilita hasta contar con políticas aprobadas de retención/limpieza/escaneo aplicables, un bucket privado configurado y un camino de API integrado; los endpoints no exponen `files.read` general.
- Browser no puede leer tabla/RPC directamente; RLS/grants, IDs ajenos, cursor y organización se prueban en base real.
- Ninguna API registra descripción, URLs firmadas o paths de storage; las respuestas privadas conservan `no-store` y errores seguros.

## Evidencia requerida

- Tests de servicio/HTTP para matriz de rol/estado, scope A/B, propiedad, cursores, filtro, idempotencia, conflictos de versión y rechazo de payloads manipulados.
- Setup guardado de base desechable y test de migración/RPC en `supabase/tests/spec43_setup.sql` y `supabase/tests/spec43_arrangement_requests.sql`, con roles browser y RPCs reales.
- Pruebas de cargas verificadas y autorización de assets para inquilino y viewer, incluyendo URLs de vista de corta duración.
- Contratos de API y errores enlazados desde la documentación de pruebas de SPEC-43.

## Referencias

- [Guía de implementación](./IMPLEMENTATION-GUIDE.md), secciones 1–3.
- [TASK-43-02](./TASK-43-02-dashboard-inquilino-y-solicitud.md).
- [TASK-43-03](./TASK-43-03-dashboard-interno-y-estados.md).

## Implementación local — 2026-09-12

Código y validación local implementados. [Evidencia y comandos](../../../06-testing/spec43-arrangement-requests.md); [runbook de despliegue](../../../03-operation/spec43-arrangement-requests-runbook.md). El cierre remoto y los gates SPEC-31/POL-09 siguen pendientes; no se declara despliegue ni certificación del proveedor.

Migración `20260912140000_spec43_arrangement_requests.sql` aplicada y verificada el 2026-09-12 en la rama de desarrollo `multi-tenant` (`kcobkbtieyowdmsvtsvv`). Historial, esquema, permisos, RLS y configuración privada del bucket verificados; conteos de datos preservados. El despliegue de aplicación y las pruebas alojadas de Storage siguen pendientes; véase el informe enlazado.
