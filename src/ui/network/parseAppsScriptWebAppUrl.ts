/**
 * 교사/학생이 입력한 Apps Script Web App URL 문자열을 검증하는 순수 함수 (Milestone 5 3부
 * 화면 배선). 완전한 URL 형식 검증을 노리지 않는다 — `https://`로 시작하는지만 확인하는
 * 소프트 체크이고, `.../exec` 접미사는 필수로 강제하지 않는다(호출부가 원하면 경고 문구를
 * 별도로 보여줄 수 있게 `looksLikeExecUrl`을 따로 노출한다).
 */
export type ParseAppsScriptWebAppUrlResult = { ok: true; url: string } | { ok: false; reason: string };

export function parseAppsScriptWebAppUrl(input: string): ParseAppsScriptWebAppUrlResult {
  const trimmed = input.trim();
  if (trimmed.length === 0) {
    return { ok: false, reason: "URL을 입력해주세요." };
  }
  if (!trimmed.startsWith("https://")) {
    return { ok: false, reason: "https://로 시작하는 주소여야 해요." };
  }
  return { ok: true, url: trimmed };
}

/** `.../exec`로 끝나지 않으면 경고 문구를 보여줄 때 쓰라고 노출하는 보조 함수 — 필수 검증이
 * 아니라 안내용이다(교사가 배포 URL 뒤에 실수로 슬래시를 붙이는 등의 경우까지 막지 않는다). */
export function looksLikeExecUrl(url: string): boolean {
  return url.endsWith("/exec");
}
