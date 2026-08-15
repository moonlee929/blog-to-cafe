import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: '블로그 → 카페 자동 발행',
  description: '내 네이버 블로그에 새 글이 올라오면 카페 게시판에 자동으로 소개글이 올라갑니다.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
