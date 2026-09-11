export interface ArrangementOrder {
  readonly id: string;
  readonly name: string;
  readonly status: string;
}

export interface ArrangementOrdersPage {
  readonly organization_id: string;
  readonly items: readonly ArrangementOrder[];
  readonly available_statuses: readonly string[];
  readonly next_cursor: string | null;
}
