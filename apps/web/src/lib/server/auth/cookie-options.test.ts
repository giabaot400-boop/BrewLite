import test from 'node:test';
import assert from 'node:assert/strict';
import { AUTH_COOKIE_NAME, AUTH_COOKIE_OPTIONS } from './cookie-policy';

test('session cookie is HttpOnly, SameSite=Lax and scoped to the whole app', () => {
  assert.equal(AUTH_COOKIE_NAME, 'brewlite_session');
  assert.equal(AUTH_COOKIE_OPTIONS.httpOnly, true);
  assert.equal(AUTH_COOKIE_OPTIONS.sameSite, 'lax');
  assert.equal(AUTH_COOKIE_OPTIONS.path, '/');
});
