import { useMutation } from '@tanstack/react-query';
import {
  submitProperty,
  submitPropertyFormData,
  type SubmissionResult,
} from '../services/propertyApi.ts';
import type { PropertySubmissionPayload } from '../services/payloadMapper.ts';
import axios from 'axios';

export interface SubmitPropertyJsonArgs {
  mode: 'json';
  payload: PropertySubmissionPayload;
  recoveryDraftId: string;
}

export interface SubmitPropertyLegacyArgs {
  mode: 'legacy';
  formData: FormData;
  recoveryDraftId: string;
}

export type SubmitPropertyArgs = SubmitPropertyJsonArgs | SubmitPropertyLegacyArgs;

const REQUEST_TOO_LARGE_MESSAGE =
  'El servidor rechazó el envío por tamaño del payload. Reducí el total de archivos o dividí la carga en partes menores.';

export function useCreatePropertySubmission(organization: string) {
  return useMutation<SubmissionResult, Error, SubmitPropertyArgs>({
    mutationFn: async (args) => {
      try {
        return args.mode === 'json'
          ? await submitProperty(organization, args.payload, args.recoveryDraftId)
          : await submitPropertyFormData(organization, args.formData, args.recoveryDraftId);
      } catch (err) {
        if (axios.isAxiosError(err)) {
          const status = err.response?.status;
          if (status === 413) {
            throw Object.assign(new Error(REQUEST_TOO_LARGE_MESSAGE, { cause: err }), { status });
          }
          if (err.response) {
            const data = err.response.data as Record<string, unknown> | undefined;
            const details = data?.details;
            const message = Array.isArray(details)
              ? details.filter((item): item is string => typeof item === 'string').join(', ')
              : typeof details === 'string' ? details
                : typeof data?.error === 'string' ? data.error
                  : `Error del servidor (${status})`;
            throw Object.assign(new Error(message, { cause: err }), { status,
              result: data?.outcome === 'failure' ? data : undefined });
          }
        }
        throw new Error('Error de red o conexión al enviar la propiedad. Verificá tu conexión e inténtalo otra vez.',
          { cause: err });
      }
    },
  });
}
