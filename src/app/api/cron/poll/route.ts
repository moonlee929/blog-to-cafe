import { NextResponse, type NextRequest } from 'next/server';
import { env } from '@/lib/env';
import { safeEqual } from '@/lib/crypto';
import { runPollCycle } from '@/lib/pipeline';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Hobby 플랜 상한이 60초입니다. Pro라면 300까지 올릴 수 있습니다.
export const maxDuration = 60;

/**
 * Vercel Cron이 주기적으로 호출합니다 (vercel.json 참고).
 * Vercel은 Authorization: Bearer <CRON_SECRET> 헤더를 붙여 호출합니다.
 */
export async function GET(req: NextRequest) {
  // 환경 변수 미설정과 인증 실패를 구분해서 돌려줍니다.
  // 구분하지 않으면 배포 직후 설정 누락이 인증 오류처럼 보여 원인 파악이 어렵습니다.
  let expected: string;
  try {
    expected = `Bearer ${env.cronSecret}`;
  } catch {
    return NextResponse.json(
      { error: 'CRON_SECRET 환경 변수가 설정되지 않았습니다. Vercel 프로젝트 설정에서 추가하세요.' },
      { status: 503 },
    );
  }

  const auth = req.headers.get('authorization') ?? '';
  if (!safeEqual(auth, expected)) {
    return NextResponse.json({ error: '인증 실패' }, { status: 401 });
  }

  const startedAt = Date.now();
  try {
    const result = await runPollCycle();
    return NextResponse.json({
      ok: true,
      elapsedMs: Date.now() - startedAt,
      ...result,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error('[cron] 폴링 실패:', message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
