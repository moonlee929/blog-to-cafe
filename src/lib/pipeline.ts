import { env } from './env';
import { db, type Member } from './supabase';
import { fetchBlogPosts, normalizePostUrl, type BlogPost } from './rss';
import { generateCafeCopy, buildCafeContent } from './claude';
import { getValidAccessToken, writeCafeArticle } from './naver';

/** 백로그가 카페에 한꺼번에 쏟아지지 않도록, 이 기간보다 오래된 글은 무시합니다. */
const MAX_POST_AGE_DAYS = 7;
/** 계속 실패하는 글의 재시도 상한 */
const MAX_ATTEMPTS = 3;

export type PublishOutcome = {
  memberId: string;
  nickname: string | null;
  blogPostUrl: string;
  blogTitle: string;
  status: 'success' | 'failed' | 'dry_run';
  cafeArticleUrl?: string | null;
  error?: string;
};

export type MemberRunResult = {
  memberId: string;
  nickname: string | null;
  checked: boolean;
  newPosts: number;
  outcomes: PublishOutcome[];
  error?: string;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** 한국 시간 기준 오늘 날짜 (YYYY-MM-DD) */
function todayKst(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date());
}

/**
 * 회원 한 명의 RSS를 훑어 새 글을 찾고, 발행 대상 목록을 돌려줍니다.
 * 발행 자체는 하지 않습니다 (순차 처리와 건수 제한을 호출부에서 통제하기 위해).
 */
export async function findNewPosts(member: Member): Promise<{ posts: BlogPost[]; firstRun: boolean }> {
  if (!member.blog_rss_url) return { posts: [], firstRun: false };

  const feed = await fetchBlogPosts(member.blog_rss_url);
  if (feed.length === 0) return { posts: [], firstRun: false };

  const urls = feed.map((p) => normalizePostUrl(p.link));

  const { data: known, error } = await db()
    .from('posts')
    .select('blog_post_url, status, attempt_count')
    .in('blog_post_url', urls);
  if (error) throw new Error(`posts 조회 실패: ${error.message}`);

  const knownMap = new Map((known ?? []).map((r) => [r.blog_post_url as string, r]));

  // 이 회원의 발행 기록이 아직 하나도 없으면 첫 실행으로 봅니다.
  const { count } = await db()
    .from('posts')
    .select('id', { count: 'exact', head: true })
    .eq('member_id', member.id);
  const firstRun = (count ?? 0) === 0;

  const cutoff = Date.now() - MAX_POST_AGE_DAYS * 24 * 60 * 60 * 1000;

  const candidates = feed.filter((p) => {
    const url = normalizePostUrl(p.link);
    const row = knownMap.get(url);

    // 이미 성공(또는 dry run)한 글은 건너뜁니다 — 중복 발행 방지의 1차 방어선
    if (row && (row.status === 'success' || row.status === 'dry_run')) return false;
    // 실패한 글은 재시도하되 상한을 둡니다
    if (row && (row.attempt_count as number) >= MAX_ATTEMPTS) return false;
    // 너무 오래된 글은 무시
    if (p.publishedAt && p.publishedAt.getTime() < cutoff) return false;

    return true;
  });

  // 첫 실행이면 백로그 전체가 아니라 가장 최근 글 1건만 잡습니다.
  return { posts: firstRun ? candidates.slice(0, 1) : candidates, firstRun };
}

