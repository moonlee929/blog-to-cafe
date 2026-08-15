import { NextResponse, type NextRequest } from 'next/server';
import { exchangeCodeForTokens, fetchProfile } from '@/lib/naver';
import { encryptToken, safeEqual } from '@/lib/crypto';
import { db } from '@/lib/supabase';
import { setSession } from '@/lib/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function fail(req: NextRequest, message: string) {
  const url = new URL('/', req.url);
  url.searchParams.set('error', message);
  return NextResponse.redirect(url);
}

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;

  const naverError = params.get('error');
  if (naverError) {
    return fail(req, `네이버 인증 거부: ${params.get('error_description') ?? naverError}`);
  }

  const code = params.get('code');
  const state = params.get('state');
  const savedState = req.cookies.get('naver_oauth_state')?.value;

  if (!code || !state) return fail(req, '인증 응답이 올바르지 않습니다.');
  if (!savedState || !safeEqual(state, savedState)) return fail(req, 'state 검증에 실패했습니다. 다시 시도해 주세요.');

  try {
    const tokens = await exchangeCodeForTokens(code, state);
    const profile = await fetchProfile(tokens.access_token);

    const expiresAt = new Date(Date.now() + Number(tokens.expires_in) * 1000).toISOString();

    const payload: Record<string, unknown> = {
      naver_id: profile.id,
      nickname: profile.nickname ?? profile.name ?? null,
      email: profile.email ?? null,
      naver_access_token_enc: encryptToken(tokens.access_token),
      token_expires_at: expiresAt,
      last_error: null,
    };
    if (tokens.refresh_token) {
      payload.naver_refresh_token_enc = encryptToken(tokens.refresh_token);
    }

    const { data, error } = await db()
      .from('members')
      .upsert(payload, { onConflict: 'naver_id' })
      .select('id')
      .single();

    if (error || !data) throw new Error(`회원 저장 실패: ${error?.message ?? '알 수 없는 오류'}`);

    await setSession(data.id as string);

    const res = NextResponse.redirect(new URL('/', req.url));
    res.cookies.delete('naver_oauth_state');
    return res;
  } catch (e) {
    return fail(req, e instanceof Error ? e.message : String(e));
  }
}
