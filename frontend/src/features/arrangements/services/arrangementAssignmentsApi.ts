import axios from 'axios';
import { z } from 'zod';
import { ManagerRequest, PersonalRequest, Status, requestBase, requestMutation } from './arrangementRequestsApi';
export async function personalOrders(org: string, cursor: string | null, signal: AbortSignal) {
  const { data } = await axios.get(`${requestBase(org)}/personal/orders`, { withCredentials: true, signal,
    params: { limit: 25, ...(cursor ? { cursor } : {}) } });
  const page = z.object({ organization_id: z.literal(org), items: z.array(PersonalRequest).max(100),
    available_statuses: z.array(Status), next_cursor: z.string().nullable() }).strict().parse(data);
  if (page.items.some(item => item.organization_id !== org || item.legacy || !item.property || !['open', 'in_progress'].includes(item.status))) throw new Error('INVALID_RESPONSE');
  return page;
}
export async function personalAssignees(org: string, cursor: string | null, signal: AbortSignal) {
  const { data } = await axios.get(`${requestBase(org)}/personal/assignees`, { withCredentials: true, signal,
    params: { limit: 25, ...(cursor ? { cursor } : {}) } });
  return z.object({ organization_id: z.literal(org), items: z.array(z.object({ id: z.uuid(), name: z.string(), occupation: z.string() }).strict()).max(100),
    next_cursor: z.string().nullable() }).strict().parse(data);
}
export async function assignOrder(org: string, id: string, version: number, assignee: string, signal: AbortSignal) {
  return ManagerRequest.parse(await requestMutation(org, `/orders/${id}/assignment`, { expected_version: version, assigned_personal_membership_id: assignee }, signal, undefined, 'patch'));
}
export async function rejectOrder(org: string, id: string, version: number, signal: AbortSignal) {
  return ManagerRequest.parse(await requestMutation(org, `/orders/${id}/reject`, { expected_version: version }, signal));
}
export async function unassignOrder(org: string, id: string, version: number, signal: AbortSignal) {
  const token = document.cookie.split(';').map(value => value.trim()).find(value => value.startsWith('form_site_csrf='));
  return ManagerRequest.parse((await axios.delete(`${requestBase(org)}/orders/${id}/assignment`, { withCredentials: true, signal,
    headers: { 'X-Arrangement-Contract': '3', ...(token ? { 'X-CSRF-Token': decodeURIComponent(token.slice('form_site_csrf='.length)) } : {}) },
    data: { expected_version: version } })).data);
}
