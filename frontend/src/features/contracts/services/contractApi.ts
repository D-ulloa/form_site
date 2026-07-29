import axios from 'axios';
import { z } from 'zod';
import type {
  ContractAdminEntryDetail,
  ContractApiErrorBody,
  ContractEntryLinks,
  ContractDniPresignedUpload,
  ContractDniUploadDescriptor,
  ContractEntrySummary,
  ContractFieldApiError,
  ContractPublicSchema,
  ContractRole,
  ContractRoleSchemaResponse,
  ContractRoleSubmitResponse,
  ContractSubmitRequest,
  ContractSubmitResponse,
} from '../types.ts';

const API_PREFIX = import.meta.env.DEV ? '' : '/_/backend';
const CONTRACTS_API_PATH = `${API_PREFIX}/api/contracts`;

const ContractOptionSchema = z.union([
  z.string().min(1, 'option value cannot be empty'),
  z.object({
    value: z.string().min(1, 'option value cannot be empty'),
    label: z.string().min(1, 'option label cannot be empty'),
  }),
]);

const ContractFieldSchema = z
  .object({
    name: z
      .string()
      .min(1, 'field name is required')
      .regex(
        /^[A-Za-z][A-Za-z0-9_]*$/,
        'field name must be a flat alphanumeric identifier',
      ),
    label: z.string().min(1, 'field label is required'),
    type: z.enum(['string', 'email', 'number', 'date', 'boolean', 'select']),
    required: z.boolean(),
    sensitive: z.boolean().optional(),
    min: z.number().finite().optional(),
    max: z.number().finite().optional(),
    pattern: z.string().optional(),
    maxLength: z.number().int().nonnegative().optional(),
    options: z.array(ContractOptionSchema).optional(),
    integer: z.boolean().optional(),
    readOnly: z.boolean().optional(),
    computed: z.enum(['formatted_start', 'formatted_update']).optional(),
  })
  .superRefine((field, ctx) => {
    if (field.min !== undefined && field.max !== undefined && field.min > field.max) {
      ctx.addIssue({
        code: 'custom',
        message: 'min cannot be greater than max',
        path: ['min'],
      });
    }

    if (field.type === 'select' && (!field.options || field.options.length === 0)) {
      ctx.addIssue({
        code: 'custom',
        message: 'select fields require at least one option',
        path: ['options'],
      });
    }

    if (field.pattern !== undefined) {
      try {
        new RegExp(field.pattern);
      } catch {
        ctx.addIssue({
          code: 'custom',
          message: 'pattern must be a valid regular expression',
          path: ['pattern'],
        });
      }
    }
  });

const ContractPublicSchemaSchema = z
  .object({
    schemaId: z.string().min(1, 'schemaId is required'),
    contractType: z.string().min(1, 'contractType is required'),
    googleFormLink: z
      .string()
      .url('googleFormLink must be a valid URL')
      .refine((value) => /^https?:\/\//i.test(value), {
        message: 'googleFormLink must use http or https',
      }),
    sections: z
      .array(
        z.object({
          title: z.string().min(1, 'section title is required'),
          fields: z.array(ContractFieldSchema).min(1, 'section fields cannot be empty'),
        }),
      )
      .min(1, 'sections cannot be empty'),
  })
  .superRefine((schema, ctx) => {
    const names = new Set<string>();

    schema.sections.forEach((section, sectionIndex) => {
      section.fields.forEach((field, fieldIndex) => {
        if (names.has(field.name)) {
          ctx.addIssue({
            code: 'custom',
            message: `duplicate field name: ${field.name}`,
            path: ['sections', sectionIndex, 'fields', fieldIndex, 'name'],
          });
        }
        names.add(field.name);
      });
    });
  });

const ContractSubmitResponseSchema = z.object({
  receipt: z.object({
    submissionId: z.string().min(1),
    timestamp: z.string().min(1),
    sheetUrl: z.string().min(1),
    appendedRange: z.string().min(1),
    auditUrl: z.string().min(1),
  }),
});

