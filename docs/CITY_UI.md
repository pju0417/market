# 도시형 경제 게임 화면

## 조작

- 게임에 들어가면 아이소메트릭 마을이 나타납니다.
- 주황 기업, 초록 가게, 보라 주택을 누르면 경영 패널을 엽니다. 하단 역할 버튼이나 상단 자금 버튼으로도 접근할 수 있습니다.
- 현재 차례의 건물에는 ‘지금 할 일’ 표시가 나타납니다. 다른 건물에서는 현재 자금과 상태를 확인합니다.
- 생산량은 숫자 또는 슬라이더로 조절합니다. 결정을 제출하면 기존 경제 엔진이 다음 단계로 진행합니다.
- 패널을 닫거나 다른 건물을 둘러봐도 같은 차례의 미제출 입력은 유지합니다. Escape로 패널을 닫을 수 있습니다.
- 지도를 확대하고 드래그·스크롤로 이동할 수 있습니다. ‘기본 보기’는 배율과 스크롤 위치를 초기화합니다. 작은 화면에서는 지도 옆으로 이동하거나 하단 버튼으로 건물을 선택합니다.
- 시장 보기에서 도매·소매 매물의 품목별 공급량과 최저 단가를 확인합니다. 전체 현황이므로 자기 매물도 포함되지만 실제 거래의 자기 거래 금지는 기존 결정 화면과 엔진이 그대로 적용합니다.
- 라운드 결과는 보고서 패널로 열리며 다음 라운드 진행 버튼을 제공합니다.

## 구현 범위

CityGameLayout을 로컬, 자체 서버 네트워크, Apps Script 네트워크의 공용 화면으로 사용합니다. 모든 학생과 NPC의 기업·가게·집은 서버가 저장하는 동일한 필지 좌표에 표시됩니다. 플레이어 찾기로 소유 건물을 강조하고 다른 플레이어의 건물을 선택해 월세와 내 구매 건물까지의 경로를 확인합니다. 로비에서 지역을 정하면 필지가 배정되고 게임 중 위치는 유지됩니다. 자유 건설·도로 편집·실시간 차량 이동·3D 카메라는 아직 지원하지 않습니다.

## 공간 경제 규칙

- 도로 한 구간을 한 블록으로 계산합니다. 운송 경로는 거리와 혼잡을 합산한 비용이 가장 작은 길이며, 양쪽 건물 진입로를 합쳐 한 블록을 추가합니다.
- 개당 도매 운송비 = 0.25 + 0.08 × 혼잡을 반영한 경로 길이. 소매는 0.15 + 0.04 × 길이. 소수점 둘째 자리로 반올림합니다.
- 운송비는 구매자가 지불하며 판매자는 상품값만 받습니다. 구매 예산·자동 구매·NPC도 같은 규칙을 사용합니다. 기존 판매자 정액 유통비와 중복 차감하지 않습니다.
- 도로별 지난 라운드 운송 수량 / 24를 혼잡도로 사용하며 최대 2입니다. 한 구간의 비용은 1 + 혼잡도입니다. 이번 라운드의 견적은 고정되어 제출 순서 때문에 바뀌지 않습니다. 실제 거래가 다음 라운드 교통에 반영됩니다.
- 월세 = 역할별 기본 월세 × 지역 배율 × (0.8 + 0.3 × 중심 접근성 + 0.15 × 주변 밀도) / (1 + 0.08 × 주변 혼잡). 중앙과 가까울수록, 주변 건물이 많을수록 높고 정체가 심하면 낮아집니다. 상세 패널에서 계산 근거를 봅니다.
- 주택 기본 월세는 8원이며 매 라운드 소득 지급 후 공제합니다. 기업·가게의 인건비는 별도입니다. 결과 화면에서 실제 월세와 운송비를 확인합니다.
- 이전 저장 데이터는 기존 비용 규칙을 유지합니다. 공간 경제를 이용하려면 업데이트 후 새 게임/새 온라인 방을 만드세요.

## 배포

