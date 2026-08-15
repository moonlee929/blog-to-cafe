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
   * 챌린지 참여자용 게시판 menuid.
   * 이 카페는 매달 새 챌린지 게시판을 만들므로 달이 바뀌면 이 값만 갱신하면
   * 챌린지 회원 전원에게 반영됩니다. (1월=2 … 7월=16, 8월=19)
   */
  get cafeMenuIdChallenge() {
    return required('CAFE_MENU_ID_CHALLENGE');
  },
  /** 챌린지에 참여하지 않는 회원용 게시판 menuid. 고정값(포스팅 공유방 = 17). */
  get cafeMenuIdSharing() {
    return required('CAFE_MENU_ID_SHARING');
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
