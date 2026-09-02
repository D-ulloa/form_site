# Guía de implementación — SPEC-40

`TASK-40-01` debe ejecutarse como un flujo completo de autorización y frontend: primero se agrega el rol `inquilino` al modelo vigente sin confundirlo con el estado de membresía, después se conecta su destino exclusivo y finalmente se validan la asignación, el aislamiento y la ausencia de funciones en `Inicio`.

## Secuencia

1. Revisar los tipos de organización y membresía, el registro de roles y capacidades, los flujos de invitaciones y administración de miembros, y el resolver actual del contexto de organización.
2. Confirmar que `inquilino` se agregará como rol de membresía mientras `active`, `suspended` y `removed` permanecen como estados independientes.
3. Extender el modelo persistido, los tipos, las validaciones y los contratos de API necesarios para aceptar `inquilino` como rol válido.
4. Incorporar `inquilino` a los flujos autorizados de asignación o invitación, sin permitir autoasignación, asignación por contrato o creación por coincidencia de correo.
5. Agregar la capacidad mínima de acceso a inicio y verificar que el rol no reciba capacidades existentes de trabajo interno o administración.
6. Crear la ruta `/t/:organizationSlug/inquilino` dentro del límite de organización existente y construir su página `Inicio` reutilizando el shell compartido.
7. Mantener el contenido de la página sin botones, enlaces, tarjetas ni controles de producto. Conservar únicamente los controles globales obligatorios del shell si corresponden a la convención existente.
8. Actualizar la resolución de la página principal para que una membresía `inquilino` activa sea dirigida a su `Inicio` exclusivo y no vea las acciones generales.
9. Aplicar la denegación o redirección existente a las rutas internas que el rol no puede utilizar, sin duplicar la lógica de autorización en componentes individuales.
10. Agregar o ajustar las pruebas para verificar:
   - aceptación y persistencia del nuevo rol;
   - asignación autorizada y rechazo de autoasignación;
   - acceso de una membresía `inquilino` activa;
   - rechazo de membresías suspendidas o removidas;
   - redirección desde la página principal;
   - denegación de rutas internas;
   - aislamiento cuando el usuario pertenece a varias organizaciones; y
   - ausencia de botones y funcionalidades en `Inicio`.
11. Ejecutar las comprobaciones relevantes y revisar la página en los viewports soportados para detectar overflow, bucles de redirección, pérdida de foco o divergencias visuales.

## Restricciones de implementación

- No representar `inquilino` como un valor de `MembershipStatus`; debe ser un valor de rol separado.
- No otorgar al nuevo rol capacidades heredadas de `owner`, `admin`, `member` o `viewer` por conveniencia.
- No confiar en una decisión exclusiva del frontend para conceder acceso a la ruta.
- No permitir acceso a la página principal general antes de validar la membresía y el rol de la organización solicitada.
- No permitir que un contrato, token de participante, correo o dominio cree o eleve una membresía.
- No agregar funciones para consultar, crear, editar o administrar contratos, propiedades, arreglos, archivos o integraciones.
- No agregar botones de producto, datos simulados, formularios ni copy temporal a la página `Inicio`.
- No duplicar ni debilitar la lógica existente de autenticación, autorización o selección de organización.
- No cambiar la paleta, tipografía, espaciado ni tratamiento visual establecido por el sitio.
- Si el flujo actual de invitaciones o administración de miembros requiere una decisión sobre la presentación del rol, documentarla en la evidencia de cierre sin ampliar sus capacidades.
