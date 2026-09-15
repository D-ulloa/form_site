export interface ArrangementOrder {
  readonly requester?: { readonly name: string | null; readonly email: string | null; readonly contact_number: string | null } | null;
  readonly assignee?: { readonly id: string; readonly name: string | null; readonly occupation: string | null; readonly available: boolean } | null;
  readonly id: string;
  readonly name: string;
  readonly status: string;
  readonly description?: string | null;
  readonly property?: { readonly id: string; readonly name: string } | null;
  readonly submitted_at?: string | null;
  readonly version?: number;
  readonly legacy?: boolean;
  readonly created_by_you?: boolean;
  readonly assets?: readonly { readonly id: string; readonly display_filename: string; readonly mime: string; readonly bytes: number }[];
}

export interface ArrangementOrdersPage {
  readonly organization_id: string;
  readonly items: readonly ArrangementOrder[];
  readonly available_statuses: readonly string[];
  readonly next_cursor: string | null;
}
