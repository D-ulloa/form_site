# Guía de implementación — SPEC-46

Estado: `pending`; documento de planificación. No acredita implementación, migración aplicada ni despliegue. La guía conserva la decisión de usar `solved` como estado persistido intermedio y `archived` como estado final de las órdenes cuyo reporte fue aceptado.

## 1. Punto de partida y secuencia

| Área | Contrato de partida |
| --- | --- |
| Órdenes | `arrangement_orders`, `submission_state`, propiedad, autor, versión y estados de SPEC-43/45. |
| Asignación | `assigned_personal_membership_id`, guard de personal y eliminación de asignación al cerrar de SPEC-45. |
| Roles | Capacidades y rutas exclusivas de owner/admin/member/viewer, `personal` e `inquilino`. |
| Propiedades | `arrangement_property_id` de la orden y membresías `inquilino` activas asociadas por SPEC-42. |
| Vistas | `PersonalHomePage`, `ArrangementOrdersDashboard`, historial `InquilinoArrangements` y proyecciones por audiencia. |
| Sincronización | Invalidaciones autenticadas y refetch canónico de SPEC-45; no agregar un emisor en memoria de un solo proceso. |

Orden de entrega:

1. [TASK-46-01](./TASK-46-01-persistencia-y-ciclo-de-aceptacion.md) fija modelo, estados, capacidades, RPC/API y auditoría.
2. [TASK-46-02](./TASK-46-02-dashboard-personal-y-reporte.md) conecta borrador, envío y pérdida de acceso en el dashboard personal.
3. [TASK-46-03](./TASK-46-03-aceptacion-del-inquilino-y-vistas-compartidas.md) conecta aceptación, dashboard interno, historial tenant e invalidaciones.
4. [TASK-46-04](./TASK-46-04-pruebas-compatibilidad-y-rollout.md) reúne pruebas, upgrade, rollout y recuperación.

Fijar primero las proyecciones y la matriz de transiciones. TASK-46-02 y TASK-46-03 pueden avanzar en paralelo después de estabilizar TASK-46-01, pero cada tarea debe conservar sus pruebas focalizadas.

## 2. Modelo de datos y transiciones

Crear una migración aditiva posterior a SPEC-45; no modificar migraciones aplicadas. La opción recomendada es una tabla privada uno-a-uno:

```text
arrangement_work_reports
  id
  organization_id
  order_id
  created_by_personal_membership_id
  body text
  status: draft | submitted | accepted
  version
  created_at / updated_at
  submitted_at
  accepted_at
  accepted_by_membership_id
```

Aplicar FKs compuestas por organización, unicidad `(organization_id, order_id)`, índices por orden/estado y RLS/grants equivalentes a assets y órdenes. El body debe ser texto recortado, entre 1 y 10.000 caracteres, sin contenido confiado como HTML. No guardar una copia del texto en `organization_events`.

La base puede usar constraints locales para longitud, estados y fechas; las invariantes entre reporte y orden deben reforzarse en RPC/servicio bajo locks:

| Operación | Precondición | Escritura atómica |
| --- | --- | --- |
| Guardar draft | Personal activo, asignación exacta, orden `open`/`in_progress`, texto válido. | Insert/update del reporte `draft`, versión del reporte y auditoría técnica. |
| Marcar terminado | Draft válido, orden enviada y propiedad con inquilino activo. | Reporte `submitted`, orden `solved`, asignación nula, versiones y evento. |
| Aceptar | Inquilino activo de la propiedad, reporte `submitted`, orden `solved`. | Reporte `accepted`, aceptación/actor/fecha, orden `archived`, versión y evento. |
| Rechazar | Reglas de SPEC-45. | No aceptar reportes enviados; conservar o invalidar solo drafts según la política fijada. |

Ordenar locks como organización → membresías implicadas → orden → reporte, de forma consistente en guardado, envío, aceptación, baja de membresía y cambio genérico de estado. Si falla la auditoría, todo debe revertirse. Un reintento con el mismo estado confirmado devuelve la proyección canónica sin duplicar el evento.

