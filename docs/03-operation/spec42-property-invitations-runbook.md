# SPEC-42 property invitations

Status: implemented and verified locally, 2026-09-12. Both migrations were applied and verified on the persistent Supabase development branch `multi-tenant` (`kcobkbtieyowdmsvtsvv`) on 2026-09-12. Application deployment and hosted smoke checks remain pending. See the [development migration evidence](../06-testing/spec42-property-invitations.md#development-migration--2026-09-12).

## Release order

1. Inventory the target migration ledger and effective invitation RPC definitions. Select only the required missing dependencies and these two forward migrations:
   - `20260912120000_spec42_arrangement_properties.sql`: independent properties, organization FKs, operation records and scoped property APIs.
   - `20260912130000_spec42_property_invitation_enforcement.sql`: new-write guards, property-bound invitation issuance, registration/acceptance, replacement, and recovery.
2. Apply both migrations before deploying the backend. The second migration is the cutover: old clients/RPC signatures cannot create or accept a propertyless inquilino. Coordinate the short invitation-write maintenance window with the compatible backend deployment.
3. Deploy the backend, then frontend. Capability registry version 5 enables the new controls. Preserve the existing session, CSRF/origin, `PLATFORM_CURSOR_SECRET`, `PLATFORM_RATE_LIMIT_PEPPER`, Supabase service and invitation settings. Invitations require enabled `share_link` mode and the correct public origin. No new email provider is needed.
4. Run a hosted smoke check with approved test accounts: property creation and reload, invitation, registration/login and acceptance, persisted membership reference, normal subsequent login, reader restrictions and organization A/B isolation. Record schema/backend/frontend versions separately from local evidence.

Do not apply unrelated pending migrations as part of this release. The lightweight `arrangement_properties` domain does not use `public.properties`, contracts, orders, Drive, Sheets, Make or asset processing.

## Historical rows

Use scoped counts to inventory legacy rows without exporting personal data:

```sql
select organization_id, count(*) from public.organization_memberships
where role='inquilino' and arrangement_property_id is null group by organization_id;
select organization_id, count(*) from public.organization_invitations
where intended_role='inquilino' and arrangement_property_id is null and status='pending'
group by organization_id;
```

Active legacy memberships retain SPEC-40 access. In Gestión de arreglos, select the intended property, choose **Agregar inquilino → Asociar existente**, and explicitly associate the membership. Do not infer assignments from email, contracts or names. Suspended/removed memberships cannot use this action. A propertyless suspended inquilino cannot be reactivated by the general status endpoint; authorized reactivation uses a new property-bound invitation.

Legacy inquilino invitations without a property fail resolution, registration and acceptance after cutover. Revoke the old invitation in Miembros/Invitaciones, then issue a new invitation from the intended property. Rotation cannot repair an old propertyless invitation. Revocation invalidates its handoffs. Do not update the invitation FK in place.

## Retries and recovery

- Property creation: retain `Idempotency-Key` for the same normalized name and operation. A new intentional creation gets a new key, even when its name is identical.
- Invitation creation: retain the key for the same organization, actor, normalized email and property. Durable claim rows allow retry after a crash around Auth. A committed replay returns the current invitation ID and `rotate_or_revoke` (or `none`), without a URL. Explicit rotation creates a replacement, preserves its property/role, and updates the operation reference.
- A pending invitation for that email blocks a new attempt, including an expired row whose stored status is still pending. Revoke or rotate it explicitly; do not silently replace its property.
- Auth activation can succeed before membership acceptance. If completion fails, use normal login and a valid invitation; do not delete the identity or grant a provisional membership.
- Acceptance is atomic. A lost response can be retried while the consumed, browser-bound handoff is available: the server returns only the same identity's still-active, matching accepted membership. It performs no reactivation. Once the handoff expires or is cleared, use normal authenticated organization context.
- Assignment to another property returns `PROPERTY_CONFLICT`; transfer/unlink are outside this release. Role/ownership changes into inquilino require a valid retained association or return `PROPERTY_REQUIRED` without changing roles.

## Recovery deployment

Stop new property/invitation mutations if necessary and ship a compatible correction. Keep properties, memberships, invitation history, operation records and association guards. Never roll back to an acceptance implementation that ignores the property, drop the references, or convert inquilinos to an internal role. Preserve existing users' access and authenticated recovery of confirmed operations.

See [verification and reproducible commands](../06-testing/spec42-property-invitations.md) and [API contracts](../05-integrations/api-contracts.md#spec-42-arrangement-properties-and-inquilinos).