const ContractEntrySummarySchema = z.object({
  entryId: z.string().uuid(),
  schemaId: z.string().min(1),
  createdBy: z.string().min(1),
  createdAt: z.string().min(1),
  userFilled: z.boolean(),
  clientFilled: z.boolean(),
  userSubmittedAt: z.string().nullable(),
  clientSubmittedAt: z.string().nullable(),
  status: z.enum(['open', 'complete', 'archived']),
  archivedAt: z.string().nullable(),
});

const ContractEntryLinksSchema = z.object({
  entryId: z.string().uuid(),
  userUrl: z.string().url(),
  clientUrl: z.string().url(),
  createdAt: z.string().min(1),
  status: z.literal('open'),
});

const ContractRoleSectionSchema = z.object({
  title: z.string().min(1),
  fields: z.array(ContractFieldSchema).min(1),
  repeatable: z.object({
    name: z.enum(['inquilinos', 'garantes']),
    itemLabel: z.string().min(1),
    addLabel: z.string().min(1),
    minItems: z.literal(1),
  }).optional(),
  uploads: z.array(z.object({
    name: z.string().min(1),
    label: z.string().min(1),
    slot: z.enum(['front', 'back']),
    required: z.boolean(),
  })).max(2).optional(),
  subsections: z.array(z.object({
    title: z.string().min(1),
    fieldNames: z.array(z.string().min(1)).min(1),
  })).min(1).optional(),
});

const ContractDniImageReferenceSchema = z.object({
  originalName: z.string().min(1),
  mimeType: z.string().min(1),
  sizeBytes: z.number().int().positive(),
  storagePath: z.string().min(1),
  storageBucket: z.string().min(1),
  publicPath: z.string().min(1),
  slot: z.enum(['front', 'back']),
});

const ContractDniPresignedUploadSchema = ContractDniImageReferenceSchema.extend({
  uploadUrl: z.string().min(1),
});

const ContractDniPresignResponseSchema = z.object({
  uploads: z.array(ContractDniPresignedUploadSchema).min(1),
});

const ContractRoleSchemaResponseSchema = z.object({
  schemaId: z.string().min(1),
  contractType: z.string().min(1),
  role: z.enum(['user', 'client']),
  sections: z.array(ContractRoleSectionSchema).min(1),
  entry: ContractEntrySummarySchema,
  readOnly: z.boolean(),
  values: z.record(z.string(), z.unknown()),
});

const ContractRoleSubmitResponseSchema = z.object({
  submissionId: z.string().uuid(),
  entryId: z.string().uuid(),
  status: z.enum(['open', 'complete']),
  submittedAt: z.string().min(1),
});

const ContractInspectionFieldSchema = z.object({
  name: z.string().min(1),
  label: z.string().min(1),
  type: z.enum(['string', 'email', 'number', 'date', 'boolean', 'select']),
  value: z.unknown(),
});

const ContractInspectionSubsectionSchema = z.object({
  title: z.string().min(1),
  fields: z.array(ContractInspectionFieldSchema),
});

const ContractInspectionMediaSchema = z.object({
  fieldName: z.string().min(1),
  label: z.string().min(1),
  slot: z.enum(['front', 'back']),
  originalName: z.string().min(1),
  mimeType: z.string().min(1),
  sizeBytes: z.number().int().positive(),
  viewUrl: z.string().url().refine((value) => /^https?:\/\//iu.test(value), {
    message: 'viewUrl must use http or https',
  }),
  expiresAt: z.string().min(1),
});

const ContractInspectionItemSchema = z.object({
  index: z.number().int().nonnegative(),
  label: z.string().min(1),
  fields: z.array(ContractInspectionFieldSchema),
  subsections: z.array(ContractInspectionSubsectionSchema),
  media: z.array(ContractInspectionMediaSchema),
});

const ContractInspectionSectionSchema = z.object({
  title: z.string().min(1),
  fields: z.array(ContractInspectionFieldSchema),
  subsections: z.array(ContractInspectionSubsectionSchema),
  items: z.array(ContractInspectionItemSchema),
});