Mantener compatibilidad explícita para órdenes legacy sin reporte. Una orden con `submitted` no puede pasar a `archived` por `spec45` o por el endpoint genérico; los adaptadores anteriores deben delegar en la nueva máquina de estados. La migración debe inventariar estados, órdenes legacy y membresías sin propiedad antes de añadir índices o constraints nuevas.

## 3. Capacidades, API y proyecciones

Agregar capacidades mínimas sin ampliar `personal` a lectura global:

| Capacidad | Alcance |
| --- | --- |
| `personal.arrangements.report.write` | Personal activo con asignación exacta a una orden abierta/en proceso. |
| `arrangements.work_report.read` | Lectura interna según organización y audiencia existente. |
| `inquilino.arrangements.accept` | Inquilino activo asociado a la propiedad de la orden. |

Rutas propuestas bajo `/api/organizations/:organization/arrangements`:

| Método/ruta | Contrato |
| --- | --- |
| `PUT /orders/:orderId/work-report` | `{ body, expected_version }`; crea/actualiza solo un draft del personal asignado. |
| `POST /orders/:orderId/work-report/submit` | `{ expected_version, report_version }`; envía reporte y cambia orden a `solved`. |
| `POST /orders/:orderId/work-report/accept` | `{ expected_version }`; solo tenant asociado; acepta reporte y orden y archiva. |
| `GET /personal/orders/:orderId` | Proyección personal solo mientras la asignación y el estado abierto sean válidos. |
| `GET /inquilino/orders/:orderId` | Proyección tenant limitada a la propiedad activa, con reporte enviado. |

Los listados internos y tenant deben incluir un objeto `work_report` por audiencia, no columnas ambiguas compartidas:

- Personal asignado: draft o reporte enviado durante la respuesta de envío, sin acceso posterior a una orden ya cerrada.
- Owner/admin/member: estado, body, autor de personal como referencia mínima, fechas y aceptación.
- Viewer: solo lectura del reporte enviado/aceptado cuando la vista de órdenes lo permite; nunca draft.
- Inquilino: body, estado y fechas del reporte enviado/aceptado; no datos privados del personal salvo el mínimo ya autorizado por producto.

Derivar organización, actor, propiedad, orden y asociación tenant del contexto del servidor. Rechazar parámetros repetidos, IDs/cursor ajenos, versiones inválidas y cuerpos desconocidos. Conservar CSRF/origen, rate limit, `no-store`, errores seguros y cursores ligados a organización, audiencia, membresía, propiedad y filtro.

## 4. Dashboard de personal

Montar la edición del reporte dentro de la tarjeta o detalle existente sin crear una ruta paralela. La consulta debe usar claves organización–epoch–membresía–audiencia y cancelar respuestas al cambiar contexto.

Estados de UI mínimos: sin reporte, draft guardado, guardando, error recuperable, confirmación de envío, conflicto de versión, orden retirada, y reconexión. `Marcar trabajo como terminado` debe requerir confirmación y bloquear envíos duplicados.

Después del commit, invalidar listado, detalle y enlaces temporales. El personal no debe conservar en pantalla una orden `solved` si el contrato de SPEC-45 solo muestra `open`/`in_progress`. Si el backend responde que falta inquilino asociado, conservar el draft y explicar el siguiente paso sin presentar el envío como exitoso.

No reutilizar controles de estado internos con props que accidentalmente otorguen a personal la capacidad de archivar, rechazar o aceptar. El report body se escapa como texto y no se persiste en Query Cache duradero, localStorage o telemetría.

## 5. Aceptación tenant, dashboard interno y sincronización

En el historial del inquilino, separar claramente `Pendiente de aceptación` de `Completada y archivada`. El control solo aparece para una propiedad activa y una orden `solved` con reporte `submitted`. La confirmación debe mostrar la descripción, el reporte y los assets ya autorizados, sin exponer órdenes vecinas ni el contacto de otros residentes.

En `ArrangementOrdersDashboard`:

