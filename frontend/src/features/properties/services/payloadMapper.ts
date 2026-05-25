import type { PropertyFormValues } from '../schemas/propertySchema.ts';
import type { AgentData } from '../../../app/contexts/AgentContext.tsx';
import type { FileEntry } from '../../../components/ui/FileDropzone.tsx';

/**
 * Maps form values + files + agent identity → multipart/form-data.
 * The backend consumes canonical property field names.
 */
export function buildFormData(
  values: PropertyFormValues,
  files: FileEntry[],
  coverFileName: string,
  agent: AgentData,
): FormData {
  const fd = new FormData();

  // Agent fields
  fd.append('agent_user_id', agent.agent_user_id);
  fd.append('agent_name', agent.agent_name);
  fd.append('agent_email', agent.agent_email);

  // Cover file reference
  fd.append('cover_file_name', coverFileName);

  const skippedFields: Array<keyof PropertyFormValues> = [
    'cover_file_name',
    'agent_user_id',
    'agent_name',
    'agent_email',
  ];

  for (const [key, val] of Object.entries(values) as [keyof PropertyFormValues, unknown][]) {
    if (skippedFields.includes(key)) continue;
    if (val === undefined || val === null) {
      fd.append(key, '');
      continue;
    }

    if (typeof val === 'boolean') {
      fd.append(key, String(val));
      continue;
    }

    if (typeof val === 'number') {
      fd.append(key, String(val));
      continue;
    }

    if (typeof val === 'string') {
      fd.append(key, val);
      continue;
    }

    if (Array.isArray(val)) {
      fd.append(key, JSON.stringify(val));
      continue;
    }

    fd.append(key, String(val));
  }

  for (const entry of files) {
    fd.append('files', entry.file, entry.file.name);
  }

  // Temporary debug output: print final FormData contents before submit.
  for (const pair of fd.entries()) {
    const [field, value] = pair;
    if (value instanceof File) {
      console.log('FormData entry:', field, 'File name=', value.name, 'type=', value.type, 'size=', value.size);
    } else {
      console.log('FormData entry:', field, 'value=', value);
    }
  }

  return fd;
}
