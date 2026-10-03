import { useState } from "react";

type Topic = "welcome" | "setup" | "company" | "store" | "household" | "results";
const GUIDES: Record<Topic, { title: string; intro: string; steps: string[]; note: string }> = {
  welcome: {
    title: "처음이라면 · 어떤 게임인가요?",
    intro: "물건을 만들고, 팔고, 사면서 돈과 물건이 어떻게 움직이는지 배우는 게임이에요. 한 사람이 기업과 가정의 선택을 모두 경험해요.",
    steps: ["내 기업의 공장: 물건을 만들어 다른 가게에 팔아요.", "내 기업의 가게: 다른 공장의 물건을 사 와서 소비자에게 팔아요.", "내 가정(가계): 예산 안에서 필요한 물건을 사고 만족도를 높여요."],
    note: "공장 → 가게 → 가정 → 결과 확인을 한 라운드라고 해요. 기본 7라운드 동안 선택과 결과를 비교해요. 처음에는 ‘혼자 하기’로 연습할 수 있어요. NPC는 컴퓨터가 운영하는 이웃이에요.",
  },
  setup: {
    title: "처음이라면 · 무엇부터 정하나요?",
    intro: "공장과 가게는 모두 기업이에요. 만들 물건과 팔 물건, 두 건물의 위치를 정해요.",
    steps: ["생산 품목은 공장에서 만들 물건, 판매 업종은 가게에서 팔 물건이에요.", "위치에 따라 임대료와 운송비가 달라져요. 지도에서 거리를 확인할 수 있어요.", "고르기 어렵다면 지금 선택된 값으로 시작해도 괜찮아요."],
    note: "내 공장 물건을 내 가게가 사거나, 내 가게 물건을 내 가정이 사는 거래는 할 수 없어요. 다른 참가자나 NPC와 거래해요. 공장·가게·가정의 돈은 각각 관리해요.",
  },
  company: {
    title: "처음이라면 · 공장은 이렇게 운영해요",
    intro: "이번에는 물건을 만드는 차례예요. 만든 물건은 도매시장에 나오고 다른 가게가 골라 사요.",
    steps: ["생산량: 몇 개 만들지 정해요. 만든 물건이 모두 팔리는 것은 아니에요.", "품질과 판매 가격: 물건의 품질과 가게에 팔 개당 가격을 정해요.", "‘생산 예정’ 금액과 남는 돈을 확인한 뒤 ‘생산 계획 확정 · 턴 종료’를 눌러요."],
    note: "도매는 가게에 물건을 파는 거래예요. 처음에는 기본 설정을 살펴보고 시작해도 돼요. 고민될 때는 ‘비서 의견 보기’를 열어 선택의 장단점을 비교해요.",
  },
  store: {
    title: "처음이라면 · 가게는 이렇게 운영해요",
    intro: "이번에는 물건을 사 와서 파는 차례예요. 매입은 ‘가게에서 팔 물건을 사 오는 것’이에요.",
    steps: ["지난 보고서와 현재 재고를 확인해요. 물건이 남았다면 더 살 필요가 있는지 생각해요.", "가격·품질을 비교해 장바구니에 담고 결제해요. 담기만 하면 구매되지 않아요.", "소비자에게 팔 가격을 정해요. 준비를 마쳤다면 별도의 ‘턴 종료’를 눌러요."],
    note: "소매는 소비자에게 파는 거래예요. 결제 후에도 같은 턴에 추가 매입할 수 있어요. 물건을 너무 비싸게 팔면 남을 수 있고, 너무 싸게 팔면 비용을 회수하기 어려울 수 있어요.",
  },
  household: {
    title: "처음이라면 · 가정에서는 이렇게 장을 봐요",
    intro: "이번에는 소비자예요. 쓸 수 있는 돈 안에서 필요한 물건을 고르고 만족도를 살펴봐요.",
    steps: ["상품 종류를 바꾸며 가격과 예상 만족도를 비교해요.", "물건을 장바구니에 담고 합계와 남는 돈을 확인한 뒤 결제해요.", "한 라운드에 총 6개까지 살 수 있어요. 장보기를 마치면 ‘턴 종료’를 눌러요."],
    note: "만족도는 평균 품질과 필요한 종류를 샀는지에 따라 달라져요. 많이 산다고 무조건 높아지지는 않아요. 판매 중인 식품·의류를 사지 않으면 감점이 있어요. 안 쓴 돈은 저축으로 남아요.",
  },
  results: {
    title: "처음이라면 · 결과는 이렇게 읽어요",
    intro: "잘된 선택과 아쉬운 선택을 찾아 다음 라운드에 바꿔 보세요.",
    steps: ["매출은 물건을 팔아 받은 돈이에요. 손익은 매출에서 이번 라운드에 쓴 돈을 뺀 결과예요.", "손익이 음수라면 쓴 돈이 더 많았다는 뜻이에요. 재고가 남아 있는지도 함께 확인해요.", "가정은 만족도와 저축을 함께 살펴봐요. 확인을 마치면 다음 라운드로 넘어가요."],
    note: "여러 사람과 할 때는 현재 차례의 참가자 모두 턴을 마칠 때까지 기다려요. 교사가 제한시간을 설정하거나 직접 다음 단계로 넘길 수도 있어요.",
  },
};

export function BeginnerGuide({ topic }: { topic: Topic }) {
  const key = `economy-guide-v1:${topic}`;
  const [open, setOpen] = useState(() => { try { return localStorage.getItem(key) !== "read"; } catch { return true; } });
  const guide = GUIDES[topic];
  function toggle(next: boolean) {
    setOpen(next);
    if (!next) { try { localStorage.setItem(key, "read"); } catch { /* Guidance also works without storage. */ } }
  }
  return <section className="beginner-guide" aria-label={guide.title}>
    <button type="button" className="beginner-guide-toggle" aria-expanded={open} onClick={() => toggle(!open)}>🧭 {guide.title}<span aria-hidden="true">{open ? "−" : "+"}</span></button>
    {open && <div className="beginner-guide-body"><p>{guide.intro}</p><ol>{guide.steps.map(step => <li key={step}>{step}</li>)}</ol><p className="beginner-guide-note">{guide.note}</p><button type="button" className="secondary" onClick={() => toggle(false)}>알겠어요 · 설명 접기</button></div>}
  </section>;
}
