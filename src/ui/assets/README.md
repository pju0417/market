# 학생 교육용 게임 에셋 v1

GPT 내장 image_gen으로 2026-09-24 제작. 원본 PNG를 그대로 보관했습니다.

| 파일 | 사용처 | 의미 |
| --- | --- | --- |
| economy-village-v1.png | 시작 화면 | 생산·판매·소비가 만나는 마을 |
| role-company-v1.png | 기업 턴 | 주황 작업장 / 생산 |
| role-store-v1.png | 가게 턴 | 초록 상점 / 판매 |
| role-household-v1.png | 가계 턴 | 보라 집 / 필요 충족과 예산 관리 |

둥근 클레이 일러스트와 기존 역할 색상을 사용합니다. 배경이 있는 PNG이며 투명 스프라이트는 아닙니다. 역할명과 설명은 HTML 텍스트로 제공하고 이미지 위에 글자를 겹치지 않습니다. 색상 외에도 건물 형태와 역할명으로 구분합니다. 기업의 장난감은 생산 활동을 설명하는 예시이며 게임의 업종을 제한하지 않습니다.

GameArtwork.tsx에서 Vite가 배포 경로에 맞게 자산 URL을 생성합니다. 공용 턴 화면에 연결되어 로컬·네트워크 플레이에 함께 적용됩니다.

## 실제 제작 프롬프트

### 마을

Use case: illustration-story. Asset type: landscape hero illustration for a Korean elementary-school market economy learning game. Create a polished welcoming miniature economic neighborhood, orange small production workshop on left, green awning grocery/toy shop in middle, lavender roof family home on right, connected by a pedestrian path with a few friendly diverse pupils exploring with notebooks and reusable shopping bags. Production, retail and thoughtful everyday consumption, equal visual importance. Soft rounded storybook 3D clay illustration, restrained detail, matte surfaces, sky blue #cfeeff and warm cream #fff4d6 backdrop, orange #ff8a3d green #2bb673 purple #a86bff role accents, navy details. Wide 1536x1024 composition, entire village comfortably in frame with breathing room. Cheerful daylight, educational and calm rather than casino or competitive wealth imagery. No words, letters, numbers, logos, watermarks, UI frames or charts. Deliver a single finished image.

### 기업

Use case: stylized-concept. Asset type: square role illustration for elementary school economy game, company / producer. Single orange #ff8a3d toy-sized manufacturing workshop with open front showing a simple workbench, wooden toy blocks and packed boxes, navy and cream details, tiny gear emblem without lettering. Rounded soft storybook clay 3D style, matte tactile material, friendly bright soft daylight, clean silhouette legible at 96px. Three quarter isometric view, entire building centered occupying 75 percent of square with generous margin, isolated on solid pale warm cream #fff4e8 background, subtle contact shadow. No humans, no smoke, no text, numbers, logos, watermarks, UI, coins or money. 1024x1024 finished illustration.

### 가게

Use case: stylized-concept. Asset type: square role illustration for elementary school economy game, store / retailer. Single green #2bb673 toy-sized neighborhood shop, green and cream striped awning, open front with neatly arranged fruit, folded clothing, small toy and boxed radio on shelves to suggest different product categories, small reusable basket by door. Rounded soft storybook clay 3D style, matte tactile material, navy and cream details, friendly bright soft daylight, clean silhouette legible at 96px. Three quarter isometric view, entire building centered occupying 75 percent of square with generous margin, isolated on solid very pale mint #edf9f1 background, subtle contact shadow. No humans, text, numbers, logos, watermarks, UI, coins or money. 1024x1024 finished illustration.

### 가계

Use case: stylized-concept. Asset type: square role illustration for elementary school economy game, household / thoughtful consumer. Single toy-sized cream home with lavender #a86bff tiled roof and purple round front door, small front garden, reusable shopping bag with bread and apple beside doorstep and a closed household budget notebook with blank cover. Rounded soft storybook clay 3D style, matte tactile material, navy and cream details, friendly bright soft daylight, clean silhouette legible at 96px. Three quarter isometric view, entire building centered occupying 75 percent of square with generous margin, isolated on solid very pale lavender #f5efff background, subtle contact shadow. No humans, text, numbers, logos, watermarks, UI, coins or money piles. Emphasize comfortable everyday living and needs, not luxury. 1024x1024 finished illustration.

