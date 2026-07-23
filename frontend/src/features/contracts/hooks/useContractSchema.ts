import { useQuery } from '@tanstack/react-query';
import { fetchContractSchema } from '../services/contractApi.ts';

export const DEFAULT_CONTRACT_TYPE = 'rent-contract-v1';

export function useContractSchema(
  enabled: boolean,
  contractType = DEFAULT_CONTRACT_TYPE,
) {
  return useQuery({
    queryKey: ['contract-schema', contractType],
    queryFn: () => fetchContractSchema(contractType),
    enabled,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
}
