import type { NextRequest } from 'next/server';
import { assertSameOriginPost } from '@/lib/server/auth/csrf';
import { backendAuthUrl } from '@/lib/server/auth/config';
import { readSessionToken } from '@/lib/server/auth/cookie';
import { backendFetch, forwardError } from '@/lib/server/auth/http';
import { createLogoutHandler } from '@/lib/server/auth/logout-handler';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = createLogoutHandler({
  checkPost: request => assertSameOriginPost(request as NextRequest),
  readToken: readSessionToken,
  backend: (action, token) => backendFetch(backendAuthUrl(action), {
    method: action === 'me' ? 'GET' : 'POST',
    headers: { Authorization: `Bearer ${token}` },
  }),
  forwardError,
});
