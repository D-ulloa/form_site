import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('axios', () => ({ default: { get: mocks.get,
  isAxiosError: (error: { isAxiosError?: boolean }) => error?.isAxiosError === true,
} }));
import { checkAdminSession } from '../../src/features/contracts/services/adminAuthApi.ts';

beforeEach(() => vi.clearAllMocks());

describe('Session validity client', () => {
  it('uses the read-only status endpoint and accepts a definite unauthenticated result', async () => {
    mocks.get.mockResolvedValue({ data: { authenticated: false } });
    expect(await checkAdminSession()).toBeNull();
    expect(mocks.get).toHaveBeenCalledWith('/api/auth/session/status', { withCredentials: true, timeout: 10_000 });
  });

  it.each([{ authenticated: true }, '<html>Proxy response</html>'])('does not treat malformed success responses as session expiry', async (data) => {
    mocks.get.mockResolvedValue({ data });
    await expect(checkAdminSession()).rejects.toMatchObject({ name: 'AdminAuthError', status: undefined });
  });

  it('preserves dependency-failure status so callers can keep a previously authenticated form open', async () => {
    mocks.get.mockRejectedValue({ isAxiosError: true, response: { status: 503, data: { error: 'AUTH_DEPENDENCY_UNAVAILABLE' } } });
    await expect(checkAdminSession()).rejects.toMatchObject({ name: 'AdminAuthError', status: 503 });
  });
});
