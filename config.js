/* =============================================================================
 *  평가 숏리스트 확인 — 배포 설정
 *  -----------------------------------------------------------------------------
 *  아래 3개 값을 채운 뒤 GitHub Pages에 함께 올리세요.
 *  · SUPABASE_URL / SUPABASE_ANON_KEY : Supabase 프로젝트의 공개(anon) 정보입니다.
 *    (anon 키는 "공개용"으로 설계된 키라 깃에 올라가도 됩니다. service_role 키는 절대 넣지 마세요.)
 *  · SITE_PASSWORD : 사이트 진입 공통 암호. 빈 문자열("")이면 암호 없이 입장합니다.
 *    ※ 정적 사이트 특성상 소스를 열면 보이는 "간단한 가림막" 수준의 보호입니다.
 * ========================================================================== */
window.LLE_CONFIG = {
  SUPABASE_URL: "https://awiscsicvwvtgxrnwdce.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF3aXNjc2ljdnd2dGd4cm53ZGNlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAyNzc2MzEsImV4cCI6MjA5NTg1MzYzMX0.EKu9VpJwrGO3pC6umoXdWFYlXh4WXZh431LdlxM_h0M",
  SITE_PASSWORD: "@eportal/1" // 평가자 공통 암호. ""로 두면 암호 없음.
};