const ContractEntryInspectionSchema = z.object({
  hasSubmissions: z.boolean(),
  submissions: z.array(z.object({
    submissionId: z.string().min(1),
    role: z.enum(['user', 'client']),
    submittedAt: z.string().min(1),
    sections: z.array(ContractInspectionSectionSchema),
  })),
});

const ContractAdminDetailSchema = z.object({
  entry: ContractEntrySummarySchema,
  userSubmission: z.record(z.string(), z.unknown()).nullable(),
  clientSubmission: z.record(z.string(), z.unknown()).nullable(),
  combinedSubmission: z.record(z.string(), z.unknown()).nullable(),
  inspection: ContractEntryInspectionSchema,
});

function parseResponse<T>(schema: z.ZodType<T>, value: unknown, message: string): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new Error(message);
  return result.data;
}

function identityHeaders(userId?: string): Record<string, string> | undefined {
  return import.meta.env.DEV && userId ? { 'X-User-Id': userId } : undefined;
}

export class ContractRequestError extends Error {
  status: number | undefined;
  retriable: boolean;
  fieldErrors: ContractFieldApiError[];

  constructor(
    message: string,
    options: {
      status?: number;
      retriable?: boolean;
      fieldErrors?: ContractFieldApiError[];
    } = {},
  ) {
    super(message);
    this.name = 'ContractRequestError';
    this.status = options.status;
    this.retriable = options.retriable ?? false;
    this.fieldErrors = options.fieldErrors ?? [];
  }
}

export function parseContractPublicSchema(value: unknown): ContractPublicSchema {
  const result = ContractPublicSchemaSchema.safeParse(value);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `${issue.path.join('.') || 'schema'}: ${issue.message}`)
      .join(' | ');
    throw new Error(`El servidor devolvió un esquema de contrato inválido. ${details}`);
  }
  return result.data;
}

function parseContractSubmitResponse(value: unknown): ContractSubmitResponse {
  const result = ContractSubmitResponseSchema.safeParse(value);
  if (!result.success) {
    throw new Error('El servidor procesó el contrato, pero devolvió un recibo inválido.');
  }
  return {
    receipt: {
      ...result.data.receipt,
      auditUrl: normalizeContractAuditUrl(result.data.receipt.auditUrl),
    },
  };
}

export function normalizeContractAuditUrl(auditUrl: string): string {
  if (!import.meta.env.DEV && auditUrl.startsWith('/api/')) {
    return API_PREFIX + auditUrl;
  }
  return auditUrl;
}

function normalizeFieldErrors(
  errors: ContractApiErrorBody['errors'],
): ContractFieldApiError[] {
  if (!errors) return [];
  return errors.map((error) =>
    typeof error === 'string' ? { message: error } : error,
  );
}

function getBodyMessage(body: ContractApiErrorBody, status?: number): string {
  const details = Array.isArray(body.details)
    ? body.details.join(', ')
    : body.details;
  const errors = normalizeFieldErrors(body.errors)
    .map((error) => error.message)
    .join(', ');
  const reportedMessage = body.message || details || errors || body.error;

  if (status === 401) {
    return body.message || 'Tu sesión venció. Volvé a identificarte antes de enviar.';
  }
  if (status === 403) {
    return body.message || 'No tenés permiso para generar contratos.';
  }
  if (status === 502 || status === 503) {
    return reportedMessage || 'Google Sheets no está disponible temporalmente. Intentá nuevamente.';
  }
  if (status === 400) {
    return reportedMessage || 'Revisá los campos marcados antes de enviar.';
  }
  return reportedMessage || (status ? `Error del servidor (${status}).` : 'Error inesperado.');
}

function asErrorBody(value: unknown): ContractApiErrorBody {
  if (typeof value !== 'object' || value === null) return {};
  return value as ContractApiErrorBody;
}

