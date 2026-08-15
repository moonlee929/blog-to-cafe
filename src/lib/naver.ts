import iconv from 'iconv-lite';
import { env } from './env';
import { db, type Member } from './supabase';
import { encryptToken, decryptToken } from './crypto';

const AUTH_BASE = 'https://nid.naver.com/oauth2.0';
const OPENAPI = 'https://openapi.naver.com';

// ─────────────────────────────────────────────────────────────
// OAuth (네이버 아이디로 로그인 / 네아로)
// ─────────────────────────────────────────────────────────────

export function buildAuthorizeUrl(state: string): string {
  const p = new URLSearchParams({
    response_type: 'code',
    client_id: env.naverClientId,
    redirect_uri: env.naverRedirectUri,
    state,
  });
  return `${AUTH_BASE}/authorize?${p}`;
}

export type NaverTokens = {
  access_token: string;
  refresh_token?: string;
  expires_in: string | number;
  token_type: string;
  error?: string;
  error_description?: string;
};

export async function exchangeCodeForTokens(code: string, state: string): Promise<NaverTokens> {
  const p = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: env.naverClientId,
    client_secret: env.naverClientSecret,
    code,
    state,
  });
  const res = await fetch(`${AUTH_BASE}/token?${p}`, { cache: 'no-store' });
  const json = (await res.json()) as NaverTokens;
  if (json.error || !json.access_token) {
    throw new Error(`네이버 토큰 발급 실패: ${json.error ?? res.status} ${json.error_description ?? ''}`);
  }
  return json;
}

export async function refreshTokens(refreshToken: string): Promise<NaverTokens> {
  const p = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: env.naverClientId,
    client_secret: env.naverClientSecret,
    refresh_token: refreshToken,
  });
  const res = await fetch(`${AUTH_BASE}/token?${p}`, { cache: 'no-store' });
  const json = (await res.json()) as NaverTokens;
  if (json.error || !json.access_token) {
    throw new Error(`토큰 갱신 실패: ${json.error ?? res.status} ${json.error_description ?? ''}`);
  }
  return json;
}

export type NaverProfile = {
  id: string;
  nickname?: string;
  email?: string;
  name?: string;
};

export async function fetchProfile(accessToken: string): Promise<NaverProfile> {
  const res = await fetch(`${OPENAPI}/v1/nid/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  });
  const json = (await res.json()) as { resultcode: string; message: string; response?: NaverProfile };
  if (json.resultcode !== '00' || !json.response) {
    throw new Error(`프로필 조회 실패: ${json.resultcode} ${json.message}`);
  }
  return json.response;
}

/**
 * 회원의 유효한 access token을 돌려줍니다.
 * 만료가 임박(5분 이내)했으면 refresh token으로 갱신하고 DB에 반영합니다.
 */
export async function getValidAccessToken(member: Member): Promise<string> {
  if (!member.naver_access_token_enc) {
    throw new Error('네이버 연동 정보가 없습니다. 재로그인이 필요합니다.');
  }

  const expiresAt = member.token_expires_at ? new Date(member.token_expires_at).getTime() : 0;
  const needsRefresh = expiresAt - Date.now() < 5 * 60 * 1000;

  if (!needsRefresh) {
    return decryptToken(member.naver_access_token_enc);
  }

  if (!member.naver_refresh_token_enc) {
    throw new Error('refresh token이 없습니다. 회원에게 재연동을 요청하세요.');
  }

  const refreshed = await refreshTokens(decryptToken(member.naver_refresh_token_enc));
  const newExpiresAt = new Date(Date.now() + Number(refreshed.expires_in) * 1000).toISOString();

  const patch: Record<string, unknown> = {
    naver_access_token_enc: encryptToken(refreshed.access_token),
    token_expires_at: newExpiresAt,
  };
  // 네이버는 갱신 시 refresh_token을 항상 새로 주지는 않습니다. 왔을 때만 교체.
  if (refreshed.refresh_token) {
    patch.naver_refresh_token_enc = encryptToken(refreshed.refresh_token);
  }

  await db().from('members').update(patch).eq('id', member.id);
  return refreshed.access_token;
}

// ─────────────────────────────────────────────────────────────
// 카페 글쓰기
// ─────────────────────────────────────────────────────────────

/**
 * 네이버 카페 글쓰기 API는 요청 본문을 UTF-8이 아니라 MS949(EUC-KR 확장)로
 * 인코딩해서 보내야 합니다. UTF-8로 보내면 한글이 깨져서 올라갑니다.
 * URLSearchParams는 UTF-8로만 인코딩하므로 직접 바이트 단위로 퍼센트 인코딩합니다.
 */
function encodeFormMs949(fields: Record<string, string>): string {
  return Object.entries(fields)
    .map(([k, v]) => {
      const bytes = iconv.encode(v, 'ms949');
      let out = '';
      for (const b of bytes) out += '%' + b.toString(16).toUpperCase().padStart(2, '0');
      return `${k}=${out}`;
    })
    .join('&');
}

export type CafeWriteResult = {
  articleId: string | null;
  articleUrl: string | null;
  raw: unknown;
};

/**
 * POST https://openapi.naver.com/v1/cafe/{clubid}/menu/{menuid}/articles
 * 글을 쓰는 회원 본인의 access token이 필요합니다.
 * 해당 회원이 카페 멤버이고 글쓰기 가능 등급이어야 합니다.
 */
export async function writeCafeArticle(params: {
  accessToken: string;
  menuId: string;
  subject: string;
  content: string;
}): Promise<CafeWriteResult> {
  const url = `${OPENAPI}/v1/cafe/${env.cafeClubId}/menu/${params.menuId}/articles`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${params.accessToken}`,
      'Content-Type': 'application/x-www-form-urlencoded; charset=MS949',
    },
    body: encodeFormMs949({ subject: params.subject, content: params.content }),
    cache: 'no-store',
  });

  const text = await res.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    // 카페 API가 비-JSON 에러를 뱉는 경우가 있어 원문을 그대로 올려 보냅니다.
  }

  if (!res.ok) {
    const msg = json?.message ?? json?.errorMessage ?? text.slice(0, 300);
    throw new Error(`카페 글쓰기 실패 (HTTP ${res.status}): ${msg}`);
  }

  const articleId =
    json?.message?.result?.articleId != null ? String(json.message.result.articleId) : null;
  const articleUrl = articleId
    ? `https://cafe.naver.com/ca-fe/cafes/${env.cafeClubId}/articles/${articleId}`
    : null;

  return { articleId, articleUrl, raw: json ?? text };
}
