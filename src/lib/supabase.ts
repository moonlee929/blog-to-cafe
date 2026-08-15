import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from './env';

let cached: SupabaseClient | null = null;

/**
 * service_role 클라이언트. RLS를 우회하므로 서버 라우트에서만 사용합니다.
 * 클라이언트 컴포넌트에서 절대 import 하지 마세요.
 */
export function db(): SupabaseClient {
  if (!cached) {
    cached = createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return cached;
}

export type Member = {
  id: string;
  naver_id: string;
  nickname: string | null;
  email: string | null;
  naver_access_token_enc: string | null;
  naver_refresh_token_enc: string | null;
  token_expires_at: string | null;
  blog_id: string | null;
  blog_rss_url: string | null;
  /** 'challenge' | 'sharing' — 회원이 고른 발행 대상 종류 */
  board_target: string | null;
  /** 위 두 종류로 커버되지 않는 예외 회원용. 값이 있으면 board_target 보다 우선합니다. */
  target_menu_id: string | null;
  is_active: boolean;
  is_admin: boolean;
  daily_post_count: number;
  daily_count_date: string | null;
  last_checked_at: string | null;
  last_error: string | null;
};

export type PostStatus = 'success' | 'failed' | 'dry_run';