프런트엔드와 서버의 경제 규칙을 함께 변경했습니다. GitHub의 master 또는 main에 변경을 반영하면 기존 Pages 워크플로가 화면을 빌드합니다. Apps Script 방식은 `npm run build:apps-script`로 만든 서버 코드도 업데이트하고 기존 웹 앱 배포를 새 버전으로 갱신해야 합니다. 자세한 절차는 `docs/APPS_SCRIPT_DEPLOYMENT.md`를 따릅니다. 자체 Node 서버는 새 코드로 재시작합니다. 운영 배포는 이 작업에서 수행하지 않았습니다.

## 그래픽

- `src/ui/assets/city-map-v1.png`: GPT 내장 image_gen으로 생성한 도시 컨셉 원본. 실제 공유 지도는 공간 좌표에 맞춰 SVG로 그립니다.
- `src/ui/SpatialCityMap.tsx`: 실제 필지, 소유자, 도로 혼잡, 운송 경로.
- `src/economy/city.ts`: 공용 위치·월세·경로·운송비 계산.
- `src/ui/CityGameLayout.tsx`: 건물 선택, HUD, 경영 패널, 시장 요약.
- `src/ui/CityGameLayout.css`: 데스크톱 / 작은 화면 레이아웃.
- 기존 역할 PNG 3종을 경영 패널에서 재사용합니다.

### 도시 지도 제작 프롬프트

Use case: stylized-concept. Asset type: interactive isometric city map background for elementary-school economic strategy game. A beautiful polished cozy miniature town viewed from elevated isometric camera, like a handcrafted city builder board, landscape 1536x1024. Entire town visible. A winding turquoise river along far upper edge with small bridge, rich grassy landscape, neat cream paved roads forming connected town blocks, many small trees, little parks and flower beds, soft shadows. Three prominent distinct clickable landmark buildings separated with clear space: LEFT at x=25%,y=48% a large orange-roof production workshop with crates and delivery yard; CENTER at x=51%,y=57% a large green-striped awning market shop with colorful fruit stalls; RIGHT at x=77%,y=43% a large lavender-roof family home with garden. Background contains a few smaller cream homes and a small school near top, foreground contains a small public park and paths. No close foreground buildings obstructing landmarks. Generous grass margin around edge, full roofs and buildings entirely visible. Warm sophisticated storybook clay-rendered 3D, clean soft forms, crisp detail at game map scale, mint greens, pastel apricot, warm ivory, turquoise water, sunlit daytime. Orthographic isometric city-builder camera, no horizon, no giant characters. No text, labels, letters, numbers, UI, borders, panels, floating symbols, watermarks or logos. This is playable map artwork not a promotional poster.

## 에셋 적용 개선

기존 GPT 생성 공방·가게·주택 그림을 참조해 `city-buildings-v2.png` 투명 스프라이트 시트를 만들었습니다. 지도는 이 그림을 필지별로 잘라 사용하며, 원본 역할 그림은 자금 표시와 경영 패널에 적용합니다. 기존 도시 그림은 주변 배경으로 사용합니다. 실제 거래 경로는 전경의 격자 도로입니다. 내 건물의 이름은 계속 표시하고 다른 건물의 이름은 선택·포커스·마우스 올리기 때 표시합니다.

## 원화 직접 매핑 지도 (신규 게임)

이제 새 게임은 `city-map-v1.png` 자체를 플레이 지도로 사용합니다. 격자판이나 반복 건물을 덧씌우지 않습니다. 그림에 있는 공방 1곳·시장 1곳·주택 9채에 참가자를 한 명씩 배정하며, 학교·공원 등은 공공 배경입니다. 지역별 수용량이 부족하면 같은 원화를 사용하는 별도의 마을 구역을 만듭니다. 구역 선택과 건물 찾기로 모든 플레이어/NPC를 조회할 수 있습니다. 아직 구역마다 서로 다른 확장 원화를 생성한 것은 아닙니다.

`src/economy/artworkCity.ts`의 좌표는 1536×1024 원화 기준 건물 출입구·도로 교차로를 지정합니다. 같은 구역의 도로 길이는 그림 100픽셀을 1블록으로 환산하고, 인접 마을의 다리 연결은 5블록으로 계산합니다. 도로별 지난 라운드 통행량을 같은 경로 계산과 교통 오버레이에서 사용합니다. 이전 격자 저장 게임의 규칙은 보존하며, 원화 지도는 새 게임/새 방에서 적용합니다. 서버 경제 코드도 함께 재배포해야 합니다.

