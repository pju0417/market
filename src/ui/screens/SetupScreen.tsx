import { useState } from "react";
import { DISTRICT_IDS, PRODUCT_CATEGORIES } from "../../economy/config.js";
import type { BusinessSetupChoices, SubmissionTimeoutSettings } from "../../multiplayer/GameSession.js";
import { CATEGORY_LABELS, DISTRICT_LABELS } from "../labels.js";

interface Props {
  onStart: (choices: BusinessSetupChoices, timeoutSettings?: SubmissionTimeoutSettings) => void;
}

/**
 * 창업 준비 (사전 단계): 기업/가게의 상권과 업종을 사람이 처음으로 직접 고른다 (D-010).
 *
 * 구매 매칭 알고리즘 재설계 Stage 2: "고급 설정"(기본 닫힘)에서 제출 제한시간을 켤 수
 * 있다. 로컬 1인 플레이는 지금까지 시간 제한 자체가 없었으므로, 기본값은 꺼짐이다
 * (`GameSession.DEFAULT_LOCAL_SUBMISSION_TIMEOUT_SETTINGS`와 동일한 하위호환 기본값 —
 * 아무것도 안 건드리면 `onStart`에 `timeoutSettings`를 아예 넘기지 않아 그 기본값이 그대로
 * 쓰인다).
 */
export function SetupScreen({ onStart }: Props) {
  const [companyDistrictId, setCompanyDistrictId] = useState(DISTRICT_IDS[0]!);
  const [companyCategoryId, setCompanyCategoryId] = useState(PRODUCT_CATEGORIES[0]!);
  const [storeDistrictId, setStoreDistrictId] = useState(DISTRICT_IDS[1]!);
  const [storeCategoryId, setStoreCategoryId] = useState(PRODUCT_CATEGORIES[0]!);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [timeoutEnabled, setTimeoutEnabled] = useState(false);
  const [timeoutSeconds, setTimeoutSeconds] = useState(120);
  const [npcGraduatedEntryEnabled, setNpcGraduatedEntryEnabled] = useState(true);

  return (
    <div className="card">
      <h2 className="card-title">
        <span className="role-icon" aria-hidden="true">🚀</span> 창업 준비
      </h2>
      <p className="muted-text">
        기업과 가게의 위치, 업종을 정해요. 기업에 좋은 위치와 가게에 좋은 위치는 서로 달라요.
      </p>

      <h3>🏭 기업</h3>
      <label className="field">
        <span className="field-label">위치</span>
        <select value={companyDistrictId} onChange={(e) => setCompanyDistrictId(e.target.value as typeof companyDistrictId)}>
          {DISTRICT_IDS.map((id) => (
            <option key={id} value={id}>
              {DISTRICT_LABELS[id]}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span className="field-label">생산 품목</span>
        <select value={companyCategoryId} onChange={(e) => setCompanyCategoryId(e.target.value as typeof companyCategoryId)}>
          {PRODUCT_CATEGORIES.map((id) => (
            <option key={id} value={id}>
              {CATEGORY_LABELS[id]}
            </option>
          ))}
        </select>
      </label>

      <h3>🏪 가게</h3>
      <label className="field">
        <span className="field-label">위치</span>
        <select value={storeDistrictId} onChange={(e) => setStoreDistrictId(e.target.value as typeof storeDistrictId)}>
          {DISTRICT_IDS.map((id) => (
            <option key={id} value={id}>
              {DISTRICT_LABELS[id]}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span className="field-label">판매 업종</span>
        <select value={storeCategoryId} onChange={(e) => setStoreCategoryId(e.target.value as typeof storeCategoryId)}>
          {PRODUCT_CATEGORIES.map((id) => (
            <option key={id} value={id}>
              {CATEGORY_LABELS[id]}
            </option>
          ))}
        </select>
      </label>

      <button className="ghost" onClick={() => setAdvancedOpen((prev) => !prev)}>
        고급 설정 {advancedOpen ? "▾" : "▸"}
      </button>
      {advancedOpen && (
        <div className="auto-fill-section">
          <label className="field">
            <span className="field-label">
              <input type="checkbox" checked={timeoutEnabled} onChange={(e) => setTimeoutEnabled(e.target.checked)} /> 제출
              제한시간 사용
            </span>
          </label>
          {timeoutEnabled && (
            <label className="field">
              <span className="field-label">제출 제한시간 (초)</span>
              <input
                type="number"
                min={30}
                value={timeoutSeconds}
                onChange={(e) => setTimeoutSeconds(Math.max(30, Number(e.target.value)))}
              />
            </label>
          )}
          {timeoutEnabled && (
            <label className="field">
              <span className="field-label">
                <input
                  type="checkbox"
                  checked={npcGraduatedEntryEnabled}
                  onChange={(e) => setNpcGraduatedEntryEnabled(e.target.checked)}
                />{" "}
                NPC가 시간 지나면 차례로 끼어들게 하기
              </span>
            </label>
          )}
        </div>
      )}

      <button
        className="primary"
        onClick={() =>
          onStart(
            { companyDistrictId, companyCategoryId, storeDistrictId, storeCategoryId },
            { enabled: timeoutEnabled, timeoutMs: Math.max(30, timeoutSeconds) * 1000, npcGraduatedEntryEnabled },
          )
        }
      >
        게임 시작
      </button>
    </div>
  );
}
