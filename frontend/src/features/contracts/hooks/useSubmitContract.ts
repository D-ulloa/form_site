import { useMutation } from '@tanstack/react-query';
import { submitContract } from '../services/contractApi.ts';

export function useSubmitContract() {
  return useMutation({
    mutationFn: submitContract,
  });
}
