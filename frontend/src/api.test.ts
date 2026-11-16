import { beforeEach, expect, it, vi } from 'vitest';
import { getSession, login, onExpired, request } from './api';
const response = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
beforeEach(() => { vi.stubGlobal('fetch', vi.fn()); });
it('sends credentialed writes with the latest CSRF token', async () => {
  vi.mocked(fetch).mockResolvedValueOnce(response({ authenticated: false, csrfToken: 'first-token' })).mockResolvedValueOnce(response({ authenticated: true, csrfToken: 'second-token', user: { username: 'operator', displayName: 'Demo operator' } })).mockResolvedValueOnce(response({}));
  await getSession(); await login('operator', 'test-password'); await request('/orders', { title: 'Demo order' });
  expect(fetch).toHaveBeenNthCalledWith(2, '/api/login', expect.objectContaining({ credentials: 'include', headers: expect.objectContaining({ 'X-CSRF-TOKEN': 'first-token' }) }));
  expect(fetch).toHaveBeenNthCalledWith(3, '/api/orders', expect.objectContaining({ headers: expect.objectContaining({ 'X-CSRF-TOKEN': 'second-token' }) }));
});
it('does not replay a mutation with an unknown outcome', async () => {
  vi.mocked(fetch).mockRejectedValueOnce(new TypeError('connection lost'));
  await expect(request('/orders', { requestId: 'same-id' })).rejects.toThrow('response could not be confirmed');
  expect(fetch).toHaveBeenCalledTimes(1);
});
it('expires protected UI on401 but does not expire it on incorrect credentials', async () => {
  vi.mocked(fetch).mockResolvedValueOnce(response({ authenticated: false, csrfToken: 'token' })).mockResolvedValueOnce(response({ message: 'Incorrect credentials' }, 401)).mockResolvedValueOnce(response({ message: 'Sign in required' }, 401));
  const expired = vi.fn(); const unsubscribe = onExpired(expired); await getSession();
  await expect(login('operator', 'incorrect')).rejects.toThrow('Incorrect credentials'); expect(expired).not.toHaveBeenCalled();
  await expect(request('/orders')).rejects.toThrow('Sign in required'); expect(expired).toHaveBeenCalledTimes(1); unsubscribe();
});
it('rejects a malformed success response without replaying the write', async () => {
  vi.mocked(fetch).mockResolvedValueOnce(new Response('<html>Unavailable</html>', { status: 200, headers: { 'Content-Type': 'text/html' } }));
  await expect(request('/orders', { requestId: 'same-id' })).rejects.toThrow('response could not be confirmed');
  expect(fetch).toHaveBeenCalledTimes(1);
});
it('rejects invalid session data before saving a token', async () => {
  vi.mocked(fetch).mockResolvedValueOnce(response({ authenticated: true, csrfToken: '', user: null }));
  await expect(getSession()).rejects.toThrow('invalid session');
});
it('sends versioned catalog edits using PUT and the current CSRF token', async () => {
  vi.mocked(fetch).mockResolvedValueOnce(response({ authenticated: false, csrfToken: 'catalog-token' })).mockResolvedValueOnce(response({}));
  await getSession(); await request('/services/1', { name: 'Fictional service', version: 2 }, 'PUT');
  expect(fetch).toHaveBeenNthCalledWith(2, '/api/services/1', expect.objectContaining({ method: 'PUT', credentials: 'include', headers: expect.objectContaining({ 'X-CSRF-TOKEN': 'catalog-token' }) }));
});
