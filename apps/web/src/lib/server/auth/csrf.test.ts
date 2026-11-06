import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { assertSameOriginPost } from './csrf';

process.env.APP_ORIGIN = 'http://localhost:3000';

function makeRequest(headers: Record<string, string>): NextRequest {
  return new NextRequest('http://localhost:3000/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json', ...headers } });
}

test('CSRF helper accepts marker and matching Origin', () => {
  const response = assertSameOriginPost(makeRequest({ origin: 'http://localhost:3000', 'x-brewlite-request': '1' }));
  assert.equal(response, null);
});

test('CSRF helper rejects missing marker', () => {
  const response = assertSameOriginPost(makeRequest({ origin: 'http://localhost:3000' }));
  assert.equal(response?.status, 403);
});

test('CSRF helper rejects cross-origin Origin', () => {
  const response = assertSameOriginPost(makeRequest({ origin: 'https://attacker.example', 'x-brewlite-request': '1' }));
  assert.equal(response?.status, 403);
});

test('CSRF helper rejects an Origin containing a path', () => {
  const response = assertSameOriginPost(makeRequest({ origin: 'http://localhost:3000/extra', 'x-brewlite-request': '1' }));
  assert.equal(response?.status, 403);
});

test('CSRF helper rejects an invalid JSON media type', () => {
  const request = new NextRequest('http://localhost:3000/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json-invalid', origin: 'http://localhost:3000', 'x-brewlite-request': '1' },
  });
  assert.equal(assertSameOriginPost(request)?.status, 403);
});

test('CSRF helper accepts application/json with charset', () => {
  const request = new NextRequest('http://localhost:3000/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json; charset=utf-8', origin: 'http://localhost:3000', 'x-brewlite-request': '1' },
  });
  assert.equal(assertSameOriginPost(request), null);
});
