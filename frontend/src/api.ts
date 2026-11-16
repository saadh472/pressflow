import type { Session } from './types';
let csrfToken = '';
const listeners = new Set<() => void>();
export const onExpired = (callback: () => void) => { listeners.add(callback); return () => { listeners.delete(callback); }; };
export class ApiError extends Error { constructor(message: string, public status = 0) { super(message); } }
export async function request<T>(path: string, body?: unknown, method?: 'POST' | 'PUT'): Promise<T> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(`/api${path}`, { method: method || (body === undefined ? 'GET' : 'POST'), credentials: 'include', cache: 'no-store', headers: { 'Content-Type': 'application/json', ...(body === undefined ? {} : { 'X-CSRF-TOKEN': csrfToken }) }, body: body === undefined ? undefined : JSON.stringify(body), signal: controller.signal });
    let data: unknown;
    try {
      if (!response.headers.get('Content-Type')?.toLowerCase().includes('application/json')) throw new Error('Not JSON');
      data = await response.json();
    } catch {
      throw new ApiError(body === undefined
        ? 'The server returned an unreadable response. Check the backend connection and refresh.'
        : 'The server response could not be confirmed. Refresh the records before trying again.', response.status);
    }
    const failure = data && typeof data === 'object' ? data as { message?: string; error?: string } : {};
    if (!response.ok) {
      if (response.status === 401 && path !== '/login') { csrfToken = ''; listeners.forEach(callback => callback()); }
      if (response.status === 403 && path !== '/session') {
        // Refresh the token for a future deliberate action; never replay a mutation.
        try { const current = await getSession(); if (!current.authenticated) listeners.forEach(callback => callback()); } catch { /* Preserve original error. */ }
      }
      throw new ApiError(failure.message || failure.error || `Request failed (${response.status}).`, response.status);
    }
    return data as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(body === undefined ? 'Could not load the workspace. Check the backend connection and retry.' : 'The server response could not be confirmed. Refresh the records before trying again.');
  } finally { window.clearTimeout(timer); }
}
const remember = (session: Session) => {
  if (!session || typeof session.authenticated !== 'boolean' || typeof session.csrfToken !== 'string' || !session.csrfToken ||
      (session.authenticated && (!session.user || typeof session.user.username !== 'string'))) {
    csrfToken = '';
    throw new ApiError('The server returned an invalid session. Refresh the page before signing in.');
  }
  csrfToken = session.csrfToken; return session;
};
export const getSession = async () => remember(await request<Session>('/session'));
export const login = async (username: string, password: string) => { if (!csrfToken) await getSession(); return remember(await request<Session>('/login', { username, password })); };
export const logout = async () => remember(await request<Session>('/logout', {}));
