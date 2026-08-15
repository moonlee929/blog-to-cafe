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
  const auth = req.headers.get('authorization') ?? '';
  const expected = `Bearer ${env.cronSecret}`;
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
