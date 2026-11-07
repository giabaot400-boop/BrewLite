import 'server-only';
import { cookies } from 'next/headers';
import { AUTH_COOKIE_NAME, AUTH_COOKIE_OPTIONS } from './config';

export async function readSessionToken(): Promise<string | undefined> {
  return (await cookies()).get(AUTH_COOKIE_NAME)?.value;
}

export async function setSessionCookie(token: string, expiresAt: string | number): Promise<void> {
  const expiry = typeof expiresAt === 'number' ? new Date(expiresAt) : new Date(expiresAt);
  const maxAge = Math.max(0, Math.floor((expiry.getTime() - Date.now()) / 1000));
  (await cookies()).set(AUTH_COOKIE_NAME, token, { ...AUTH_COOKIE_OPTIONS, expires: expiry, maxAge });
}

export async function clearSessionCookie(): Promise<void> {
  (await cookies()).set(AUTH_COOKIE_NAME, '', { ...AUTH_COOKIE_OPTIONS, expires: new Date(0), maxAge: 0 });
}
