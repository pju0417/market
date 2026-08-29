/**
 * 세션별 참가자 토큰 발급/조회 (Milestone 4 2단계: 로컬 폴링 서버).
 *
 * "같은 교실 반신뢰 환경에서 실수/장난 방지" 수준의 인증이다 — 프로덕션급 보안(TLS, 토큰
 * 만료/rotate)은 이번 범위가 아니다(architect 계획, docs/TODO.md Milestone 4 2단계).
 * `join`은 loose join이다: 같은 playerId로 여러 번 join해도 매번 새 토큰을 발급하고, 기존에
 * 발급된 토큰을 무효화하지 않는다 — 여러 탭/새로고침에서 같은 학생이 다시 들어와도 이전 탭이
 * 끊기지 않는다.
 */
import { randomUUID } from "node:crypto";
import type { ParticipantId } from "../types/domain.js";

export class TokenStore {
  /** token -> 그 토큰이 대표하는 학생의 PlayerState.id (companyId/storeId/householdId가 아니다). */
  private readonly tokenToPlayerId = new Map<string, ParticipantId>();

  issue(playerId: ParticipantId): string {
    const token = randomUUID();
    this.tokenToPlayerId.set(token, playerId);
    return token;
  }

  /** 토큰이 바인딩된 playerId. 존재하지 않는 토큰이면 undefined. */
  resolvePlayerId(token: string): ParticipantId | undefined {
    return this.tokenToPlayerId.get(token);
  }
}
