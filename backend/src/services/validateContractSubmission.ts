import { z } from 'zod';
import { getContractSchemaDefinition } from '../config/contractSchemas.js';
import type {
  ContractFieldDefinition,
  ContractFieldValue,
  ContractSchemaDefinition,
  ContractSubmissionRequest,
  ContractValidationIssue,
  ContractValidationResult,
} from '../contracts/types.js';
import { ContractSchemaNotFoundError } from '../config/contractSchemas.js';
import {
  computeContractFormattedStart,
  computeContractFormattedUpdate,
} from './contractComputedDates.js';

const ContractSubmissionRequestSchema = z
  .object({
    contractType: z.string().trim().min(1).max(128),
    schemaId: z.string().trim().min(1).max(128),
    fields: z.record(z.string(), z.unknown()),
    meta: z
      .object({
        userId: z.string().trim().min(1).max(256),
        origin: z.enum(['ui', 'api']),
      })
      .strict(),
  })
  .strict();

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/u;

function isValidIsoDate(value: string): boolean {
  if (!ISO_DATE_PATTERN.test(value)) {
    return false;
  }

  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function invalidRequestIssues(error: z.ZodError): ContractValidationIssue[] {
  return error.issues.map((issue) => ({
    path: issue.path.length > 0 ? issue.path.join('.') : 'request',
    code: 'invalid_request',
    message: issue.message,
  }));
}

function validateStringRules(
  field: ContractFieldDefinition,
  value: string,
  issues: ContractValidationIssue[],
): void {
  const path = `fields.${field.name}`;

  if (field.required && value.trim().length === 0) {
    issues.push({
      path,
      code: 'required',
      message: `${field.label} is required.`,
    });
    return;
  }

  if (field.maxLength !== undefined && value.length > field.maxLength) {
    issues.push({
      path,
      code: 'max_length',
      message: `${field.label} must contain at most ${field.maxLength} characters.`,
    });
  }

  if (field.pattern !== undefined) {
    let expression: RegExp;
    try {
      expression = new RegExp(field.pattern, 'u');
    } catch {
      issues.push({
        path,
        code: 'invalid_schema',
        message: `The configured pattern for ${field.name} is invalid.`,
      });
      return;
    }

    if (!expression.test(value)) {
      issues.push({
        path,
        code: 'pattern',
        message: `${field.label} does not match the required format.`,
      });
    }
  }
}

function validateField(
  field: ContractFieldDefinition,
  value: unknown,
  issues: ContractValidationIssue[],
): ContractFieldValue | undefined {
  const path = `fields.${field.name}`;

  switch (field.type) {
    case 'string': {
      if (typeof value !== 'string') {
        issues.push({ path, code: 'invalid_type', message: `${field.label} must be a string.` });
        return undefined;
      }
      validateStringRules(field, value, issues);
      return value;
    }
    case 'email': {
      if (typeof value !== 'string') {
        issues.push({ path, code: 'invalid_type', message: `${field.label} must be a string.` });
        return undefined;
      }
      validateStringRules(field, value, issues);
      if (value.length > 0 && !EMAIL_PATTERN.test(value)) {
        issues.push({ path, code: 'invalid_email', message: `${field.label} must be a valid email address.` });
      }
      return value;
    }
    case 'number': {
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        issues.push({ path, code: 'invalid_type', message: `${field.label} must be a finite number.` });
        return undefined;
      }
      if (field.integer && !Number.isSafeInteger(value)) {
        issues.push({ path, code: 'invalid_type', message: `${field.label} must be a whole number.` });
      }
      if (field.min !== undefined && value < field.min) {
        issues.push({ path, code: 'min', message: `${field.label} must be at least ${field.min}.` });
      }
      if (field.max !== undefined && value > field.max) {
        issues.push({ path, code: 'max', message: `${field.label} must be at most ${field.max}.` });
      }
      return value;
    }
    case 'date': {
      if (typeof value !== 'string') {
        issues.push({ path, code: 'invalid_type', message: `${field.label} must be a YYYY-MM-DD string.` });
        return undefined;
      }
      if (!isValidIsoDate(value)) {
        issues.push({ path, code: 'invalid_date', message: `${field.label} must be a valid date in YYYY-MM-DD format.` });
      }
      return value;
    }
    case 'boolean': {
      if (typeof value !== 'boolean') {
        issues.push({ path, code: 'invalid_type', message: `${field.label} must be a boolean.` });
        return undefined;
      }
      return value;
    }
    case 'select': {
      if (typeof value !== 'string') {
        issues.push({ path, code: 'invalid_type', message: `${field.label} must be a selected string value.` });
        return undefined;
      }
      if (!field.options || field.options.length === 0) {
        issues.push({ path, code: 'invalid_schema', message: `${field.name} has no configured select options.` });
        return value;
      }
      if (!field.options.includes(value)) {
        issues.push({ path, code: 'invalid_option', message: `${field.label} must be one of the configured options.` });
      }
      return value;
    }
  }
}

