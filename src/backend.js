import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Supabase 환경 변수가 있으면 실제 Google 로그인과 DB 연결에 사용할 클라이언트.
// 문서 CRUD는 백엔드와 schema.sql의 테이블/RLS 정책을 합의한 뒤 연결하세요.
export const supabase = url && anonKey ? createClient(url, anonKey) : null;
export const isSupabaseConfigured = Boolean(supabase);

export async function signInWithGoogle() {
  if (!supabase) throw new Error('Supabase 환경 변수를 먼저 설정해 주세요.');
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin }
  });
  if (error) throw error;
}

export async function signOut() {
  if (!supabase) return;
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}
