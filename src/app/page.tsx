'use client';

import { useCallback, useEffect, useState } from 'react';

type PostRow = {
  blog_title: string | null;
  cafe_title: string | null;
  cafe_article_url: string | null;
  status: 'success' | 'failed' | 'dry_run';
  error_message: string | null;
  published_at: string | null;
  created_at: string;
};

type MeResponse = {
  loggedIn: boolean;
  member?: {
    nickname: string | null;
    blogId: string | null;
    targetMenuId: string | null;
    dailyPostCount: number;
    lastCheckedAt: string | null;
    lastError: string | null;
  };
  posts?: PostRow[];
};

const STATUS_LABEL: Record<PostRow['status'], string> = {
  success: '발행 완료',
  failed: '실패',
  dry_run: '테스트(미발행)',
};

export default function Home() {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [blogId, setBlogId] = useState('');
  const [menuId, setMenuId] = useState('');
  const [msg, setMsg] = useState<{ text: string; error: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch('/api/me');
    if (res.status === 401) {
      setMe({ loggedIn: false });
      return;
    }
    const data = (await res.json()) as MeResponse;
    setMe(data);
    setBlogId(data.member?.blogId ?? '');
    setMenuId(data.member?.targetMenuId ?? '');
  }, []);

  useEffect(() => {
    const err = new URLSearchParams(window.location.search).get('error');
    if (err) {
      setMsg({ text: err, error: true });
      window.history.replaceState({}, '', window.location.pathname);
    }
    void load();
  }, [load]);

  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch('/api/me', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blogId, targetMenuId: menuId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? '저장에 실패했습니다.');
      setMsg({ text: '저장했습니다. 이제 블로그에 새 글이 올라오면 자동으로 카페에 소개글이 올라갑니다.', error: false });
      await load();
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : String(e), error: true });
    } finally {
      setBusy(false);
    }
  }

  async function runNow() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch('/api/run', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? '실행에 실패했습니다.');

      const outcomes = (data.members?.[0]?.outcomes ?? []) as Array<{ status: string; error?: string }>;
      if (outcomes.length === 0) {
        setMsg({ text: '새로 올라온 글이 없습니다.', error: false });
      } else {
        const failed = outcomes.filter((o) => o.status === 'failed');
        setMsg({
          text:
            failed.length > 0
              ? `${outcomes.length}건 처리 중 ${failed.length}건 실패: ${failed[0].error}`
              : `${outcomes.length}건 처리했습니다${data.dryRun ? ' (테스트 모드라 실제 발행은 하지 않았습니다)' : ''}.`,
          error: failed.length > 0,
        });
      }
      await load();
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : String(e), error: true });
    } finally {
      setBusy(false);
    }
  }

  if (!me) {
    return (
      <main>
        <p className="lede">불러오는 중…</p>
      </main>
    );
  }

  if (!me.loggedIn) {
    return (
      <main>
        <h1>블로그 → 카페 자동 발행</h1>
        <p className="lede">
          네이버 아이디로 로그인하고 블로그를 등록하면, 새 글이 올라올 때마다 카페 지정 게시판에 소개글이 자동으로
          올라갑니다.
        </p>
        <div className="card">
          <p style={{ margin: '0 0 16px' }}>
            비밀번호는 받지 않습니다. 네이버 공식 인증(네아로)만 사용합니다.
          </p>
          <a href="/api/auth/naver">
            <button className="btn-primary">네이버 아이디로 로그인</button>
          </a>
        </div>
        {msg && <p className={`msg ${msg.error ? 'error' : ''}`}>{msg.text}</p>}
      </main>
    );
  }

  const m = me.member!;

  return (
    <main>
      <h1>블로그 → 카페 자동 발행</h1>
      <p className="lede">{m.nickname ?? '회원'} 님, 안녕하세요.</p>

      <div className="card">
        <div className="field">
          <label htmlFor="blogId">네이버 블로그 아이디</label>
          <input
            id="blogId"
            type="text"
            value={blogId}
            onChange={(e) => setBlogId(e.target.value)}
            placeholder="moonsaboo"
            autoComplete="off"
          />
          <p className="hint">blog.naver.com/ 뒤에 오는 아이디입니다. 블로그 주소를 통째로 붙여넣어도 됩니다.</p>
        </div>

        <div className="field">
          <label htmlFor="menuId">카페 게시판 번호 (menuid)</label>
          <input
            id="menuId"
            type="text"
            value={menuId}
            onChange={(e) => setMenuId(e.target.value)}
            placeholder="15"
            inputMode="numeric"
            autoComplete="off"
          />
          <p className="hint">운영자가 안내한 게시판 번호를 입력하세요.</p>
        </div>

        <div className="row">
          <button className="btn-primary" onClick={save} disabled={busy}>
            저장
          </button>
          <button className="btn-secondary" onClick={runNow} disabled={busy}>
            지금 한 번 실행
          </button>
          <form action="/api/auth/logout" method="post" style={{ marginLeft: 'auto' }}>
            <button className="btn-secondary" type="submit">
              로그아웃
            </button>
          </form>
        </div>

        {msg && <p className={`msg ${msg.error ? 'error' : ''}`}>{msg.text}</p>}
      </div>

      {m.lastError && (
        <p className="msg error">최근 오류: {m.lastError}</p>
      )}

      <h2>최근 발행 기록</h2>
      {me.posts && me.posts.length > 0 ? (
        <table>
          <thead>
            <tr>
              <th>원문</th>
              <th>카페 제목</th>
              <th>상태</th>
            </tr>
          </thead>
          <tbody>
            {me.posts.map((p, i) => (
              <tr key={i}>
                <td>{p.blog_title ?? '-'}</td>
                <td>
                  {p.cafe_article_url ? (
                    <a href={p.cafe_article_url} target="_blank" rel="noreferrer">
                      {p.cafe_title ?? '보기'}
                    </a>
                  ) : (
                    (p.cafe_title ?? '-')
                  )}
                </td>
                <td>
                  <span className={`status-${p.status}`}>{STATUS_LABEL[p.status]}</span>
                  {p.error_message && <div className="hint">{p.error_message}</div>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="hint">아직 발행 기록이 없습니다.</p>
      )}
    </main>
  );
}
