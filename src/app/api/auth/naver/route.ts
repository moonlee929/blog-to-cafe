import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import { buildAuthorizeUrl } from '@/lib/naver';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** 네이버 로그인 화면으로 보냅니다. CSRF 방지를 위해 state를 쿠키에 남겨둡니다. */
export async function GET() {
  const state = crypto.randomBytes(16).toString('base64url');

  const res = NextResponse.redirect(buildAuthorizeUrl(state));
  res.cookies.set('naver_oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 600,
  });
  return res;
}
