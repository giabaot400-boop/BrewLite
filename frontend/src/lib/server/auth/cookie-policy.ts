export const AUTH_COOKIE_NAME = process.env.AUTH_COOKIE_NAME || 'brewlite_session';
export const AUTH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
};
