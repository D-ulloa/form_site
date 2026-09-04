# Guía de implementación — SPEC-41

Esta guía define la secuencia recomendada para implementar el registro autoservicio sin romper invitaciones, aislamiento de organizaciones ni el aprovisionamiento operativo.

## Secuencia

1. Confirmar las consultas de producto de `SPEC-41`, en particular plan por defecto, semántica de email no confirmado, Google, organizaciones adicionales y compatibilidad temporal de campos legacy.
2. Documentar el contrato de onboarding y sus estados (`started`, `identity_created`, `organization_created`, `completed`, `failed_recoverable` o equivalentes), incluyendo idempotencia y reanudación.
3. Crear una migración hacia adelante para las operaciones/intenciones de onboarding y la creación autoservicio protegida. La transacción debe crear organización, settings, owner, perfil y evento; la identidad de Auth se coordina desde el servicio backend.
4. Extraer o reutilizar un núcleo de bootstrap común para el servicio autoservicio y el servicio de plataforma, manteniendo separadas sus autorizaciones y fuentes de creación.
5. Extender el adaptador de identidad para crear una cuenta de contraseña nueva de forma segura y no bloqueada por verificación, según la decisión confirmada para el proveedor. No reutilizar el flujo legacy de administrador global.
6. Convertir el endpoint de registro en el endpoint canónico de onboarding o introducir un endpoint equivalente con compatibilidad explícita. Aplicar autenticación de origen, límites de tasa, validación server-side, respuestas anti-enumeración y ausencia de secretos en logs.
7. Cambiar la entrada inicial y el formulario compartido para ofrecer login/registro, nombre de organización, errores, estados de espera y navegación al contexto creado. Mantener el flujo de login, Google e invitaciones sin regresiones.
8. Agregar pruebas de unidad, integración, base de datos y navegador para éxito, identidad existente, email no confirmado, duplicados, carreras, falla parcial, pérdida de respuesta, invitación posterior y aislamiento.
9. Documentar variables de entorno, migración, recuperación de operaciones, límites de tasa y el procedimiento de rollback/kill switch. Verificar que el comando `platform:provision-organization` permanece operativo.
10. Activar primero en un entorno controlado, revisar métricas y logs sanitizados, y ampliar gradualmente. La verificación de correo puede habilitarse como aviso posterior sin cambiar el contrato de alta.

## Restricciones de implementación

- No editar migraciones históricas; toda modificación de esquema o política debe ser una migración nueva.
- No agregar CAPTCHA ni hacer que la verificación de correo sea requisito del alta.
- No permitir que una identidad de Auth existente cree una organización, aunque no tenga membresías.
- No exponer funciones de servicio, claves de Supabase ni RPCs de bootstrap directamente al navegador.
- No confiar en `role`, `plan_key`, `creation_source`, `organization_id`, actor o flags enviados por el cliente.
- No usar el flujo de administrador global/sintético como implementación de producción.
- No borrar identidades existentes para resolver errores de bootstrap sin una política explícita y una operación segura de recuperación.
- No cambiar las reglas de aceptación de invitaciones ni el modelo de membresías múltiples salvo que una consulta pendiente lo apruebe explícitamente.
- Mantener el comando de plataforma y probarlo contra la misma versión de las funciones compartidas.
- Registrar solo identificadores, estados y fingerprints operativos; nunca contraseñas, tokens o secretos.
- El kill switch debe detener nuevas altas sin dejar una vía alternativa accidental de creación desde el cliente.