export function validateContractSubmissionAgainstSchema(
  request: ContractSubmissionRequest,
  schema: ContractSchemaDefinition,
): ContractValidationResult {
  const issues: ContractValidationIssue[] = [];
  const validatedFields: Record<string, ContractFieldValue> = {};
  const definitions = schema.sections.flatMap((section) => section.fields);
  const expectedNames = new Set(definitions.map((field) => field.name));

  if (request.contractType !== schema.contractType) {
    issues.push({
      path: 'contractType',
      code: 'contract_type_mismatch',
      message: `contractType must be "${schema.contractType}" for schema "${schema.schemaId}".`,
    });
  }

  for (const field of definitions) {
    if (field.computed) continue;
    const present = Object.prototype.hasOwnProperty.call(request.fields, field.name);
    const value = request.fields[field.name];

    if (!present || value === undefined || value === null) {
      if (field.required) {
        issues.push({
          path: `fields.${field.name}`,
          code: 'required',
          message: `${field.label} is required.`,
        });
      }
      continue;
    }

    const issueCount = issues.length;
    const validatedValue = validateField(field, value, issues);
    if (validatedValue !== undefined && issues.length === issueCount) {
      validatedFields[field.name] = validatedValue;
    }
  }

  const unknownFields = Object.keys(request.fields)
    .filter((fieldName) => !expectedNames.has(fieldName))
    .sort();
  for (const fieldName of unknownFields) {
    issues.push({
      path: `fields.${fieldName}`,
      code: 'unknown_field',
      message: `Field "${fieldName}" is not defined by schema "${schema.schemaId}".`,
    });
  }
  const formattedStartField = definitions.find(
    (field) => field.computed === 'formatted_start',
  );
  if (formattedStartField) {
    const startDate = validatedFields.contract_start_date;
    if (typeof startDate === 'string') {
      const computed = computeContractFormattedStart(startDate);
      if (computed) validatedFields[formattedStartField.name] = computed;
    }
  }

  const formattedUpdateField = definitions.find(
    (field) => field.computed === 'formatted_update',
  );
  if (formattedUpdateField) {
    const formattedStart = formattedStartField
      ? validatedFields[formattedStartField.name]
      : undefined;
    const updateMonths = validatedFields.contract_update;
    if (
      typeof formattedStart === 'string' &&
      (updateMonths === undefined || typeof updateMonths === 'number')
    ) {
      const computed = computeContractFormattedUpdate(formattedStart, updateMonths);
      if (computed) validatedFields[formattedUpdateField.name] = computed;
    }
  }

  if (issues.length > 0) {
    return { success: false, errors: issues };
  }

  return {
    success: true,
    data: {
      contractType: request.contractType,
      schemaId: request.schemaId,
      fields: validatedFields,
      meta: request.meta,
    },
  };
}

export function validateContractSubmission(raw: unknown): ContractValidationResult {
  const parsed = ContractSubmissionRequestSchema.safeParse(raw);
  if (!parsed.success) {
    return { success: false, errors: invalidRequestIssues(parsed.error) };
  }

  let schema: ContractSchemaDefinition;
  try {
    schema = getContractSchemaDefinition(parsed.data.schemaId);
  } catch (error) {
    if (error instanceof ContractSchemaNotFoundError) {
      return {
        success: false,
        errors: [
          {
            path: 'schemaId',
            code: 'unknown_schema',
            message: error.message,
          },
        ],
      };
    }
    throw error;
  }

  return validateContractSubmissionAgainstSchema(parsed.data, schema);
}