## 하나의 연속 도시 화면

모든 원화 구역을 한 SVG 세계 좌표에 동시에 배치합니다. 구역을 고르면 화면 내용을 교체하지 않고 카메라(스크롤)를 해당 위치로 이동합니다. 마우스 드래그·스크롤·25~200% 확대 축소로 도시를 탐색합니다. 건물 찾기와 내 역할 버튼도 해당 위치로 이동합니다. 구역 연결 도로는 서버의 순차 구역 연결과 동일하며, 선택된 거래가 구역을 넘으면 연결 도로에도 경로를 표시합니다. 현재는 동일한 원화를 구역마다 재사용하므로 경계가 보입니다. 서로 다른 구역 원화와 자연스러운 경계 합성은 별도 작업입니다.

## 통합 도시 v3 — 현재 신규 게임

위의 반복 마을 방식은 이전 저장 게임 호환용으로만 남깁니다. 신규 게임/신규 온라인 방은 GPT 내부 이미지 생성으로 제작한 `metropolis-v3.png` **한 장만** 지도에 표시합니다. 학교 주변·주택가·중심상권·고급상권·공업지역·외곽을 같은 좌표계 안에서 구분하며, 강과 거리와 공원이 끊기지 않습니다.

- `src/economy/metropolisCity.ts`: 6개 구역, 42개 실제 그림 건물, 도로 교차로와 건물 진입로, 결정론적 주소 배정.
- 모든 참가자/NPC의 기업·가게·집은 선택한 상권에 배정됩니다. 건물 수보다 입주자가 많으면 호실을 나눕니다. 같은 건물의 입주자는 같은 출입구를 공유하며 각자의 자산과 역할은 분리됩니다.
- `src/ui/MetropolisMap.tsx`: 단일 원화, 건물 선택, 입주자 선택, 구역 경계 표시, 도로 혼잡 표시, 거래 경로. 건물 찾기와 구역 이동은 같은 지도 안에서 카메라만 이동합니다.
- 그림 100픽셀을 1블록으로 환산하는 거리 모델입니다. 원화 위에 수작업 등록한 도로망과 짧은 진입로를 따라 비용을 계산합니다. 실제 GIS 거리나 실시간 차량 시뮬레이션은 아닙니다.
- 기존 격자/반복 마을 저장 게임의 경제 조건을 도중에 바꾸지 않습니다. 신규 도시를 사용하려면 새 게임/새 방으로 시작합니다.
- 로컬 1/5/20/40명 7라운드와 주소 저장·복원을 검증했습니다. Sheets 셀 크기 한도는 20명까지 검증했습니다. 40명 상태는 50,000자를 넘을 수 있어 대규모 Apps Script 수업에는 별도 분할 저장이 필요합니다.
- GitHub Pages 프런트엔드와 Apps Script 서버 번들을 함께 배포해야 온라인 방에도 새 도시 좌표와 비용이 일치합니다. 이번 작업은 로컬 적용/빌드이며 원격 배포는 하지 않았습니다.

검증: 타입 검사, ESLint, 전체 648개 테스트, 프런트엔드/Apps Script 번들 빌드 통과. 기존 경제 검증·smoke 시뮬레이션은 Windows tsx 사용자정보 조회 오류를 피해 같은 스크립트를 esbuild로 번들한 후 실행했습니다. 신규 도시 자체는 별도의 7라운드 회귀 테스트로 검증합니다.

## 플레이 편의성 1차 개선

현재 차례가 바뀌면 해당 결정 패널을 자동으로 열고 스크롤을 위로 돌립니다. 지도나 시장을 조회해도 입력 폼은 마운트 상태를 유지하며, ‘내 결정으로 돌아가기’로 복귀합니다. 구매 차례의 시장 바로가기는 상품 비교·구매 패널로 바로 연결됩니다.