export function normalizeContractRequestError(error: unknown): Error {
  if (error instanceof ContractRequestError) return error;

  if (axios.isAxiosError(error)) {
    const status = error.response?.status;
    const body = asErrorBody(error.response?.data);
    const fieldErrors = normalizeFieldErrors(body.errors);

    if (!error.response) {
      return new ContractRequestError(
        'No se pudo conectar con el servidor. Verificá tu conexión e intentá nuevamente.',
        { retriable: true },
      );
    }

    return new ContractRequestError(getBodyMessage(body, status), {
      status,
      retriable: body.retriable ?? (status === 502 || status === 503),
      fieldErrors,
    });
  }

  return error instanceof Error
    ? error
    : new ContractRequestError('Ocurrió un error inesperado al procesar el contrato.');
}

export async function fetchContractSchema(
  contractType = 'rent-contract-v1',
): Promise<ContractPublicSchema> {
  try {
    const response = await axios.get<unknown>(
      `${CONTRACTS_API_PATH}/schemas/${encodeURIComponent(contractType)}`,
    );
    return parseContractPublicSchema(response.data);
  } catch (error) {
    throw normalizeContractRequestError(error);
  }
}

export async function submitContract(
  request: ContractSubmitRequest,
): Promise<ContractSubmitResponse> {
  try {
    const response = await axios.post<unknown>(
      `${CONTRACTS_API_PATH}/submit`,
      request,
      {
        headers: {
          'Content-Type': 'application/json',
          ...(import.meta.env.DEV ? { 'X-User-Id': request.meta.userId } : {}),
        },
      },
    );
    return parseContractSubmitResponse(response.data);
  } catch (error) {
    throw normalizeContractRequestError(error);
  }
}

export async function fetchContractAudit(
  auditUrl: string,
  userId: string,
): Promise<unknown> {
  const normalizedUrl = normalizeContractAuditUrl(auditUrl);

  try {
    const resolvedUrl = new URL(normalizedUrl, window.location.origin);
    const isSameOrigin = resolvedUrl.origin === window.location.origin;
    const response = await axios.get<unknown>(normalizedUrl, {
      withCredentials: true,
      headers:
        import.meta.env.DEV && isSameOrigin
          ? { 'X-User-Id': userId }
          : undefined,
    });
    return response.data;
  } catch (error) {
    throw normalizeContractRequestError(error);
  }
}

export async function createContractEntry(userId: string): Promise<ContractEntryLinks> {
  try {
    const response = await axios.post<unknown>(`${CONTRACTS_API_PATH}/create`, {}, {
      withCredentials: true,
      headers: identityHeaders(userId),
    });
    return parseResponse(
      ContractEntryLinksSchema,
      response.data,
      'El servidor creó la entrada, pero devolvió enlaces inválidos.',
    );
  } catch (error) {
    throw normalizeContractRequestError(error);
  }
}

export async function fetchContractRoleSchema(
  entryId: string,
  role: ContractRole,
  token: string | null,
  userId?: string,
): Promise<ContractRoleSchemaResponse> {
  try {
    const response = await axios.get<unknown>(
      `${CONTRACTS_API_PATH}/${encodeURIComponent(entryId)}/schema`,
      {
        withCredentials: true,
        params: { role, ...(token ? { token } : {}) },
        headers: identityHeaders(userId),
      },
    );
    return parseResponse(
      ContractRoleSchemaResponseSchema,
      response.data,
      'El servidor devolvió un formulario de contrato inválido.',
    );
  } catch (error) {
    throw normalizeContractRequestError(error);
  }
}

