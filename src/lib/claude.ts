import Anthropic from '@anthropic-ai/sdk';
import { env } from './env';

let cached: Anthropic | null = null;

function client(): Anthropic {
  if (!cached) cached = new Anthropic({ apiKey: env.anthropicApiKey });
  return cached;
}

export type CafeCopy = {
  cafeTitle: string;
  intro: string;
};

const SYSTEM = `너는 네이버 카페 게시판에 올릴 짧은 홍보 문구를 쓰는 카피라이터다.

회원이 자기 블로그에 쓴 글을 카페에 소개하는 게시글을 만든다.
노출은 카페가 만들고, 클릭은 이 문구가 만든다. 링크만 던지지 않는다.

규칙:
- cafe_title: 30자 이내. 원문 제목을 그대로 베끼지 말고, 카페 회원이 궁금해할 각도로 다시 쓴다.
- intro: 두 문장 이내, 120자 이내. 글에서 실제로 얻어갈 게 뭔지 구체적으로 말한다.
- 낚시성 과장, "충격", "이것만 알면", 이모지 남발, 느낌표 연발은 쓰지 않는다.
- 본문에 없는 내용을 지어내지 않는다. 정보가 부족하면 제목이 말하는 범위 안에서만 쓴다.
- 존댓말, 담백한 어조.`;

const SCHEMA = {
  type: 'object',
  properties: {
    cafe_title: { type: 'string', description: '카페 게시글 제목. 30자 이내.' },
    intro: { type: 'string', description: '클릭을 부르는 소개 문구. 두 문장 이내, 120자 이내.' },
  },
  required: ['cafe_title', 'intro'],
  additionalProperties: false,
} as const;

/**
 * 블로그 글 제목/발췌로 카페용 제목과 소개 문구를 만듭니다.
 * 실패해도 발행 파이프라인을 멈추지 않도록 원문 제목으로 폴백합니다.
 */
export async function generateCafeCopy(input: {
  blogTitle: string;
  excerpt: string;
  nickname?: string | null;
}): Promise<CafeCopy> {
  const userPrompt = [
    `작성자: ${input.nickname ?? '회원'}`,
    `블로그 원문 제목: ${input.blogTitle}`,
    '',
    '블로그 본문 발췌:',
    input.excerpt || '(발췌 없음 — 제목만 보고 작성)',
  ].join('\n');

  try {
    const res = await client().messages.create({
      model: 'claude-opus-5',
      max_tokens: 4000,
      system: SYSTEM,
      output_config: {
        effort: 'low',
        format: { type: 'json_schema', schema: SCHEMA },
      },
      messages: [{ role: 'user', content: userPrompt }],
    } as Anthropic.MessageCreateParamsNonStreaming);

    if (res.stop_reason === 'refusal') {
      throw new Error('Claude가 요청을 거절했습니다.');
    }

    const text = res.content.find((b) => b.type === 'text');
    if (!text || text.type !== 'text') throw new Error('Claude 응답에 텍스트 블록이 없습니다.');

    const parsed = JSON.parse(text.text) as { cafe_title: string; intro: string };
    return {
      cafeTitle: parsed.cafe_title.trim().slice(0, 60),
      intro: parsed.intro.trim().slice(0, 300),
    };
  } catch (e) {
    console.error('[claude] 문구 생성 실패, 원문 제목으로 폴백합니다:', e);
    return {
      cafeTitle: input.blogTitle.slice(0, 60),
      intro: '블로그에 새 글을 올렸습니다. 아래 링크에서 확인해 주세요.',
    };
  }
}

/** 카페 본문 HTML을 조립합니다. 카페 글쓰기 API는 이미지 첨부를 지원하지 않아 텍스트 + 링크만 넣습니다. */
export function buildCafeContent(copy: CafeCopy, blogUrl: string, nickname?: string | null): string {
  const who = nickname ? `${nickname} 님의 새 글입니다.` : '챌린지 참여자의 새 글입니다.';
  return [
    copy.intro,
    '',
    `원문 보기: <a href="${blogUrl}">${blogUrl}</a>`,
    '',
    who,
  ].join('<br>');
}
