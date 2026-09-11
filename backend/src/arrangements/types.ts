import type { OrganizationScope } from '../platform/scope.js';

export interface ArrangementOrder {
  readonly id: string;
  readonly name: string;
  readonly status: string;
}

export interface ArrangementOrderPage {
  readonly organization_id: string;
  readonly items: readonly ArrangementOrder[];
  readonly available_statuses: readonly string[];
  readonly next_cursor: string | null;
}

export interface ArrangementOrderRepository {
  listOpen(scope: OrganizationScope, query: {
    readonly status: string | null;
    readonly after_id: string | null;
    readonly limit: number;
  }): Promise<{
    readonly organization_id: string;
    readonly items: readonly (ArrangementOrder & { readonly organization_id: string })[];
    readonly available_statuses: readonly string[];
    readonly next_after_id: string | null;
  }>;
}
