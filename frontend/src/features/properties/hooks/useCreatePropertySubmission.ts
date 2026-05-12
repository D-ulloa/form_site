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
      // Axios errors carry a response — we bubble them up as-is
      if (axios.isAxiosError(err) && err.response) {
        const data = err.response.data as { error?: string; errors?: string[] };
        const message =
          data?.error ??
          data?.errors?.join(', ') ??
          `Error del servidor (${err.response.status})`;
        throw new Error(message);
      }
    },
  });
}
