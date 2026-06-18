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
}

export interface SubmitPropertyLegacyArgs {
  mode: 'legacy';
  formData: FormData;
}

export type SubmitPropertyArgs = SubmitPropertyJsonArgs | SubmitPropertyLegacyArgs;

const REQUEST_TOO_LARGE_MESSAGE =
  'El servidor rechazó el envío por tamaño del payload. Reducí el total de archivos o dividí la carga en partes menores.';

export function useCreatePropertySubmission() {
  return useMutation<SubmissionResult, Error, SubmitPropertyArgs>({
    mutationFn: (args) =>
      args.mode === 'json'
        ? submitProperty(args.payload)
        : submitPropertyFormData(args.formData),
    onError: (err) => {
      if (axios.isAxiosError(err)) {
        if (err.response?.status === 413) {
          throw new Error(REQUEST_TOO_LARGE_MESSAGE);
        }

        if (err.response) {
          const data = err.response.data as {
            error?: string;
            details?: string | string[];
          };
          const detailMessage = Array.isArray(data?.details)
            ? data.details.join(', ')
            : typeof data?.details === 'string'
              ? data.details
              : data?.error
                ? data.error
                : `Error del servidor (${err.response.status})`;
          throw new Error(detailMessage);
        }
      }

      throw new Error('Error de red o conexión al enviar la propiedad. Verificá tu conexión e inténtalo otra vez.');
    },
  });
}