export async function requestContractDniUploadUrl(
  entryId: string,
  token: string | null,
  descriptor: ContractDniUploadDescriptor,
  userId?: string,
): Promise<ContractDniPresignedUpload> {
  try {
    const response = await axios.post<unknown>(
      `${CONTRACTS_API_PATH}/${encodeURIComponent(entryId)}/dni-uploads/presign`,
      { uploads: [descriptor] },
      {
        withCredentials: true,
        params: token ? { token } : undefined,
        headers: identityHeaders(userId),
      },
    );
    const parsed = parseResponse(
      ContractDniPresignResponseSchema,
      response.data,
      'El servidor devolvió una referencia de carga de DNI inválida.',
    );
    const upload = parsed.uploads[0];
    if (!upload) throw new Error('El servidor no devolvió la carga de DNI solicitada.');
    return upload;
  } catch (error) {
    throw normalizeContractRequestError(error);
  }
}

export async function uploadContractDniImage(
  file: File,
  uploadUrl: string,
): Promise<void> {
  await axios.put(uploadUrl, file, {
    headers: {
      'Content-Type': file.type,
      'x-upsert': 'false',
    },
    maxRedirects: 0,
    validateStatus: (status) => status >= 200 && status < 300,
  });
}

export async function submitContractRole(
  entryId: string,
  role: ContractRole,
  token: string | null,
  fields: Record<string, unknown>,
  userId?: string,
): Promise<ContractRoleSubmitResponse> {
  try {
    const response = await axios.post<unknown>(
      `${CONTRACTS_API_PATH}/${encodeURIComponent(entryId)}/submit`,
      { fields },
      {
        withCredentials: true,
        params: { role, ...(token ? { token } : {}) },
        headers: identityHeaders(userId),
      },
    );
    return parseResponse(
      ContractRoleSubmitResponseSchema,
      response.data,
      'El servidor guardó la respuesta, pero devolvió un recibo inválido.',
    );
  } catch (error) {
    throw normalizeContractRequestError(error);
  }
}

export async function listContractEntries(
  userId: string,
): Promise<ContractEntrySummary[]> {
  try {
    const response = await axios.get<unknown>(`${CONTRACTS_API_PATH}/admin/entries`, {
      withCredentials: true,
      headers: identityHeaders(userId),
    });
    return parseResponse(
      z.object({ entries: z.array(ContractEntrySummarySchema) }),
      response.data,
      'El servidor devolvió una lista de contratos inválida.',
    ).entries;
  } catch (error) {
    throw normalizeContractRequestError(error);
  }
}

export async function fetchContractAdminEntry(
  entryId: string,
  userId: string,
): Promise<ContractAdminEntryDetail> {
  try {
    const response = await axios.get<unknown>(
      `${CONTRACTS_API_PATH}/admin/entries/${encodeURIComponent(entryId)}`,
      { withCredentials: true, headers: identityHeaders(userId) },
    );
    return parseResponse(
      ContractAdminDetailSchema,
      response.data,
      'El servidor devolvió un contrato inválido.',
    );
  } catch (error) {
    throw normalizeContractRequestError(error);
  }
}

export async function archiveContractEntry(
  entryId: string,
  userId: string,
): Promise<ContractEntrySummary> {
  try {
    const response = await axios.post<unknown>(
      `${CONTRACTS_API_PATH}/admin/entries/${encodeURIComponent(entryId)}/archive`,
      {},
      { withCredentials: true, headers: identityHeaders(userId) },
    );
    return parseResponse(
      z.object({ entry: ContractEntrySummarySchema }),
      response.data,
      'El servidor devolvió un contrato archivado inválido.',
    ).entry;
  } catch (error) {
    throw normalizeContractRequestError(error);
  }
}

export async function regenerateContractToken(
  entryId: string,
  role: ContractRole,
  userId: string,
): Promise<{ role: ContractRole; url: string }> {
  try {
    const response = await axios.post<unknown>(
      `${CONTRACTS_API_PATH}/admin/entries/${encodeURIComponent(entryId)}/tokens/${role}/regenerate`,
      {},
      { withCredentials: true, headers: identityHeaders(userId) },
    );
    return parseResponse(
      z.object({ role: z.enum(['user', 'client']), url: z.string().url() }),
      response.data,
      'El servidor devolvió un enlace regenerado inválido.',
    );
  } catch (error) {
    throw normalizeContractRequestError(error);
  }
}
