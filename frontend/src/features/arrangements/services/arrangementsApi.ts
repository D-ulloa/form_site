import { RequestRecord } from './arrangementRequestsApi';
import axios from 'axios';
import { z } from 'zod';
import type { ArrangementOrdersPage } from '../types';

const API_PREFIX = import.meta.env.DEV ? '' : '/_/backend';
const Status = z.string().min(1).max(64);
const Page = z.object({
  organization_id: z.uuid(),
  items: z.array(z.union([RequestRecord, z.object({ id: z.uuid(), name: z.string().min(1).max(200), status: Status }).strict()])).max(100),
  available_statuses: z.array(Status),
  next_cursor: z.string().min(1).max(1024).nullable(),
}).strict();

export async function listArrangementOrders(input: {
  readonly organizationId: string;
  readonly status: string;
  readonly cursor: string | null;
  readonly signal: AbortSignal;
}): Promise<ArrangementOrdersPage> {
  const response = await axios.get(`${API_PREFIX}/api/organizations/${encodeURIComponent(input.organizationId)}/arrangements/orders`, {
    withCredentials: true, signal: input.signal, headers: { 'X-Arrangement-Contract': '2' },
    params: { limit: 25, ...(input.status ? { status: input.status } : {}), ...(input.cursor ? { cursor: input.cursor } : {}) },
  });
  const parsed = Page.safeParse(response.data);
  if (!parsed.success || parsed.data.organization_id !== input.organizationId
    || parsed.data.items.some(item => (input.status && item.status !== input.status)
      || !parsed.data.available_statuses.includes(item.status))) {
    throw new Error('No se pudo validar la respuesta de órdenes.');
  }
  return parsed.data;
}
