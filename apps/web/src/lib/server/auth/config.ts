import 'server-only';
import { AUTH_COOKIE_NAME, AUTH_COOKIE_OPTIONS } from './cookie-policy';

export { AUTH_COOKIE_NAME, AUTH_COOKIE_OPTIONS };

export function backendAuthUrl(path: 'register' | 'login' | 'me' | 'logout'): string {
  const base = (process.env.BACKEND_INTERNAL_URL || process.env.BACKEND_URL || 'http://localhost:3001').replace(/\/$/, '');
  return `${base}/auth/${path}`;
}