- agregar el reporte enviado/aceptado a la tarjeta o detalle interno;
- mostrar filtros estables para pendientes de aceptación, archived y legacy solved;
- retirar el control de archivo directo para órdenes nuevas pendientes de aceptación;
- conservar lectura de viewer y acciones de asignación/rechazo donde sigan siendo válidas;
- mostrar errores de aceptación, conflictos y membresía tenant faltante sin filtrar contenido privado.

La aceptación debe producir una invalidación post-commit para gestores, inquilinos de la propiedad y cualquier cache de personal que aún esté visible. El canal solo transmite una señal genérica con organización, audiencia autorizada y revisión; cada cliente vuelve a consultar. Al revocar una membresía, cerrar sesión o cambiar de propiedad, cancelar conexión, consultas y datos anteriores.

Medir en el entorno de prueba sano la convergencia entre sesiones dentro del umbral de SPEC-45. Una desconexión debe probar recuperación canónica, no prometer entrega en tiempo real.

## 6. Verificación, rollout y recuperación

Checks base después de implementar:

```bash
npm --prefix backend test
npm --prefix backend run typecheck
npm --prefix backend run build
npm --prefix frontend test
npm --prefix frontend run lint
npm --prefix frontend run build
npm --prefix frontend run test:e2e -- tests/e2e/inquilino-arrangements.spec.ts tests/e2e/personal-assignments.spec.ts tests/e2e/arrangements-navigation.spec.ts
psql "$SPEC46_TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/spec46_setup.sql
psql "$SPEC46_TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/spec46_work_reports.sql
git diff --check
```

El setup SQL debe rechazar bases no desechables/no vacías y aplicar únicamente migraciones dependientes de SPEC-26/27/28/31/39/40/42/43/44/45 y SPEC-46. Las aserciones deben ejercitar RPC reales bajo roles equivalentes, no inspeccionar solamente texto SQL.

Matriz mínima:

- dos personales y dos propiedades en organizaciones A/B;
- draft, doble guardado, conflicto, envío, pérdida de respuesta y reintento;
- envío sin tenant activo, orden legacy, orden sin propiedad y asignación revocada;
- lectura por owner/admin/member/viewer/personal/inquilino con DTOs separados;
- aceptación válida, doble clic, aceptación concurrente, tenant de otra propiedad y membresía suspendida;
- rechazo versus draft, estado genérico intentando archivar, auditoría con fallo inyectado y rollback;
- sincronización entre sesiones, segunda página, reconexión y respuestas tardías;
- assets privados existentes, sin nuevas cargas ni URLs en el reporte;
- regresión de SPEC-42/43/44/45, teclado/foco, consola limpia y los tres viewports.

Rollout:

1. Inventariar órdenes, estados, reportes inexistentes, propiedades y membresías tenant activas; no crear reportes ficticios ni backfill de texto.
2. Aplicar migración aditiva en una base desechable y verificar grants, RLS, locks, constraints y adaptadores legacy.
3. Desplegar lectores capaces de interpretar `work_report` y el estado `Pendiente de aceptación` antes de habilitar escrituras de personal.
4. Habilitar guardado/envío y después el botón de aceptación, manteniendo la aceptación protegida atómicamente por servidor.
5. Registrar por separado pruebas locales, migración aplicada, configuración, despliegue y smoke tests alojados. No marcar SPEC como implementada por tener fixtures locales.

La recuperación puede deshabilitar nuevas escrituras y conservar lectura de reportes ya confirmados. No borrar reportes, auditoría o columnas ni hacer downgrade a un frontend que no distinga órdenes pendientes de aceptación de órdenes archivadas.

## Restricciones de implementación

- No convertir `solved` en cierre final cuando exista reporte `submitted`.
- No permitir que el cliente elija organización, propiedad, autor, personal o aceptante.
- No incluir el texto del reporte en logs, señales, cursores, errores, URLs o eventos de auditoría.
- No dar a `personal` acceso general a órdenes, miembros, propiedades o archivos.
- No aceptar solo la orden o solo el reporte; ambos cambian juntos.
- No usar un proceso de memoria como única fuente de actualización entre sesiones.
- No cambiar migraciones aplicadas ni reportar despliegue alojado como parte de esta redacción.
