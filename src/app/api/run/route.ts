import { NextResponse } from 'next/server';
import { db, type Member } from '@/lib/supabase';
import { getSessionMemberId } from '@/lib/session';
import { runPollCycle } from '@/lib/pipeline';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * 로그인한 본인 계정만 즉시 한 번 돌려보는 수동 트리거.
 * 1단계 MVP에서 크론을 기다리지 않고 파이프라인 전체를 검증할 때 씁니다.
 */
export async function POST() {
  const memberId = await getSessionMemberId();
  if (!memberId) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });

  const { data } = await db().from('members').select('*').eq('id', memberId).maybeSingle();
  const member = data as Member | null;
  if (!member) return NextResponse.json({ error: '회원 정보를 찾을 수 없습니다.' }, { status: 404 });
  if (!member.blog_rss_url || !member.target_menu_id) {
    return NextResponse.json({ error: '블로그 아이디와 게시판 menuid를 먼저 저장해 주세요.' }, { status: 400 });
  }

  try {
    const result = await runPollCycle({ memberId });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
