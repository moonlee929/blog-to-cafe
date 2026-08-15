/** 환경 변수 접근을 한 곳으로 모읍니다. 누락되면 바로 알 수 있게 던집니다. */

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`환경 변수 ${name} 이(가) 설정되지 않았습니다.`);
  return v;
}

function optional(name: string, fallback: string): string {
  return process.env[name] || fallback;
}

export const env = {
  get naverClientId() {
    return required('NAVER_CLIENT_ID');
  },
  get naverClientSecret() {
    return required('NAVER_CLIENT_SECRET');
  },
  get naverRedirectUri() {
    return required('NAVER_REDIRECT_URI');
  },
  get cafeClubId() {
    return required('CAFE_CLUB_ID');
  },
  /**
   * 발행할 카페 게시판 menuid. 운영자가 한 곳에서 관리합니다.
   * 이 카페는 매달 새 챌린지 게시판을 만들므로, 달이 바뀌면 이 값만 바꾸면 됩니다.
   * 회원별로 저장하면 매달 30명 전원을 갱신해야 하므로 그렇게 하지 않습니다.
   */
  get cafeMenuId() {
    return required('CAFE_MENU_ID');
  },
  get supabaseUrl() {
    return required('NEXT_PUBLIC_SUPABASE_URL');
  },
  get supabaseServiceRoleKey() {
    return required('SUPABASE_SERVICE_ROLE_KEY');
  },
  get anthropicApiKey() {
    return required('ANTHROPIC_API_KEY');
  },
  get sessionSecret() {
    return required('SESSION_SECRET');
  },
  get tokenEncKey() {
    return required('TOKEN_ENC_KEY');
  },
  get cronSecret() {
    return required('CRON_SECRET');
  },

  /** 카페 API 승인 전이거나 테스트 중이면 true — 실제 발행을 건너뜁니다. */
  get publishDryRun() {
    return optional('PUBLISH_DRY_RUN', 'true').toLowerCase() === 'true';
  },
  get dailyLimitPerMember() {
    return Number(optional('DAILY_LIMIT_PER_MEMBER', '3'));
  },
  get maxPublishPerRun() {
    return Number(optional('MAX_PUBLISH_PER_RUN', '8'));
  },
  get publishSpacingMs() {
    return Number(optional('PUBLISH_SPACING_MS', '5000'));
  },
};
