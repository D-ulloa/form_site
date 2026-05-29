import type { ValidatedPropertyPayload } from '../services/validatePropertyPayload.js';
export interface SheetRowMeta {
    property_id: string;
    submission_id: string;
    created_at: string;
    agent_name: string;
    agent_email: string;
    drive_folder_name: string;
    drive_folder_url: string;
    media_file_count: number;
    make_status: string;
    sheets_status: string;
}
/**
 * Maps a validated payload + system metadata into an ordered flat array
 * ready to append to Google Sheets.
 *
 * Column order:
 *   [system cols] property_id | submission_id | created_at | agent_name |
 *   agent_email | drive_folder_name | drive_folder_url | media_file_count |
 *   make_status | sheets_status | [property fields in scheme_reworked.json order]
 *
 * Array fields are joined as comma-separated strings for Sheets readability.
 */
export declare function mapToSheetRow(payload: ValidatedPropertyPayload, meta: SheetRowMeta): (string | number | boolean)[];
//# sourceMappingURL=sheetRowMapper.d.ts.map