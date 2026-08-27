import { useState } from "react";
import { DISTRICT_IDS, PRODUCT_CATEGORIES } from "../../economy/config.js";
import type { BusinessSetupChoices } from "../../multiplayer/GameSession.js";
import { CATEGORY_LABELS, DISTRICT_LABELS } from "../labels.js";

interface Props {
  onStart: (choices: BusinessSetupChoices) => void;
}

/** 창업 준비 (사전 단계): 기업/가게의 상권과 업종을 사람이 처음으로 직접 고른다 (D-010). */
export function SetupScreen({ onStart }: Props) {
  const [companyDistrictId, setCompanyDistrictId] = useState(DISTRICT_IDS[0]!);
  const [companyCategoryId, setCompanyCategoryId] = useState(PRODUCT_CATEGORIES[0]!);
  const [storeDistrictId, setStoreDistrictId] = useState(DISTRICT_IDS[1]!);
  const [storeCategoryId, setStoreCategoryId] = useState(PRODUCT_CATEGORIES[0]!);

  return (
    <div className="card">
      <h2>창업 준비</h2>
      <p style={{ color: "#6b7280", fontSize: 14 }}>
        기업과 가게의 위치, 업종을 정해요. 기업에 좋은 위치와 가게에 좋은 위치는 서로 달라요.
      </p>

      <h3>기업</h3>
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

      <h3>가게</h3>
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

      <button
        className="primary"
        onClick={() =>
          onStart({ companyDistrictId, companyCategoryId, storeDistrictId, storeCategoryId })
        }
      >
        게임 시작
      </button>
    </div>
  );
}
