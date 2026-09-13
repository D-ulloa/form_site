# TASK-43-04 — Pruebas, compatibilidad y rollout

- Estado: `in_progress`
- SPEC: [SPEC-43](./SPEC-43-solicitudes-de-arreglo-para-inquilinos.md)
- Dependencias: TASK-43-01, TASK-43-02 y TASK-43-03; entorno PostgreSQL/Supabase desechable y entorno de browser. El despliegue de medios además depende de cerrar los gates de SPEC-31/POL-09 y verificar el estado alojado real de SPEC-39/40/42.
- Paralelización: pueden prepararse fixtures y harnesses temprano; el cierre exige el flujo completo integrado.

## Resultado

Demostrar con evidencia reproducible que el inquilino crea/consulta solicitudes privadas de su propiedad, la organización las gestiona en scope y los archivos/estados respetan los permisos acordados. Separar evidencia local de cualquier gate remoto.

## Alcance

- Fixtures A/B con propiedades cruzadas, dos inquilinos por propiedad, órdenes legacy, todos los roles y los cuatro estados.
- Pruebas reales de FKs, RLS/grants, scope, cursores, filtro, creación opcional de archivos, idempotencia concurrente, atomicidad y auditoría.
- Recorrido navegador → API → assets → RPC/repositorio → PostgreSQL para tenant y equipo interno.
- Regresión de rutas/rol SPEC-40, invitaciones/asociación SPEC-42, dashboard/filtro/propiedades SPEC-39, capacidades antiguas y autenticación.
- Documento `docs/06-testing/spec43-arrangement-requests.md` con comandos, resultados, entorno, capturas y límites.
- Revisión del inventario/mapeo de estados legacy, guía de migración y rollback compatible, y checklist de despliegue.
- Setup SQL `spec43_setup.sql` que se niega a instalar fixtures sobre una base no vacía/no desechable, más assertions reales bajo roles browser y de servicio.
- Gate de SPEC-31: bucket privado, ruta/owner/association verificados, retención y cleanup aprobados, límites/receptores efectivos y contenido permitido/verificación según política; sin esos resultados, no se habilita la carga de medios ni se cierra SPEC-43.
- Verificación del contexto público de membership: `arrangement_property_id` cambia la autoridad/epoch y hace desaparecer de UI/cache datos o URLs de la propiedad anterior.

## Matriz mínima

| Caso | Resultado verificable |
| --- | --- |
| Inquilino de A crea solicitud | Orden queda en propiedad vinculada de A, `open`, sin aceptar una propiedad del body. |
| Dos inquilinos de una propiedad | Ambos ven el historial compartido; cada uno distingue solo sus propias filas sin ver identidad ajena. |
| Inquilino de A consulta B | Rechazo seguro sin filas, assets, propiedad ni metadatos de B. |
| Sin propiedad o membresía suspendida/removida | No se crea ni consulta; no se reutiliza contexto cacheado. |
| Envío sin archivos | Orden visible una vez con auditoría, fecha y estado inicial. |
| Envío con media | Solo media autorizada/verificada queda adjunta; URL view es temporal y scope-bound. |
| Owner/admin/member | Lee y cambia estados; archiva y reabre a `open`; audit/version actualizadas. |
| Viewer | Lee solicitudes y adjuntos del scope; mutación rechazada aunque llame directamente la API. |
| Cursor, filtro y páginas | Todos los estados disponibles se listan sin duplicar, cruzar organización ni perder filas archive. |
| Legacy/estado desconocido | Histórico sin asociación inferida; desconocidos bloquean el corte hasta tener mapeo explícito. |
| Retry, carrera y error parcial | No hay solicitudes/eventos duplicados; draft/assets fallidos no aparecen como orden enviada. |
| Cambio de contexto o respuesta tardía | No vuelven a renderizarse descripción, archivos ni URL firmada de una organización anterior. |

## Criterios de cierre

- La matriz se ejecuta con servicios/RPC reales en PostgreSQL/Supabase desechable; un mock de sesión siempre autorizada no acredita denegaciones.
- Los tests browser verifican las páginas de inquilino e interno en `1280×800`, `390×844` y `320×740`, teclado, foco, consola y overflow.
- Los cambios de SPEC-39/40/42 se prueban como regresión y las capacidades actuales no se reducen accidentalmente.
- Se ejecutan los comandos generales y focalizados de la guía; toda limitación de entorno o aviso de build se registra.
- La migración remota se aplica solo después de comparar historial y tener inventario de datos; despliegue backend precede al frontend.
- La migración remota incluye únicamente cambios SPEC-43 después de comparar historial; si la base destino conserva estados desconocidos, el rollout espera una decisión de mapeo registrada.
- Los uploads se habilitan solo cuando los gates dependientes de SPEC-31 y POL-09 están aprobados y verificados en el entorno; la existencia de `assetService` o pruebas unitarias no acredita ese gate.
- Esquema, versión de app y smoke test alojado se documentan por separado. Ninguna ejecución pendiente se marca como hecha por tener los documentos redactados.
- La recuperación deshabilita escrituras si hace falta, preserva filas/assets y evita rollback destructivo de migraciones aplicadas.

## Evidencia requerida

- Salidas reproducibles y capturas en `docs/06-testing/spec43-arrangement-requests.md`.
- Referencias a tests de persistencia/API/frontend/browser para cada criterio de SPEC-43.
- Conteos/estados legacy agregados sin credenciales o datos personales; decisión explícita para cualquier estado a mapear.
- Versiones de esquema/backend/frontend y resultado alojado solo cuando efectivamente se ejecute el rollout.

## Referencias

- [Guía de implementación](./IMPLEMENTATION-GUIDE.md), secciones 6–7.
- [TASK-43-01](./TASK-43-01-persistencia-api-y-assets.md).
- [TASK-43-02](./TASK-43-02-dashboard-inquilino-y-solicitud.md).
- [TASK-43-03](./TASK-43-03-dashboard-interno-y-estados.md).

## Implementación local — 2026-09-12

Código y validación local implementados. [Evidencia y comandos](../../../06-testing/spec43-arrangement-requests.md); [runbook de despliegue](../../../03-operation/spec43-arrangement-requests-runbook.md). El cierre remoto y los gates SPEC-31/POL-09 siguen pendientes; no se declara despliegue ni certificación del proveedor.

Migración de desarrollo aplicada el 2026-09-12 en `multi-tenant` (`kcobkbtieyowdmsvtsvv`): solo SPEC-43 después de las 40 versiones existentes, sin fixtures ni cambios en conteos. Verificaciones de esquema/permisos/bucket aprobadas y dry-run final sin pendientes en el conjunto aislado. El informe enlazado conserva la evidencia separada del despliegue y smoke test de aplicación, todavía pendientes.