결정 항목을 앞에 두고 자금·재고·입지 비용·광고와 업종 변경은 펼쳐보는 상세 영역으로 이동했습니다. 모든 역할의 예상 지출·잔액·제출 버튼을 패널 하단에 고정했습니다. 가게는 판매가격, 기업은 생산량·품질·판매가격도 제출 영역에서 다시 확인합니다.

가게와 가계에서 거래처 이름, 운송비 포함 도착 가격, 상품값/운송비 내역을 함께 표시하며 가격·품질 순으로 비교할 수 있습니다. 정렬은 화면 표시 순서만 바꾸며 자동배분 기준은 기존 설정을 따릅니다. 가계 구매는 품목별 버튼으로 전환하며 다른 품목의 선택은 유지합니다. 담기·수량 변경·빼기는 총 구매 목표에도 반영합니다. 총 구매 목표를 추가로 올린 부분은 기존 규칙대로 자동배분됩니다. 실제 거래·비용 계산은 기존 엔진을 유지합니다.

브라우저에서 기업→가게→가계→정산, 화면 이동 후 초안 유지, 상품 담기/빼기와 예산 갱신, 품목 전환 후 선택 유지 확인. 이번 범위는 결정 패널과 구매 동선 개선이며, 지도 건물에서 직접 담기와 온라인 대기 현황의 새 디자인은 별도입니다.

## 현대식 도시 원화 v4

GPT 내부 image_gen 편집 도구로 metropolis-v3.png를 참조하여 metropolis-modern-v4.png를 제작하고 지도 참조를 교체했습니다. 회색 아스팔트, 현대식 저층 주택·상가·학교·공장으로 바꿨습니다. 기존의 낮은 밝기·채도 CSS 보정을 유지합니다. 학교길 2 건물의 표시 중심은 새 원화 학교동 위치로 조정하고 기존 저장 데이터의 주소·도로 계산 좌표는 유지했습니다.

최종 생성 프롬프트: Edit the existing playable 1536x1024 isometric city map. Preserve building footprints and centers, street alignments, rivers, bridges, fountain, gardens and farmland. Replace medieval European architecture in place with contemporary Korean low-rise concrete/brick homes, mixed-use shops, primary school, light industrial workshops and practical farm buildings. Recolor vehicle roads muted medium-dark slate-gray asphalt with restrained markings and distinct sidewalks. Calm low-to-moderate saturation, soft daylight, no glaring highlights, labels or UI. Keep a single continuous city and existing camera framing.
학교 캠퍼스 수정: 건물 인덱스 0·1을 신규 입주 대상에서 제외하고 지도에는 학교·공공시설로 표시합니다. 이전 metropolis 저장 게임을 resumeFromState로 불러올 때 해당 입주자를 학교길 3~5의 빈 호실로 옮기며 위치도 갱신합니다. 기존 비용 내역과 교통 기록은 보존합니다. 기존 v4 학교길 2 표시 위치 보정은 제거했습니다.
초목 톤 v5: GPT 내부 image_gen으로 metropolis-modern-v4.png를 부분 편집하여 metropolis-modern-v5.png 적용. 프롬프트: Make only tree foliage, shrubs, hedges and grass moderately darker (roughly 15–20% lower luminance), muted forest/moss green with less yellow highlights. Preserve building/road/water brightness and all geometry, camera and objects. No global darkening or UI.


## 2026-09-30 장바구니 구매

우선순위 입력 대신 상품 카드·수량 조절·장바구니 결제·별도 턴 종료를 적용했다. 가게도 기업이라는 개념을 화면에 안내하며 생산/판매의 별도 원장은 유지한다. 구매 후 화면이 자동으로 다음 턴으로 넘어가지 않는다. 상세 규칙·저장·검증·배포 범위는 [CART_PLAY.md](CART_PLAY.md)를 참고한다.

## 2026-10-02 경제 주체와 활동 이름

학생 화면의 상위 구분은 ‘내 기업’과 ‘내 가정 · 가계’다. 내 기업 아래에 공장 운영과 가게 운영을 함께 배치한다. 지도·창업·결과·비서 의견에는 생산 시설을 공장으로 표시한다. 도매는 ‘가게에 판매’, 소매는 ‘소비자에게 판매’로 설명한다. 내부 역할 ID와 자금·재고·거래 규칙은 그대로 유지한다.
