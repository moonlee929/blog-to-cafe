import crypto from 'node:crypto';
import { cookies } from 'next/headers';
import { env } from './env';
import { safeEqual } from './crypto';

const COOKIE = 'mb_session';
const MAX_AGE = 60 * 60 * 24 * 30; // 30일

function sign(memberId: string): string {
  const mac = crypto.createHmac('sha256', env.sessionSecret).update(memberId).digest('base64url');
  return `${memberId}.${mac}`;
}

function verify(value: string): string | null {
  const idx = value.lastIndexOf('.');
  if (idx <= 0) return null;
  const memberId = value.slice(0, idx);
  const mac = value.slice(idx + 1);
  const expected = crypto.createHmac('sha256', env.sessionSecret).update(memberId).digest('base64url');
  return safeEqual(mac, expected) ? memberId : null;
}

export async function setSession(memberId: string) {
  const jar = await cookies();
  jar.set(COOKIE, sign(memberId), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: MAX_AGE,
  });
}

export async function clearSession() {
  const jar = await cookies();
  jar.delete(COOKIE);
}

/** 로그인된 회원의 id를 돌려줍니다. 없으면 null. */
export async function getSessionMemberId(): Promise<string | null> {
  const jar = await cookies();
  const raw = jar.get(COOKIE)?.value;
  return raw ? verify(raw) : null;
}
