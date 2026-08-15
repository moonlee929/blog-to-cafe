# 블로그 → 카페 자동 발행

챌린지 참여 회원이 네이버 블로그에 새 글을 올리면, 그 글의 카페용 제목과 소개 문구를 Claude가 만들어
운영자 카페의 지정 게시판에 회원 본인 계정으로 자동 발행합니다.

- 코드 관리: GitHub
- 배포/크론: Vercel (Vercel Cron + 서버리스 함수)
- DB: Supabase (Postgres)
- 인증: 네이버 아이디로 로그인(네아로) OAuth 2.0 — 비밀번호를 받지 않습니다
- 새 글 감지: 네이버 블로그 RSS 폴링
- 문구 생성: Claude API (`claude-opus-5`)

---

## 착수 전 반드시 확인할 블로커

1. **네이버 개발자센터 앱 등록 + 카페 API 사용 권한.**
   [developers.naver.com/apps](https://developers.naver.com/apps) 에서 앱을 만들고
   사용 API에 **네이버 아이디로 로그인**과 **카페**를 모두 추가해야 합니다.
   카페 API는 발행 대상 카페를 등록하는 절차가 있고, 카페 운영자 확인이 필요합니다.
   이게 안 되어 있으면 나머지가 다 준비돼도 발행이 안 됩니다.
   승인 전에는 `PUBLISH_DRY_RUN=true` 로 두고 파이프라인만 검증하세요.
2. **발행하는 회원 계정이 해당 카페의 멤버이고 글쓰기 가능 등급**이어야 합니다.
   미가입 회원은 API가 권한 오류를 냅니다.
3. **회원 전원이 네아로 연동을 한 번씩** 거쳐야 합니다. 앱 첫 화면에서 로그인 → 블로그 아이디 입력 →
   게시판 번호 입력, 3단계로 끝나게 만들어 두었습니다.

---

## 알아둘 제약

- 카페 글쓰기 API는 **이미지 첨부를 지원하지 않습니다.** 텍스트와 링크만 올라갑니다.
- **상품 게시판에는 이 API로 글을 쓸 수 없습니다.** 일반 게시판 menuid를 써야 합니다.
- 카페 글쓰기 API는 요청 본문을 **MS949(EUC-KR)로 인코딩**해야 합니다. UTF-8로 보내면 한글이 깨집니다.
  (`src/lib/naver.ts` 의 `encodeFormMs949` 에서 처리하고 있습니다.)
- 여러 계정이 같은 게시판에 짧은 간격으로 자동 글을 쓰면 **네이버 카페 자체 스팸 필터**에 걸릴 수 있습니다.
  `PUBLISH_SPACING_MS` 로 발행 간격을 두고, `DAILY_LIMIT_PER_MEMBER` 로 회원당 하루 건수를 제한합니다.

---

## 이 카페의 설정값 (cafe.naver.com/moonblog)

`CAFE_CLUB_ID=31635811`

게시판 목록 (`menuType=B` 만 글쓰기 가능):

| menuId | 게시판 | 비고 |
|---|---|---|
| **19** | 8월 블로그 챌린지 참여방 | **현재 발행 대상** |
| 16 / 15 / 13 / 11 / 9 / 4 / 2 | 7월 / 6월 / 5월 / 4월 / 3월 / 2월 / 1월 챌린지 참여방 | 지난 달 |
| 17 | 포스팅 공유방 | |
| 1 | 자유게시판 | |
| 3 | 출석체크 | |
| 7 | 블로그 노하우 공유 | |
| 12 | 스댓체 함께해요 | |
| 14 | 오프라인 강의 후기 | |
| 18 | 상품 공유방 | **상품게시판 — API로 글쓰기 불가** |
| 5 / 8 | 블로그 챌린지 🔥 / 꿀팁 나눠요 | 폴더(그룹). 게시판 아님 |

### ⚠️ 매달 게시판이 바뀝니다

이 카페는 달마다 새 챌린지 게시판을 만듭니다 (1월=2 → … → 7월=16 → 8월=19).

그래서 게시판 번호는 **회원별로 저장하지 않고 `CAFE_MENU_ID` 환경 변수 하나로** 관리합니다.
달이 바뀌면 Vercel 환경 변수에서 이 값 하나만 바꾸고 재배포하면 회원 전원에게 반영됩니다.
회원별로 저장했다면 매달 30명 전원을 갱신해야 합니다.

`members.target_menu_id` 컬럼은 남아 있지만, **특정 회원만 다른 게시판으로 보내야 할 때 쓰는 예외용**입니다.
비어 있으면(기본) `CAFE_MENU_ID` 를 씁니다.

덕분에 회원 온보딩은 **로그인 → 블로그 아이디 입력**, 두 단계로 끝납니다.

---

## 설치

```bash
npm install
```

### 1. Supabase

1. [supabase.com](https://supabase.com) 에서 프로젝트를 만듭니다.
2. SQL Editor에 `supabase/schema.sql` 을 통째로 붙여넣고 실행합니다.
3. Project Settings → API 에서 `Project URL` 과 `service_role` 키를 복사합니다.

`service_role` 키는 RLS를 우회하는 마스터 키입니다. 서버 라우트에서만 쓰고 절대 클라이언트에 노출하지 마세요.

### 2. 네이버 앱

1. [developers.naver.com/apps/#/register](https://developers.naver.com/apps/#/register) 에서 앱 등록
2. 사용 API에 **네이버 아이디로 로그인** + **카페** 추가
3. 서비스 URL과 Callback URL 등록
   - 로컬: `http://localhost:3000/api/auth/naver/callback`
   - 배포: `https://<your-app>.vercel.app/api/auth/naver/callback`
4. Client ID / Client Secret 복사

카페 clubid는 카페 관리 페이지 또는 모바일 카페 주소에서 확인할 수 있는 숫자입니다.

### 3. 환경 변수

`.env.example` 을 `.env.local` 로 복사하고 값을 채웁니다.

보안 키 3개는 이 명령으로 생성하세요.

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

`SESSION_SECRET`, `TOKEN_ENC_KEY`, `CRON_SECRET` 각각 따로 생성합니다.

### 4. 로컬 실행

```bash
npm run dev
```

http://localhost:3000 에서 로그인 → 블로그 아이디 저장 → **지금 한 번 실행** 을 눌러
RSS 감지 → Claude 문구 생성 → 발행까지 한 번에 확인합니다.

`PUBLISH_DRY_RUN=true` 면 실제 카페 발행 대신 기록만 남습니다. 카페 API 승인 전에는 이 상태로 두세요.

---

## 배포

```bash
vercel
```

Vercel 프로젝트 설정 → Environment Variables 에 `.env.example` 의 모든 항목을 넣습니다.
`NAVER_REDIRECT_URI` 는 배포 도메인 기준으로 바꾸고, 네이버 앱에도 같은 주소를 등록해야 합니다.

크론은 `vercel.json` 에 정의되어 있습니다. Vercel이 `/api/cron/poll` 을
`Authorization: Bearer $CRON_SECRET` 헤더와 함께 호출합니다.

### ⚠️ 폴링 주기는 Vercel 플랜에 묶여 있습니다

| 플랜 | 크론 최소 주기 | 시각 정밀도 | 함수 실행 시간 |
|---|---|---|---|
| **Hobby** | **하루 1회** | ±59분 | 60초 |
| **Pro** | 1분 | 분 단위 | 300초 |

Hobby에서 `*/10 * * * *` 같은 표현을 쓰면 **배포가 실패합니다**
(`Hobby accounts are limited to daily cron jobs`).

그래서 현재 `vercel.json` 은 **하루 1회(`0 21 * * *`, 한국시간 오전 6시)** 로 맞춰 두었습니다.
이 상태로는 "새 글이 올라오면 즉시 발행"이 아니라 **하루 한 번 몰아서 발행**입니다.

브리핑대로 5~10분 간격 실시간 감지를 하려면 **Pro 플랜으로 올린 뒤** 아래 한 줄만 바꾸면 됩니다.

```json
"schedule": "*/10 * * * *"
```

Pro로 올리면 `src/app/api/cron/poll/route.ts` 의 `maxDuration` 도 300까지 올릴 수 있어,
회원 수가 늘어도 한 번의 실행에서 더 많은 건을 처리할 수 있습니다.

---

## 구조

```
src/
  lib/
    env.ts        환경 변수 접근
    crypto.ts     토큰 AES-256-GCM 암복호화, 상수시간 비교
    session.ts    HMAC 서명 세션 쿠키
    supabase.ts   service_role 클라이언트, 타입
    naver.ts      네아로 OAuth, 토큰 갱신, 카페 글쓰기(MS949 인코딩)
    rss.ts        블로그 RSS 파싱, 아이디/URL 정규화
    claude.ts     카페용 제목·소개문구 생성
    pipeline.ts   감지 → 생성 → 발행 → 기록 전체 흐름
  app/
    page.tsx                    회원 온보딩 화면
    api/auth/naver/             네아로 로그인 시작 / 콜백
    api/me/                     내 설정 조회·저장
    api/run/                    본인 계정 수동 실행 (테스트용)
    api/cron/poll/              Vercel Cron 진입점
supabase/schema.sql             members / posts 테이블, RLS
```

## 중복 발행을 막는 3단 방어

1. `posts.blog_post_url` 유니크 제약 — DB 레벨 차단
2. 발행 전 이미 `success`/`dry_run` 인 URL은 후보에서 제외
3. URL 정규화 — `http`/`https`, `m.blog`/`blog`, 쿼리스트링 차이를 같은 글로 취급

첫 실행 때는 백로그 전체가 쏟아지지 않도록 **가장 최근 글 1건만** 잡습니다.
이후에는 7일 이내에 올라온 새 글만 대상으로 합니다.

## 남은 작업 (3단계)

- 운영자 대시보드: 회원별 발행 현황, 실패 로그, 활성/비활성 토글
- refresh token 만료 회원에게 재연동 안내
