/**
 * 이 파일은 클라이언트 컴포넌트(온보딩 화면)에서도 import 합니다.
 * 그래서 여기에는 서버 전용 값(env)을 절대 끌어들이지 않습니다.
 * 선택지를 실제 게시판 번호로 바꾸는 resolveMenuId 는 서버 쪽(pipeline.ts)에 있습니다.
 *
 * ---
 *
 * 회원이 고르는 것은 "게시판 번호"가 아니라 "어느 쪽에 올릴 사람인지"입니다.
 *
 * 챌린지 참여방은 매달 새로 생기므로(1월=2 … 7월=16, 8월=19), 회원이 고른 순간의
 * menuid를 그대로 저장하면 다음 달에 지난 달 게시판으로 계속 발행됩니다.
 * 그래서 선택은 challenge/sharing 으로 저장하고, 실제 번호는 발행 직전에 환경 변수에서 읽습니다.
 * 달이 바뀌면 CAFE_MENU_ID_CHALLENGE 한 곳만 바꾸면 챌린지 회원 전원에게 반영됩니다.
 */
export const BOARD_KEYS = ['challenge', 'sharing'] as const;
export type BoardKey = (typeof BOARD_KEYS)[number];

export const BOARDS: Record<BoardKey, { label: string; hint: string }> = {
  challenge: {
    label: '블로그 챌린지 참여방',
    hint: '챌린지에 참여 중인 회원. 달이 바뀌면 그 달의 참여방으로 자동으로 옮겨집니다.',
  },
  sharing: {
    label: '포스팅 공유방',
    hint: '챌린지에 참여하지 않는 회원.',
  },
};

export function isBoardKey(value: unknown): value is BoardKey {
  return typeof value === 'string' && (BOARD_KEYS as readonly string[]).includes(value);
}
