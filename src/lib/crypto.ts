import crypto from 'node:crypto';
import { env } from './env';

/**
 * 네이버 토큰은 회원 계정을 대신 조작할 수 있는 민감 정보라
 * DB에 평문으로 두지 않고 AES-256-GCM으로 암호화해 저장합니다.
 * Supabase RLS가 뚫려도 TOKEN_ENC_KEY 없이는 못 씁니다.
 */

function key(): Buffer {
  const raw = Buffer.from(env.tokenEncKey, 'base64');
  if (raw.length !== 32) {
    throw new Error('TOKEN_ENC_KEY 는 32바이트 base64 여야 합니다. node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64\'))"');
  }
  return raw;
}

export function encryptToken(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString('base64'), tag.toString('base64'), enc.toString('base64')].join('.');
}

export function decryptToken(payload: string): string {
  const [ivB64, tagB64, dataB64] = payload.split('.');
  if (!ivB64 || !tagB64 || !dataB64) throw new Error('토큰 암호문 형식이 올바르지 않습니다.');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key(), Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]).toString('utf8');
}

/** 타이밍 공격에 안전한 문자열 비교 */
export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}
