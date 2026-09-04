# TASK-41-03 — Pruebas end-to-end, despliegue gradual y compatibilidad

- Estado: `pending`
- SPEC: [`SPEC-41`](./SPEC-41-registro-autoservicio-y-creacion-de-organizacion.md)
- Dependencias: [`TASK-41-01`](./TASK-41-01-onboarding-autoservicio-backend.md), [`TASK-41-02`](./TASK-41-02-registro-en-entrada-principal.md)
- Paralelización: posterior a los contratos de backend/frontend; puede dividirse entre pruebas, observabilidad y documentación de operación

## Resultado

Probar y documentar el flujo completo navegador → autenticación → bootstrap de base de datos → sesión → organización, y dejar un despliegue gradual con kill switch, métricas y compatibilidad explícita para invitaciones y aprovisionamiento por comando.

## Alcance

- Pruebas end-to-end del alta exitosa y del acceso al contexto creado.
- Casos de email existente con cero, una o varias membresías.
- Verificación de email no obligatoria.
- No-CAPTCHA y rate limits.
- Reintentos, doble clic, pérdida de respuesta y concurrencia.
- Fallas de Auth, fallas de DB, rollback/reanudación y operaciones pendientes.
- Invitación del nuevo owner a otra organización y comprobación de aislamiento.
- Regresión del comando `platform:provision-organization` y de las rutas de `SPEC-40`.
- Feature flag, kill switch, observabilidad sanitizada, runbook y rollback.

## Criterios de cierre

- El recorrido de una persona nueva produce un único usuario y una única organización con owner.
- Una persona existente no puede crear organización, independientemente de sus membresías.
- Un nuevo owner puede recibir y aceptar una invitación a otra organización sin alterar la propiedad de la primera.
- Los datos de una organización no son visibles en otra por cambio de slug o contexto.
- Las fallas parciales quedan detectables y recuperables sin duplicar recursos.
- El rate limit funciona sin CAPTCHA y los logs no contienen secretos.
- La bandera deshabilitada impide nuevas altas de forma segura; habilitarla no cambia login ni invitaciones.
- El comando operativo mantiene su contrato y sus controles.
- Existe evidencia reproducible de las pruebas y un procedimiento de recuperación para soporte.

## Evidencia requerida para cierre

- Resultados de suites backend, base de datos, frontend y navegador.
- Traza sanitizada de un alta completa y de una reanudación idempotente.
- Casos documentados de rechazo de usuario existente, email no confirmado y límites de tasa.
- Evidencia de aislamiento y membresías múltiples.
- Validación de migración en entorno de prueba y rollback/kill switch.
- Runbook de soporte para operaciones `failed_recoverable` y respuesta perdida.
