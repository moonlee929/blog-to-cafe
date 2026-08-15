import { XMLParser } from 'fast-xml-parser';

export type BlogPost = {
  title: string;
  link: string;
  publishedAt: Date | null;
  description: string;
};

export function rssUrlFor(blogId: string): string {
  return `https://rss.blog.naver.com/${encodeURIComponent(blogId)}.xml`;
}

/** 블로그 아이디만 뽑아냅니다. URL을 통째로 붙여넣어도 받아줍니다. */
export function normalizeBlogId(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;

  // 이미 아이디만 들어온 경우
  if (/^[A-Za-z0-9_-]{1,40}$/.test(raw)) return raw;

  // blog.naver.com/xxx, m.blog.naver.com/xxx, rss.blog.naver.com/xxx.xml 등
  const m = raw.match(/(?:rss\.|m\.)?blog\.naver\.com\/([A-Za-z0-9_-]+)/);
  if (m) return m[1].replace(/\.xml$/, '');

  return null;
}

/**
 * 블로그 글 링크를 중복 판별용 형태로 정규화합니다.
 * 같은 글이 http/https, m.blog/blog, ?계열 쿼리로 다르게 들어와도 한 건으로 봅니다.
 */
export function normalizePostUrl(link: string): string {
  try {
    const u = new URL(link);
    u.protocol = 'https:';
    u.host = u.host.replace(/^m\./, '');
    u.search = '';
    u.hash = '';
    u.pathname = u.pathname.replace(/\/+$/, '');
    return u.toString();
  } catch {
    return link.trim();
  }
}

function stripHtml(s: string): string {
  return s
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  trimValues: true,
});

/** RSS를 읽어 최신순 글 목록을 돌려줍니다. */
export async function fetchBlogPosts(rssUrl: string): Promise<BlogPost[]> {
  const res = await fetch(rssUrl, {
    headers: { 'User-Agent': 'blog-to-cafe/1.0' },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`RSS 요청 실패 (HTTP ${res.status}): ${rssUrl}`);

  const xml = await res.text();
  const doc = parser.parse(xml);

  const rawItems = doc?.rss?.channel?.item;
  if (!rawItems) return [];
  const items = Array.isArray(rawItems) ? rawItems : [rawItems];

  const posts: BlogPost[] = items.map((it: any) => {
    const link = String(it.link ?? '').trim();
    const pub = it.pubDate ? new Date(String(it.pubDate)) : null;
    return {
      title: stripHtml(String(it.title ?? '')),
      link,
      publishedAt: pub && !Number.isNaN(pub.getTime()) ? pub : null,
      description: stripHtml(String(it.description ?? '')).slice(0, 1200),
    };
  });

  return posts
    .filter((p) => p.link && p.title)
    .sort((a, b) => (b.publishedAt?.getTime() ?? 0) - (a.publishedAt?.getTime() ?? 0));
}

/** RSS 주소가 실제로 살아있는지 확인합니다. 온보딩 검증용. */
export async function validateRss(rssUrl: string): Promise<{ ok: boolean; count: number; error?: string }> {
  try {
    const posts = await fetchBlogPosts(rssUrl);
    return { ok: true, count: posts.length };
  } catch (e) {
    return { ok: false, count: 0, error: e instanceof Error ? e.message : String(e) };
  }
}
