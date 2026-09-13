# TASK-43-02 — Inicio del inquilino y envío de solicitudes

- Estado: `in_progress`
- SPEC: [SPEC-43](./SPEC-43-solicitudes-de-arreglo-para-inquilinos.md)
- Dependencias: TASK-43-01 para capacidades, APIs, límites de assets y proyecciones; Inicio/ruta protegidos de SPEC-40; relación de propiedad de SPEC-42.
- Paralelización: puede desarrollarse en paralelo con TASK-43-03 una vez estabilizados los contratos de TASK-43-01.

## Resultado

Reemplazar el Inicio vacío por una página en la que el inquilino cree una solicitud de arreglo y consulte el historial completo de su propiedad sin acceder a herramientas internas.

## Alcance

- Botón `Solicitud de arreglo`, formulario accesible y descripción de 1–5.000 caracteres.
- Fotos/videos opcionales con tipos/cantidades/tamaños limitados, progreso, quitar, retry y estados de error.
- Nuevo control de archivos con allowlist exacta de SPEC-43 y topes servidor/cliente coordinados. El `FileDropzone` actual acepta formatos adicionales y usa un límite distinto; no reutilizar su configuración actual sin adaptarla.
- Flujo de draft oculto, carga privada opcional y envío idempotente confirmado por el backend.
- Historial paginado de todas las solicitudes enviadas de la propiedad actual, incluyendo las solicitudes de otros inquilinos asociados, en todos los estados.
- Descripción, fecha, estado, ID, adjuntos y marca `Tu solicitud`; no exponer identidad de otros inquilinos.
- Estado explicativo y bloqueo de creación cuando no hay propiedad asociada.
- Limpieza de cache, formulario, metadatos y URLs firmadas al cambiar contexto/usuario/propiedad o perder autorización.
- Consumir el `arrangement_property_id` nulo/confirmado que expone el contexto seguro; al cambiar de propiedad, membresía u organización rotar epoch, cancelar consultas y descartar URL firmadas.

## Criterios de cierre

- El botón abre el formulario en `/t/:organizationSlug/inquilino`; no lleva al dashboard interno ni permite enviar property/organization/actor del cliente.
- Con descripción válida, se puede enviar sin archivos. Con archivos, solo formatos/tamaños permitidos pasan a verificación y la solicitud no aparece antes del submit.
- Cancelar, fallar o reintentar una carga no crea órdenes duplicadas ni presenta un borrador como enviado.
- El historial incluye las solicitudes propias y las de todos los inquilinos de su propiedad, con paginación y archivadas incluidas.
- La identidad de otros solicitantes no se renderiza ni se incluye en el DTO; la propia solicitud se identifica con un booleano seguro.
- La vista no ofrece edición, cambio de estado, borrado, propiedades, miembros, contratos o rutas internas.
- Con cambio de organización/sesión/membresía, ningún dato ni URL previa permanece en pantalla o caché.
- Una respuesta tardía a una consulta/carga de la propiedad anterior no puede restaurar historial, formulario ni enlaces temporales.
- El shell, logout, foco/teclado y tamaños responsive de SPEC-40 permanecen válidos.

## Evidencia requerida

- Pruebas frontend de formulario, archivos opcionales, progreso/retry, idempotencia visible, todos los estados, paginación, autorización y ausencia de datos de otro contexto.
- Recorrido browser con una orden realmente persistida y sin archivos, más un recorrido con media de prueba autorizada.
- Capturas/validación de `1280×800`, `390×844` y `320×740`, foco visible, consola limpia y sin overflow.

## Referencias

- [Guía de implementación](./IMPLEMENTATION-GUIDE.md), sección 4.
- [TASK-43-01](./TASK-43-01-persistencia-api-y-assets.md).
- [TASK-43-04](./TASK-43-04-pruebas-compatibilidad-y-rollout.md).

## Implementación local — 2026-09-12

Código y validación local implementados. [Evidencia y comandos](../../../06-testing/spec43-arrangement-requests.md); [runbook de despliegue](../../../03-operation/spec43-arrangement-requests-runbook.md). El cierre remoto y los gates SPEC-31/POL-09 siguen pendientes; no se declara despliegue ni certificación del proveedor.
