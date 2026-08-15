import { NextResponse } from 'next/server';
import { db, type Member } from '@/lib/supabase';
import { getSessionMemberId } from '@/lib/session';
import { normalizeBlogId, rssUrlFor, validateRss } from '@/lib/rss';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function currentMember(): Promise<Member | null> {
  const id = await getSessionMemberId();
  if (!id) return null;
  const { data } = await db().from('members').select('*').eq('id', id).maybeSingle();
  return (data as Member) ?? null;
}

/** 내 연동 상태와 최근 발행 기록 */
export async function GET() {
  const member = await currentMember();
  if (!member) return NextResponse.json({ loggedIn: false }, { status: 401 });

  const { data: posts } = await db()
    .from('posts')
    .select('blog_title, cafe_title, cafe_article_url, status, error_message, published_at, created_at')
    .eq('member_id', member.id)
    .order('created_at', { ascending: false })
    .limit(10);

  return NextResponse.json({
    loggedIn: true,
    member: {
      id: member.id,
      nickname: member.nickname,
      blogId: member.blog_id,
      blogRssUrl: member.blog_rss_url,
      targetMenuId: member.target_menu_id,
      isActive: member.is_active,
      dailyPostCount: member.daily_post_count,
      lastCheckedAt: member.last_checked_at,
      lastError: member.last_error,
      tokenExpiresAt: member.token_expires_at,
    },
    posts: posts ?? [],
  });
}

/** 블로그 아이디와 발행 게시판 저장 */
export async function POST(req: Request) {
  const member = await currentMember();
  if (!member) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });

  const body = (await req.json()) as { blogId?: string; targetMenuId?: string; isActive?: boolean };

  const patch: Record<string, unknown> = {};

  if (body.blogId !== undefined) {
    const blogId = normalizeBlogId(body.blogId);
    if (!blogId) {
      return NextResponse.json(
        { error: '블로그 아이디를 알아볼 수 없습니다. 아이디만 입력하거나 블로그 주소를 붙여넣어 주세요.' },
        { status: 400 },
      );
    }

    const rssUrl = rssUrlFor(blogId);
    const check = await validateRss(rssUrl);
    if (!check.ok) {
      return NextResponse.json(
        { error: `RSS를 읽지 못했습니다. 블로그 아이디를 확인해 주세요. (${check.error})` },
        { status: 400 },
      );
    }

    patch.blog_id = blogId;
    patch.blog_rss_url = rssUrl;
  }

  if (body.targetMenuId !== undefined) {
    const menuId = body.targetMenuId.trim();
    if (!/^\d+$/.test(menuId)) {
      return NextResponse.json({ error: '게시판 menuid는 숫자여야 합니다.' }, { status: 400 });
    }
    patch.target_menu_id = menuId;
  }

  if (body.isActive !== undefined) patch.is_active = body.isActive;

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: '변경할 내용이 없습니다.' }, { status: 400 });
  }

  const { error } = await db().from('members').update(patch).eq('id', member.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
