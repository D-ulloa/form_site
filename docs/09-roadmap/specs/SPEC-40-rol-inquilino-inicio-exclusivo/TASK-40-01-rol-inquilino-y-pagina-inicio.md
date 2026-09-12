# TASK-40-01 — Rol de inquilino y página Inicio exclusiva

- Estado: `implemented`
- SPEC: [`SPEC-40`](./SPEC-40-rol-inquilino-inicio-exclusivo.md)
- Dependencias: modelo actual de organizaciones y membresías, autenticación, contexto de organización, autorización por capacidades y shell frontend existente.
- Paralelización: tarea única; el rol, su asignación, la ruta exclusiva, el redireccionamiento y las pruebas se cierran como una unidad.

## Resultado

Agregar el rol de membresía `inquilino` para clientes bajo contrato, habilitar su asignación mediante los controles autorizados de la organización, crear la ruta `/t/:organizationSlug/inquilino` con una página `Inicio` vacía de funcionalidades y evitar que ese rol acceda a la página principal general o a rutas internas no autorizadas.

## Criterios de cierre

- `inquilino` es un rol válido y persistido, separado de los estados `active`, `suspended` y `removed`.
- Los propietarios o administradores autorizados pueden asignarlo mediante el flujo definido, sin autoasignación ni elevación desde un contrato.
- El registro/activación de una cuenta nueva para incorporarse como inquilino requiere una invitación vigente de la organización. Después de aceptar, el acceso habitual utiliza `/login` y la selección de organización sin reutilizar la invitación; el registro público no concede membresías de inquilino.
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

## Evidencia de cierre local — 2026-09-11

- Migración `20260911120000_spec40_inquilino_role.sql`: restricciones de rol, invitaciones, cambios de membresía, transferencia de ownership y listado protegido de miembros; sin nuevas tablas ni backfill.
- Registro de capacidades versión `4`: `inquilino` recibe exclusivamente `inquilino.home.read`. Asignación por invitaciones UI y PATCH autorizado; no se agregó UI de edición de roles.
- Contexto mínimo con `home_destination` calculado en el servidor, barrera central antes de montar páginas internas e Inicio exclusivo sin consultas ni controles de producto. Revalidación al navegar, recargar, volver a la pestaña o cambiar sesión; formularios preservados si la revalidación confirma la misma autoridad.
- Backend: **320 pruebas**, typecheck y build aprobados. Frontend: **180 pruebas**, lint y build aprobados. El build conserva el aviso existente de tamaño del bundle principal.
- Browser: **8 pruebas** de navegación y viewports aprobadas, incluidas regresiones de arreglos; **1 prueba adicional** con PostgreSQL/PostgREST real aprobada por separado: invitación → registro → aceptación → membresía persistida → logout → login habitual → Inicio → suspensión → rechazo.
- SQL real aprobado: restricciones y estados, invitación/activación/aceptación, rotación/revocación/vencimiento, aislamiento, último owner, versiones, auditoría atómica y denegación a roles browser.
- Viewports 1280×800, 390×844 y 320×740: sin overflow, sin controles internos, foco visible. Inspección adicional con agent-browser del Inicio autenticado en desktop/móvil: sin excepciones ni overlay de Vite.
- Evidencia reproducible, límites del adaptador de identidad y entrega: [SPEC-40 verification](../../../06-testing/spec40-inquilino.md). Migración aplicada en desarrollo según la evidencia siguiente; despliegue de aplicaciones **pendiente**.

## Aplicación de migración en desarrollo — 2026-09-11

- Destino confirmado mediante Supabase CLI: rama persistente de desarrollo `multi-tenant`, referencia `kcobkbtieyowdmsvtsvv`, proyecto padre `kjnwiwvwuavurbgovmlt`; rama no predeterminada y estado `ACTIVE_HEALTHY`.
- Archivo aplicado: `supabase/migrations/20260911120000_spec40_inquilino_role.sql`. SHA-256: `323c084c7cf27fa61e5040b397bac568e3a0e9924be97e76bd6d37b82bfc71db`.
- Antes de aplicar se confirmó SPEC-39 en el historial y se compararon las cuatro funciones remotas con sus definiciones previas efectivas. El directorio temporal de migraciones incluyó las versiones ya aplicadas y únicamente SPEC-40 como pendiente; excluyó `20260817190000_retire_legacy_contract_webhook.sql`, que sigue pendiente por separado. No se reparó ni reescribió el historial.
- `supabase db push --dry-run` propuso solo `20260911120000_spec40_inquilino_role.sql`, sin seeds ni roles. La aplicación mediante el pooler de la rama en el puerto `6543` terminó correctamente y registró la versión `20260911120000` con nombre `spec40_inquilino_role`.
- Verificación SQL posterior: las dos restricciones de rol están validadas e incluyen `inquilino`; las demás restricciones permanecen iguales. Ambas tablas tienen RLS habilitado y forzado, sin permisos directos para `anon` ni `authenticated`.
- Las cuatro RPC (`spec26_create_invitation`, `spec26_mutate_membership`, `spec26_transfer_ownership`, `spec37_list_members`) coinciden con la migración, usan `SECURITY DEFINER` y `search_path=pg_catalog`, conservan ejecución para `service_role` y la deniegan a los roles browser. El listado de miembros exige owner/admin y organización activa.
- El historial previo permanece intacto y solo se agregó SPEC-40. No hubo backfill ni carga de fixtures; los conteos de membresías e invitaciones `inquilino` permanecieron en cero.
- El dry run posterior del mismo conjunto aislado devolvió `upToDate: true`, sin migraciones, seeds ni roles pendientes en ese conjunto.

La migración está aplicada en desarrollo. El despliegue compatible de backend/frontend y la verificación de los flujos alojados siguen pendientes; esta ejecución no envió invitaciones ni desplegó aplicaciones.
