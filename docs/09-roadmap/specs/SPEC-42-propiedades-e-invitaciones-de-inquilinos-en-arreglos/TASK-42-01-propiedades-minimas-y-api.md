# TASK-42-01 — Propiedades mínimas, permisos y API del dashboard

- Estado: `implemented` — verificado localmente y migraciones aplicadas a la rama Supabase de desarrollo `multi-tenant` el 2026-09-12; despliegue de la aplicación pendiente.
- SPEC: [SPEC-42](./SPEC-42-propiedades-e-invitaciones-de-inquilinos-en-arreglos.md)
- Dependencias: dashboard/API de SPEC-39, contexto de organización y capacidades actuales, estándares de persistencia de la plataforma.
- Paralelización: fija el modelo y los contratos consumidos por `TASK-42-02` y `TASK-42-03`; esas tareas pueden preparar adaptadores y UI con contratos acordados.

## Resultado

Persistir y consultar propiedades independientes de Gestión de arreglos con ID automático y nombre manual. Un propietario o administrador puede crearlas con una operación idempotente; los roles internos autorizados pueden leer ID/nombre dentro de su organización.

## Alcance

- Tabla `arrangement_properties` o equivalente independiente del dominio de SPEC-30.
- ID generado por servidor/base de datos, nombre recortado de 1 a 200 caracteres y metadatos técnicos de organización, autoría e idempotencia.
- FK organizacionales, RLS forzado, grants mínimos, auditoría atómica e índices según consultas reales.
- Capacidades de creación/gestión de SPEC-42 y actualización del registro/versiones/tipos correspondientes.
- Servicio/repositorio con `OrganizationScope`, creación idempotente y listado paginado.
- Endpoints de lectura y creación bajo `/api/organizations/:organization/arrangements/properties`.
- Validación server-side, CSRF/origen, límites distribuidos y errores seguros.

## Criterios de cierre

- `owner` y `admin` activos en una organización activa crean una propiedad con solo el nombre como dato de producto.
- ID, organización, actor y permisos provienen de autoridades del servidor; el cuerpo no los controla.
- El nombre se valida antes de efectos de dominio y admite duplicados intencionales con IDs distintos.
- Una clave de idempotencia repetida con el mismo fingerprint devuelve el mismo registro; contenido distinto con esa clave produce conflicto.
- Dos solicitudes concurrentes del mismo intento no crean dos propiedades ni duplican su auditoría.
- El listado devuelve ID/nombre y cursor acotado de la organización validada. No incluye datos de miembros o invitaciones.
- `member` y `viewer` leen propiedades pero no pueden crearlas; `inquilino` no puede llamar estas APIs.
- Las comprobaciones de contexto siguen siendo válidas dentro de la transacción ante suspensión/cambio de rol concurrentes.
- Acceso browser directo a tabla/RPC está denegado y los IDs ajenos no revelan datos de otra organización.
- Crear una propiedad no invoca Auth, contratos, órdenes, assets, formularios de propiedad completa ni integraciones externas.
- La implementación agrega migraciones hacia adelante sin modificar las históricas.

## Evidencia requerida para cierre

- Tests de servicio/HTTP para permisos por rol/estado, validación de nombres, scope A/B, paginación y proyecciones.
- Pruebas sobre PostgreSQL real de constraints/FKs, RLS/grants, idempotencia concurrente y rollback si falla la auditoría.
- Resultado reproducible de crear, consultar y volver a consultar el mismo ID, y de dos creaciones intencionales con igual nombre.
- Registro de contratos definitivos y errores para las tareas consumidoras.
- Evidencia enlazada desde el documento de pruebas de SPEC-42 cuando exista. No marcar implementación por disponer solo de la migración redactada.

## Referencias

- [Evidencia local y comandos reproducibles](../../../06-testing/spec42-property-invitations.md): suites backend/frontend, SQL real, seis carreras y recorrido browser con persistencia.
- [Runbook de migración, filas legacy y recuperación](../../../03-operation/spec42-property-invitations-runbook.md). El inventario y ambas migraciones se completaron en desarrollo; el despliegue y los smoke tests alojados permanecen pendientes. [Evidencia de la migración](../../../06-testing/spec42-property-invitations.md#development-migration--2026-09-12).

- [Guía de implementación](./IMPLEMENTATION-GUIDE.md), secciones 2 y 3.
- [TASK-42-02](./TASK-42-02-asociacion-e-invitacion-atomica.md).
- [TASK-42-03](./TASK-42-03-dashboard-y-flujo-de-invitacion.md).
