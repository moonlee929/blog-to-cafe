-- blog-to-cafe 스키마
-- Supabase 대시보드 > SQL Editor 에 붙여넣고 실행하세요.

create extension if not exists "pgcrypto";

-- ─────────────────────────────────────────────────────────────
-- members : 챌린지 참여 회원 1명당 1행
-- ─────────────────────────────────────────────────────────────
create table if not exists public.members (
  id                     uuid primary key default gen_random_uuid(),

  -- 네아로 프로필의 고유 id (재로그인 시 식별자)
  naver_id               text        not null unique,
  nickname               text,
  email                  text,

  -- 네이버 토큰 (AES-256-GCM 암호문. 평문 저장 금지)
  naver_access_token_enc  text,
  naver_refresh_token_enc text,
  token_expires_at        timestamptz,

  -- 블로그 / 발행 설정
  blog_id                text,          -- 네이버 블로그 아이디 (예: moonsaboo)
  blog_rss_url           text,          -- rss.blog.naver.com/{blog_id}.xml
  target_menu_id         text,          -- 발행할 카페 게시판 menuid

  -- 운영 플래그
  is_active              boolean     not null default true,
  is_admin               boolean     not null default false,

  -- 도배 방지 카운터 (날짜가 바뀌면 리셋)
  daily_post_count       integer     not null default 0,
  daily_count_date       date,

  last_checked_at        timestamptz,
  last_error             text,

  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create index if not exists members_active_idx
  on public.members (is_active)
  where is_active = true;

-- ─────────────────────────────────────────────────────────────
-- posts : 발행 기록. 중복 발행 방지가 핵심 용도
-- ─────────────────────────────────────────────────────────────
create table if not exists public.posts (
  id               bigserial   primary key,
  member_id        uuid        not null references public.members(id) on delete cascade,

  -- 원본 블로그 글 링크 (정규화해서 저장). 이 유니크 제약이 중복 발행을 DB 레벨에서 차단
  blog_post_url    text        not null unique,
  blog_title       text,
  blog_published_at timestamptz,

  -- 카페 발행 결과
  cafe_article_id  text,
  cafe_article_url text,
  cafe_title       text,
  cafe_intro       text,
  published_at     timestamptz,

  -- success | failed | dry_run
  status           text        not null,
  error_message    text,
  -- 발행 시도 횟수. 계속 실패하는 글을 무한 재시도하지 않기 위한 상한용
  attempt_count    integer     not null default 0,

  created_at       timestamptz not null default now()
);

create index if not exists posts_member_created_idx
  on public.posts (member_id, created_at desc);

create index if not exists posts_status_idx
  on public.posts (status, created_at desc);

-- ─────────────────────────────────────────────────────────────
-- RLS : anon / authenticated 키로는 아무것도 못 읽게 잠금.
-- 모든 접근은 서버 라우트의 service_role 키로만 (service_role은 RLS 우회).
-- ─────────────────────────────────────────────────────────────
alter table public.members enable row level security;
alter table public.posts   enable row level security;

-- 정책을 하나도 만들지 않으면 anon/authenticated는 전부 거부됨 = 의도된 동작.
-- 토큰이 들어있는 테이블이라 클라이언트 직접 접근은 열지 않습니다.

-- updated_at 자동 갱신
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists members_touch_updated_at on public.members;
create trigger members_touch_updated_at
  before update on public.members
  for each row execute function public.touch_updated_at();
