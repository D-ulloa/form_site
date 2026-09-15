import { z } from 'zod';
import { ArrangementStatus, RequestRecord, type ArrangementRequestRepository, ArrangementRequestError } from '../arrangements/requestRepository.js';
import { createRequestCursorCodec } from '../arrangements/requestCursor.js';
import { requireArrangementAuthority } from './arrangementProperties.js';
import type { OrganizationActorContext, OrganizationCapability } from '../organizations/types.js';
import type { OrganizationScope } from '../platform/scope.js';
import type { PrivateAssetStorageAdapter } from '../assets/storageAdapter.js';
import { PlatformError } from '../platform/errors.js';

export type ArrangementAudience = 'manager' | 'viewer' | 'tenant' | 'personal';
const Contact = z.object({ name: z.string().nullable(), email: z.string().nullable(), contact_number: z.string().nullable() }).strict();
export const Assignee = z.object({ id: z.uuid(), name: z.string().nullable(), occupation: z.string().nullable(), available: z.boolean() }).strict();
export const PersonalRequest = RequestRecord.extend({ requester: Contact.nullable() });
export const ManagerRequest = PersonalRequest.extend({ assignee: Assignee.nullable() });
const Candidate = z.object({ id: z.uuid(), name: z.string().min(1).max(120), occupation: z.string().min(1).max(120) }).strict();
const Version = z.number().int().positive().max(2147483647);
const Query = z.object({ limit: z.string().regex(/^[1-9][0-9]{0,2}$/u).transform(Number).refine(n => n <= 100).optional(),
  cursor: z.string().min(1).max(1024).optional(), status: ArrangementStatus.optional() }).strict();