/** 새 글 한 건을 카페에 발행합니다. */
export async function publishPost(member: Member, post: BlogPost): Promise<PublishOutcome> {
  const blogPostUrl = normalizePostUrl(post.link);
  const base = {
    memberId: member.id,
    nickname: member.nickname,
    blogPostUrl,
    blogTitle: post.title,
  };

  // 재시도 횟수 파악
  const { data: existing } = await db()
    .from('posts')
    .select('attempt_count')
    .eq('blog_post_url', blogPostUrl)
    .maybeSingle();
  const attempt = ((existing?.attempt_count as number | undefined) ?? 0) + 1;

  const copy = await generateCafeCopy({
    blogTitle: post.title,
    excerpt: post.description,
    nickname: member.nickname,
  });
  const content = buildCafeContent(copy, blogPostUrl, member.nickname);

  const row: Record<string, unknown> = {
    member_id: member.id,
    blog_post_url: blogPostUrl,
    blog_title: post.title,
    blog_published_at: post.publishedAt?.toISOString() ?? null,
    cafe_title: copy.cafeTitle,
    cafe_intro: copy.intro,
    attempt_count: attempt,
  };

  // ── DRY RUN : 카페 API 승인 전이거나 테스트 중 ────────────────
  if (env.publishDryRun) {
    row.status = 'dry_run';
    row.published_at = new Date().toISOString();
    row.error_message = null;
    await db().from('posts').upsert(row, { onConflict: 'blog_post_url' });
    return { ...base, status: 'dry_run' };
  }

  // ── 실제 발행 ────────────────────────────────────────────────
  try {
    const accessToken = await getValidAccessToken(member);
    const result = await writeCafeArticle({
      accessToken,
      // 기본은 운영자가 정한 게시판. 특정 회원만 다른 곳에 보내야 할 때만 회원 값으로 덮어씁니다.
      menuId: member.target_menu_id ?? env.cafeMenuId,
      subject: copy.cafeTitle,
      content,
    });

    row.status = 'success';
    row.cafe_article_id = result.articleId;
    row.cafe_article_url = result.articleUrl;
    row.published_at = new Date().toISOString();
    row.error_message = null;
    await db().from('posts').upsert(row, { onConflict: 'blog_post_url' });

    return { ...base, status: 'success', cafeArticleUrl: result.articleUrl };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    row.status = 'failed';
    row.error_message = message;
    await db().from('posts').upsert(row, { onConflict: 'blog_post_url' });
    await db().from('members').update({ last_error: message }).eq('id', member.id);

    return { ...base, status: 'failed', error: message };
  }
}

/**
 * 활성 회원 전체를 훑어 새 글을 발행합니다.
 * - 회원당 하루 발행 건수 제한
 * - 실행 1회당 총 발행 건수 제한 (서버리스 함수 실행시간 한도 대비)
 * - 발행 사이 대기 (카페 스팸 필터 회피)
 */
export async function runPollCycle(options?: { memberId?: string }): Promise<{
  members: MemberRunResult[];
  published: number;
  dryRun: boolean;
}> {
  let query = db().from('members').select('*').eq('is_active', true);
  if (options?.memberId) query = query.eq('id', options.memberId);

  const { data: members, error } = await query;
  if (error) throw new Error(`members 조회 실패: ${error.message}`);

  const today = todayKst();
  const results: MemberRunResult[] = [];
  let publishedThisRun = 0;

  for (const raw of (members ?? []) as Member[]) {
    const member = { ...raw };

    if (!member.blog_rss_url) {
      results.push({
        memberId: member.id,
        nickname: member.nickname,
        checked: false,
        newPosts: 0,
        outcomes: [],
        error: '블로그가 등록되지 않았습니다.',
      });
      continue;
    }

    // 날짜가 바뀌었으면 하루 카운터를 리셋합니다.
    let dailyCount = member.daily_post_count;
    if (member.daily_count_date !== today) {
      dailyCount = 0;
      await db()
        .from('members')
        .update({ daily_post_count: 0, daily_count_date: today })
        .eq('id', member.id);
    }

    let newPosts: BlogPost[] = [];
    try {
      const found = await findNewPosts(member);
      newPosts = found.posts;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      await db()
        .from('members')
        .update({ last_error: message, last_checked_at: new Date().toISOString() })
        .eq('id', member.id);
      results.push({
        memberId: member.id,
        nickname: member.nickname,
        checked: true,
        newPosts: 0,
        outcomes: [],
        error: message,
      });
      continue;
    }

    const outcomes: PublishOutcome[] = [];

    // 오래된 글부터 순서대로 올립니다.
    for (const post of [...newPosts].reverse()) {
      if (publishedThisRun >= env.maxPublishPerRun) break;
      if (dailyCount >= env.dailyLimitPerMember) break;

      if (publishedThisRun > 0) await sleep(env.publishSpacingMs);

      const outcome = await publishPost(member, post);
      outcomes.push(outcome);

      if (outcome.status !== 'failed') {
        publishedThisRun += 1;
        dailyCount += 1;
        await db()
          .from('members')
          .update({ daily_post_count: dailyCount, daily_count_date: today })
          .eq('id', member.id);
      }
    }

    await db()
      .from('members')
      .update({ last_checked_at: new Date().toISOString() })
      .eq('id', member.id);

    results.push({
      memberId: member.id,
      nickname: member.nickname,
      checked: true,
      newPosts: newPosts.length,
      outcomes,
    });
  }

  return { members: results, published: publishedThisRun, dryRun: env.publishDryRun };
}
