/**
 * 결정론적 의사난수 생성기. NPC/시뮬레이션은 "규칙 기반 + 제한적 확률"이어야 하며
 * (docs/NPC_DESIGN.md), 같은 시드로는 항상 같은 결과가 나와야 시뮬레이션 테스트가
 * 재현 가능하다. Math.random()을 economy/npc 로직에서 직접 사용하지 않는다.
 */
export type Rng = () => number;

/** mulberry32 — 작고 빠른 32비트 시드 PRNG. 암호학적 용도가 아님. */
export function createRng(seed: number): Rng {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** [min, max) 범위의 실수. */
export function rngRange(rng: Rng, min: number, max: number): number {
  return min + rng() * (max - min);
}

/** 배열에서 결정론적으로 하나를 고른다. */
export function rngPick<T>(rng: Rng, items: readonly T[]): T {
  const item = items[Math.floor(rng() * items.length)];
  if (item === undefined) {
    throw new Error("rngPick called with an empty array");
  }
  return item;
}

/**
 * Fisher-Yates 셔플(원본 불변). 가게/가계가 시장에서 매물을 두고 경쟁할 때 특정 참여자가
 * 항상 먼저 고르는 구조적 편향이 생기지 않도록, 매 라운드 참여 순서를 섞는 데 쓴다.
 */
export function shuffle<T>(rng: Rng, items: readonly T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const temp = result[i]!;
    result[i] = result[j]!;
    result[j] = temp;
  }
  return result;
}