export function arrangementAudience(actor: OrganizationActorContext): ArrangementAudience {
  return actor.membership.role === 'personal' ? 'personal' : actor.membership.role === 'inquilino' ? 'tenant'
    : actor.membership.role === 'viewer' ? 'viewer' : 'manager';
}
export function arrangementReadCapability(audience: ArrangementAudience): OrganizationCapability {
  return audience === 'personal' ? 'personal.arrangements.read' : audience === 'tenant' ? 'inquilino.arrangements.read' : 'arrangements.read';
}
const prefix = (audience: ArrangementAudience) => audience === 'manager' || audience === 'viewer' ? 'internal' : audience;
function parse<T>(schema: z.ZodType<T>, raw: unknown): T {
  const parsed = schema.safeParse(raw); if (!parsed.success) throw new PlatformError('DEPENDENCY_UNAVAILABLE'); return parsed.data;
}
export function createArrangementAssignmentsService(repository: ArrangementRequestRepository, storage: PrivateAssetStorageAdapter, environment: NodeJS.ProcessEnv) {
  function authority(scope: OrganizationScope, actor: OrganizationActorContext, audience: ArrangementAudience, capability = arrangementReadCapability(audience)) {
    if (arrangementAudience(actor) !== audience) throw new ArrangementRequestError('FORBIDDEN', 403);
    requireArrangementAuthority(scope, actor, capability);
    if (audience === 'tenant' && !actor.membership.arrangement_property_id) throw new ArrangementRequestError('PROPERTY_REQUIRED', 409);
  }
  const schema = (audience: ArrangementAudience) => audience === 'manager' ? ManagerRequest : audience === 'personal' ? PersonalRequest : RequestRecord;
  const call = (scope: OrganizationScope, actor: OrganizationActorContext, action: string, input: Record<string, unknown>) => repository.call(scope, actor, `v3.${action}`, input);
  return {
    async listAssigned(scope: OrganizationScope, actor: OrganizationActorContext, audience: ArrangementAudience, raw: unknown) {
      authority(scope, actor, audience);
      const query = Query.parse(raw);
      if (audience === 'personal' && query.status) throw new ArrangementRequestError('INVALID_REQUEST', 400);
      const binding = { organization_id: scope.organization_id, property_id: audience === 'tenant' ? actor.membership.arrangement_property_id! : null,
        status: query.status ?? null, limit: query.limit ?? 25, audience, membership_id: actor.membership.id };
      const codec = createRequestCursorCodec(environment.PLATFORM_CURSOR_SECRET ?? '', binding);
      const after = query.cursor ? codec.decode(query.cursor) : null;
      const page = parse(z.object({ organization_id: z.literal(scope.organization_id), property_id: z.literal(binding.property_id), items: z.array(schema(audience)).max(binding.limit + 1) }).strict(),
        await call(scope, actor, `${prefix(audience)}.list`, { limit: binding.limit, status: binding.status, after_id: after?.id, after_at: after?.at }));
      if (new Set(page.items.map(item => item.id)).size !== page.items.length || page.items.some(item => item.organization_id !== scope.organization_id
        || (query.status && item.status !== query.status) || (audience === 'tenant' && (item.legacy || item.property?.id !== binding.property_id))
        || (audience === 'personal' && (item.legacy || !item.property || !['open', 'in_progress'].includes(item.status))))) throw new PlatformError('DEPENDENCY_UNAVAILABLE');
      const items = page.items.slice(0, binding.limit); const last = items.at(-1);
      return { organization_id: scope.organization_id, items, available_statuses: ArrangementStatus.options,
        next_cursor: page.items.length > binding.limit && last ? codec.encode({ id: last.id, at: last.submitted_at }) : null };
    },
    async assignees(scope: OrganizationScope, actor: OrganizationActorContext, raw: unknown) {
      authority(scope, actor, 'manager', 'arrangements.assignment.manage');
      const query = Query.omit({ status: true }).parse(raw); const limit = query.limit ?? 25;
      const codec = createRequestCursorCodec(environment.PLATFORM_CURSOR_SECRET ?? '', { organization_id: scope.organization_id,
        property_id: null, status: null, limit, audience: 'assignees', membership_id: actor.membership.id, ordering: 'id.asc' });
      const after = query.cursor ? codec.decode(query.cursor) : null;
      const page = parse(z.object({ organization_id: z.literal(scope.organization_id), items: z.array(Candidate).max(limit + 1) }).strict(),
        await call(scope, actor, 'internal.assignees', { limit, after_id: after?.id }));
      const items = page.items.slice(0, limit); const last = items.at(-1);
      return { organization_id: scope.organization_id, items, next_cursor: page.items.length > limit && last ? codec.encode({ id: last.id, at: null }) : null };
    },
    async detail(scope: OrganizationScope, actor: OrganizationActorContext, audience: ArrangementAudience, orderId: string) {
      authority(scope, actor, audience);
      return parse(schema(audience).extend({ id: z.literal(z.uuid().parse(orderId)), organization_id: z.literal(scope.organization_id) }),
        await call(scope, actor, `${prefix(audience)}.detail`, { order_id: orderId }));
    },
    async assignedView(scope: OrganizationScope, actor: OrganizationActorContext, audience: ArrangementAudience, orderId: string, assetId: string) {
      authority(scope, actor, audience);
      const record = parse(z.object({ id: z.literal(z.uuid().parse(assetId)), organization_id: z.literal(scope.organization_id), state: z.literal('attached'),
        bucket_name: z.literal('arrangement-media'), object_path: z.string(), display_filename: z.string() }).passthrough(),
        await call(scope, actor, `${prefix(audience)}.view`, { order_id: z.uuid().parse(orderId), asset_id: assetId }));
      return storage.issueView(record.bucket_name, record.object_path, 60, record.display_filename);
    },
    async mutateAssignment(scope: OrganizationScope, actor: OrganizationActorContext, orderId: string, action: 'assign' | 'unassign' | 'reject' | 'status', raw: unknown) {
      authority(scope, actor, 'manager', action === 'status' || action === 'reject' ? 'arrangements.status.update' : 'arrangements.assignment.manage');
      const version = z.object({ expected_version: Version }).strict();
      const body = (action === 'assign' ? version.extend({ assigned_personal_membership_id: z.uuid() })
        : action === 'status' ? version.extend({ status: ArrangementStatus }) : version).parse(raw);
      return parse(ManagerRequest.extend({ id: z.literal(z.uuid().parse(orderId)), organization_id: z.literal(scope.organization_id) }),
        await call(scope, actor, `internal.${action}`, { ...body, order_id: orderId }));
    },
    async changes(scope: OrganizationScope, actor: OrganizationActorContext, audience: ArrangementAudience) {
      authority(scope, actor, audience);
      return parse(z.object({ revision: z.string().regex(/^\d+$/u) }).strict(), await call(scope, actor, `${prefix(audience)}.changes`, {}));
    },
  };
}
