import { NextResponse, type NextRequest } from 'next/server';
import { clearSession } from '@/lib/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  await clearSession();
  return NextResponse.redirect(new URL('/', req.url), { status: 303 });
}
