# TASK-40-01 — Rol de inquilino y página Inicio exclusiva

- Estado: `pending`
- SPEC: [`SPEC-40`](./SPEC-40-rol-inquilino-inicio-exclusivo.md)
- Dependencias: modelo actual de organizaciones y membresías, autenticación, contexto de organización, autorización por capacidades y shell frontend existente.
- Paralelización: tarea única; el rol, su asignación, la ruta exclusiva, el redireccionamiento y las pruebas se cierran como una unidad.

## Resultado

Agregar el rol de membresía `inquilino` para clientes bajo contrato, habilitar su asignación mediante los controles autorizados de la organización, crear la ruta `/t/:organizationSlug/inquilino` con una página `Inicio` vacía de funcionalidades y evitar que ese rol acceda a la página principal general o a rutas internas no autorizadas.

## Criterios de cierre

- `inquilino` es un rol válido y persistido, separado de los estados `active`, `suspended` y `removed`.
- Los propietarios o administradores autorizados pueden asignarlo mediante el flujo definido, sin autoasignación ni elevación desde un contrato.
- Una membresía `inquilino` activa llega a `/t/:organizationSlug/inquilino` después de la validación de sesión y organización.
- La página muestra `Inicio` y no incluye botones, enlaces, tarjetas ni controles de producto.
- La página principal general redirige a los usuarios `inquilino` a su `Inicio` exclusivo y no expone sus acciones.
- Las rutas de trabajo interno o administración rechazan o redirigen al rol según las convenciones existentes.
- Membresías suspendidas o removidas no pueden acceder a `Inicio`.
- El rol no hereda capacidades internas y el acceso queda aislado por organización.
- Se agregan pruebas para el modelo, asignación, autorización, redirección, aislamiento y ausencia de funcionalidades.
- No se modifican los dominios de contratos, propiedades, arreglos, storage o integraciones.

## Evidencia requerida para cierre

- Resultado de las pruebas de persistencia, API y frontend relevantes para el nuevo rol.
- Evidencia de que una membresía `inquilino` puede acceder solo a la organización validada y a su página propia.
- Evidencia de que la página principal y las rutas internas no exponen acciones o datos no autorizados.
- Evidencia de que una membresía suspendida o removida no puede entrar a `Inicio`.
- Comprobación en los viewports soportados de que la página no genera overflow y mantiene el shell visual.
- Confirmación del diff de que el cambio permanece dentro del alcance de SPEC-40 y no implementa funciones futuras.
