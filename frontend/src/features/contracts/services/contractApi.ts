import axios from 'axios';
import { z } from 'zod';
import type {
  ContractApiErrorBody,
  ContractFieldApiError,
  ContractPublicSchema,
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
