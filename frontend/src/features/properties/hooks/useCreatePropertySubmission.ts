import { useMutation } from '@tanstack/react-query';
import { submitProperty, type SubmissionResult } from '../services/propertyApi.ts';
import axios from 'axios';

export interface SubmitPropertyArgs {
  formData: FormData;
}

export function useCreatePropertySubmission() {
  return useMutation<SubmissionResult, Error, SubmitPropertyArgs>({
    mutationFn: ({ formData }) => submitProperty(formData),
    onError: (err) => {
      if (axios.isAxiosError(err) && err.response) {
        const data = err.response.data as {
          error?: string;
          errors?: string[];
          details?: string[];
        };
        const detailMessage = data?.details?.length
          ? data.details.join(', ')
          : data?.errors?.length
          ? data.errors.join(', ')
          : undefined;
        const message = data?.error
          ? detailMessage
            ? `${data.error}: ${detailMessage}`
            : data.error
          : detailMessage ?? `Error del servidor (${err.response.status})`;
        throw new Error(message);
      }
    },
  });
}
