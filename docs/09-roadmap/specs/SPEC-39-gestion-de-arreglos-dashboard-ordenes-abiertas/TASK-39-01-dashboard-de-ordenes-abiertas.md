# TASK-39-01 — Dashboard de órdenes abiertas de gestión de arreglos

- Estado: `implemented`
- SPEC: [`SPEC-39`](./SPEC-39-gestion-de-arreglos-dashboard-ordenes-abiertas.md)
- Dependencias: ruta placeholder de SPEC-38, autenticación, contexto de organización, persistencia con alcance organizacional y convenciones actuales de API/frontend.
- Paralelización: tarea única; el modelo mínimo, la consulta, el dashboard, el filtro y las pruebas se cierran como una unidad.

## Resultado

Reemplazar el placeholder de `/t/:organizationSlug/arrangements` por un dashboard protegido y con alcance por organización que liste órdenes abiertas con nombre, estado e identificador, permita filtrarlas por estado, conserve la acción `Inicio` y muestre una acción `Generar propiedad` sin comportamiento.

## Criterios de cierre

- Un miembro o usuario con cualquier otro estado válido dentro de la organización puede acceder al dashboard mediante los controles existentes.
- La base de datos o capa de persistencia contempla una orden con el conjunto mínimo de identificador, nombre, estado y referencia de organización necesaria para el aislamiento.
- La lista solo muestra órdenes abiertas pertenecientes a la organización activa.
- Cada fila o elemento de la lista muestra nombre, estado e identificador.
- El filtro permite seleccionar un estado disponible y volver a ver todos los estados.
- Los estados vacío, sin resultados y error siguen las convenciones existentes y no exponen datos de otra organización.
- `Generar propiedad` es visible, accesible y no ejecuta ninguna operación, navegación, consulta ni mutación.
- `Inicio` es visible, accesible y vuelve a `/t/:organizationSlug` con el contexto correcto.
- El dashboard mantiene el shell visual y el comportamiento responsive del sitio.
- Se agregan pruebas suficientes para el acceso, aislamiento, lectura, filtrado, acción inerte y navegación de retorno.
- No se agregan funcionalidades de creación de propiedades ni de gestión completa del ciclo de vida de órdenes.

## Evidencia requerida para cierre

- Resultado de las pruebas de persistencia, API y frontend relevantes para el dashboard.
- Evidencia de que un usuario de una organización no puede consultar órdenes de otra organización.
- Evidencia de que el filtro por estado devuelve solamente coincidencias del conjunto autorizado.
- Evidencia de que `Generar propiedad` no dispara navegación, solicitudes ni mutaciones.
- Comprobación en los viewports soportados de que la lista y sus controles no generan overflow y mantienen la consistencia visual.
- Confirmación del diff de que los cambios permanecen dentro del alcance de SPEC-39.

## Evidencia de implementación — 2026-09-10

- Migración aditiva `20260910120000_spec39_arrangement_orders.sql`: solo UUID, organización, nombre y estado; RLS forzado, lectura privilegiada y RPC sin acceso browser.
- API `GET /api/organizations/:organization/arrangements/orders`, con capacidad compartida `arrangements.read`, alcance validado, filtro SQL, paginación UUID y límite distribuido.
- Dashboard con datos persistidos, `Todos`, estados presentes en toda la colección autorizada, vacíos/error/reintento, `Cargar más`, `Inicio` e interacción inerte de `Generar propiedad`.
- Decisión mínima de disponibilidad: `open` e `in_progress`; sin enum cerrado ni transiciones, propiedades, asignaciones, fechas o nuevos atributos. No se insertan fixtures productivas.
- Pruebas: 313 backend y 147 frontend aprobadas; typecheck y builds backend/frontend, lint frontend y comprobación del diff aprobados. Vite mantiene el aviso de tamaño del bundle principal.
- PostgreSQL 16.15: migraciones SPEC-26/39 aplicadas a una base desechable; assertions reales de FK, grants/RLS, A/B, filtro y páginas aprobadas. Solo se simula la tabla de referencia de Auth para ese esquema local.
- Seis pruebas Playwright aprobadas: 1280×800, 390×844, 320×740, navegación directa/recarga, foco visible, filtro por teclado y acción inerte; incluye navegador → API → repositorio → PostgREST 14.18 → PostgreSQL con datos persistidos. Identidad y almacén de límite de tasa controlados en el harness, sin proveedores productivos.
- Comprobación adicional con agent-browser: sin errores de navegador, overlay ni overflow; capturas desktop y móvil revisadas.
- Procedimiento reproducible y límites de la evidencia en [`docs/06-testing/spec39-arrangements.md`](../../../06-testing/spec39-arrangements.md).

## Aplicación de migración en Supabase — 2026-09-11

- Rama verificada con Supabase CLI: `multi-tenant`, referencia `kcobkbtieyowdmsvtsvv`, del proyecto padre `kjnwiwvwuavurbgovmlt`.
- Aplicada únicamente `20260910120000_spec39_arrangement_orders.sql` mediante `supabase db push`, después de un dry run que enumeró solo ese archivo. SHA-256 del archivo: `46b78713ef52c721956fd752b764779413f82764ef77a03899283c554f7d6012`.
- Se usó la conexión de la rama por el pooler en puerto 6543; el puerto 5432 agotó el tiempo de conexión. Las credenciales no se guardaron en el repositorio.
- Un directorio temporal de migraciones excluyó exclusivamente `20260817190000_retire_legacy_contract_webhook.sql`, ya ausente del historial remoto, para no aplicar trabajo ajeno a SPEC-39. No se reparó ni alteró su historial.
- Verificación remota: versión `20260910120000` registrada, cuatro columnas obligatorias, RLS habilitado y forzado, RPC `SECURITY INVOKER`, acceso browser a tabla/RPC denegado y `service_role` con lectura/ejecución sin permisos de escritura. La tabla contiene cero órdenes; no se aplicaron seeds.
- El dry run posterior del mismo conjunto aislado devuelve `upToDate: true`, sin migraciones, seeds ni roles pendientes.

La migración está aplicada en la rama `multi-tenant`. El despliegue de aplicación sigue pendiente; verificar los secretos existentes de plataforma y publicar backend antes del frontend.
