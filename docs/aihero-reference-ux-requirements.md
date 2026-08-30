# AI Hero 레퍼런스 UX 요구사항 인벤토리

> 상태: **Approved — 사용자가 데스크톱 구현 범위를 승인함**
> 문서 유형: 레퍼런스 기반 요구사항 인벤토리
> 작성일: 2026-08-30
> 구현 계약: 사용자가 선택한 `agentic-execution`으로 데스크톱 범위를 구현한다.

이 문서는 [AI Coding Dictionary](https://www.aicodingdictionary.com/)에서 현재 확인할 수 있는 사용자 경험을 기능 단위로 기록한다. 기존 승인 문서인 [레퍼런스 정렬 그래프 UX 통합 명세](./graph-reference-ux-spec.md)는 수정하지 않으며, 이 문서는 그 명세를 보완하는 데스크톱 구현 요구사항이다. 사용자는 2026-08-30에 이 문서를 전체 데스크톱 구현 범위로 승인했다.

## 1. 조사 범위와 근거

### 1.1 실제로 확인한 표면

- 데스크톱 viewport: `1280 × 720`
- 기준 페이지: [`https://www.aicodingdictionary.com/`](https://www.aicodingdictionary.com/)
- 선택 상태: [`?term=stateful`](https://www.aicodingdictionary.com/?term=stateful), [`?term=model-provider-request`](https://www.aicodingdictionary.com/?term=model-provider-request), [`?term=hallucination`](https://www.aicodingdictionary.com/?term=hallucination), [`?term=ai`](https://www.aicodingdictionary.com/?term=ai)
- 검색 상태: [`?q=stateful`](https://www.aicodingdictionary.com/?q=stateful), UI에서 `model provider` 검색
- 확인 방식: 실제 in-app browser에서 DOM 접근성 트리, 화면 캡처, pointer hover/click/drag, wheel scroll, URL·history, clipboard를 순차적으로 확인

### 1.2 증거 등급

- **관찰됨**: 조사 중 화면·DOM·URL·clipboard에서 직접 확인한 사실
- **관찰 기반 요구**: 관찰된 동작을 제품 수용 기준으로 번역한 항목
- **미확인**: 현재 환경에서 확인할 수 없었거나, 구현 의도를 추정하지 않아야 하는 항목

“모든 특징”은 해당 날짜와 viewport에서 노출·조작 가능한 기능을 빠짐없이 수집한다는 뜻으로 사용한다. 서버 코드, 비노출 실험 기능, 다른 viewport에서만 나타나는 기능은 관찰 근거 없이 확정하지 않는다.

### 1.3 현재 코드와의 경계

현재 저장소에는 150-node density fixture와 선택·카메라·ambient-motion seam이 이미 있다. 이 문서는 그 구현이 완료되었다고 주장하지 않으며, 레퍼런스에서 추가로 필요한 행동을 분리한다. 흰색 noise/종이 질감, section color 팔레트처럼 제품에서 의도적으로 다른 스타일은 유지할 수 있지만, 아래의 기능적 상태 전이와 읽기 흐름은 스타일 차이로 면제하지 않는다. 모바일·태블릿·터치 전용 동작은 이번 조사와 요구사항 범위에서 제외한다.

## 2. 레퍼런스 콘텐츠 모델

레퍼런스는 그래프를 단순한 장식이 아니라 사전 콘텐츠의 탐색 표면으로 사용한다.

| 항목 | 관찰된 사실 | 요구 방향 |
| --- | --- | --- |
| 용어 수 | 선택 패널의 순번이 `01 / 69`부터 `36 / 69` 등으로 표시됨 | 최대 150개까지 늘어나도 각 노드는 안정적인 순번·slug·label을 가져야 한다 |
| 섹션 | `The Model`, `Sessions, Context Windows & Turns`, `Tools & Environment`, `Failure Modes`, `Handoffs`, `Memory and Steering`, `Patterns of Work`의 7개 섹션 | 노드의 section 정보와 섹션별 시각적 구분을 보존한다 |
| 노드 데이터 | label, 짧은 정의, full definition, 관계, 예시/주의 문구, source URL이 함께 존재 | GraphInput과 상세 패널이 같은 콘텐츠 원천을 사용한다 |
| 관계 | `Connects to`가 기본 관계 묶음이며, 일부 항목은 `Avoid` 같은 보조 설명도 보유 | 관계 종류와 설명 블록은 선택 노드별로 가변적이어야 한다 |
| rich content | 단락, 목록, 표, inline cross-reference button이 모두 사용됨 | 상세 본문을 평문 한 줄이나 placeholder 목록으로 축소하지 않는다 |

## 3. 상태와 전이

아래 상태는 각각 독립적으로 검증할 수 있어야 하며, 상태 전환이 장면 전체를 불필요하게 재배열하거나 깜박이게 해서는 안 된다.

| 상태 | 진입 | 그래프 | 오버레이/패널 | URL·종료 |
| --- | --- | --- | --- | --- |
| `loading` | 최초 진입 또는 새 route 로드 | 그래프가 준비되기 전 비어 있거나 숨겨짐 | 중앙에 `MATT POCOCK'S AI CODING DICTIONARY` 타이틀과 underline이 보임 | 준비가 끝나면 `idle` 또는 deep-link 선택 상태 |
| `idle` | root 진입, 선택 해제 | 3D 노드와 모든 label이 viewport 전체에 분산; label은 낮은 대비; 관계선은 보이지 않음; ambient drift 지속 | Search, About, palette, sound, AIHero.dev chrome | `https://www.aicodingdictionary.com/` |
| `hover` | 노드 위로 pointer 이동 | hovered node와 주변 label이 선명해지고 incident dotted link가 잠시 나타남; 주변 노드가 가까워지는 국소 움직임 | 패널은 열리지 않음 | pointer가 빈 영역으로 나가면 `idle`로 복귀 |
| `orbiting` | 노드가 아닌 canvas 영역에서 pointer drag | camera가 3D로 orbit; 깊이·원근·label 위치가 계속 갱신; release 뒤에도 짧은 관성과 damping이 이어짐 | 선택 상태가 있으면 패널은 유지 | pointer-up 뒤 현재 camera pose 유지; layout 재실행 금지 |
| `zooming` | canvas 위 wheel | cursor 위치를 기준으로 camera가 부드럽게 dolly in/out; page route는 바뀌지 않음 | 패널은 선택 상태라면 유지 | wheel 종료 후 camera pose 유지 |
| `selected` | node click, `?term=<slug>`, 관계 pill, Prev/Next | 선택 node가 남은 graph 영역 중심 부근으로 이동; 직접 관계선만 강조; 먼 context는 낮은 대비로 남음 | 데스크톱 우측 rail | `?term=<slug>`; Close, background click, Escape로 `idle` |
| `searching` | Search click 또는 `?q=<query>` | query와 일치하는 node만 남기고 label·count를 갱신; 선택 패널은 숨겨지거나 닫힘 | top-left pill searchbox, clear 버튼, result count | `?q=<query>`; Clear는 빈 검색 상태, Escape는 root |
| `about` | About click | 뒤 그래프가 dim/blur되어 상호작용 우선순위가 내려감 | 중앙 dialog, 설명·외부 링크·credits·partners, Close | backdrop click 또는 Escape로 이전 상태 |
| `theme` | palette toggle | grayscale ↔ section colors 전환; node/배경 palette가 변함 | toggle의 accessible name/pressed 상태 갱신 | 현재 세션에서 즉시 반영 |
| `sound-muted` | sound toggle | 그래프 의미는 유지 | `Mute interface sounds` ↔ `Unmute interface sounds` | 현재 세션에서 즉시 반영 |

## 4. 기능 요구사항

각 항목의 `수용 기준`은 자동화 테스트와 실제 브라우저 확인에 모두 사용할 수 있는 표현으로 작성한다.

### 4.1 초기 진입·콘텐츠

#### AH-DATA-001 — 안정적인 노드 콘텐츠

- 우선순위: MUST
- 관찰 기반 요구: 각 노드는 표시 label, 고유 slug/id, 소속 section, 짧은 definition, full definition, 관련 node 목록, optional example/주의 블록, 원문 URL을 가진다.
- 수용 기준: 같은 node를 canvas, 상세 패널, search, deep-link, copy markdown에서 식별할 수 있고, 화면 surface마다 이름이 달라지지 않는다.

#### AH-DATA-002 — section과 순번

- 우선순위: MUST
- 관찰됨: 선택 패널은 section 이름과 `현재 순번 / 전체 69`를 함께 표시한다.
- 수용 기준: 전체 term 수가 150개로 늘어도 순번은 deterministic하며, Prev/Next와 search 결과가 같은 순서를 사용한다.

#### AH-DATA-003 — rich definition

- 우선순위: MUST
- 관찰됨: `hallucination`은 표를, `ai`는 시대별 표를, 여러 용어는 목록과 inline cross-reference button을 사용한다.
- 수용 기준: paragraph/list/table/emphasis/inline term link를 보존하며, rich content를 placeholder나 단일 문자열로 평탄화하지 않는다.

#### AH-DATA-004 — 선택적 설명 블록

- 우선순위: MUST
- 관찰됨: 노드에 따라 `Heard in the wild`, 질문·답변 bubble, 추가 설명 문장, `Avoid`, `Surfaces as:`가 있거나 없다.
- 수용 기준: 콘텐츠가 없는 블록을 빈 박스로 만들지 않고, 있는 블록은 같은 순서와 의미로 렌더링한다.

#### AH-BOOT-001 — loading splash

- 우선순위: SHOULD
- 관찰됨: route 로드 초기에 중앙 타이틀 화면이 보인 뒤 canvas와 chrome이 나타난다.
- 수용 기준: WebGL/콘텐츠 준비 중 빈 흰 화면이나 깨진 panel을 노출하지 않고, 준비 완료 후 한 번만 idle/selected 상태로 전환한다.

#### AH-BOOT-002 — semantic fallback

- 우선순위: MUST
- 관찰됨: DOM에 `Skip to main content`와 7개 section의 heading/term/definition article이 존재한다.
- 수용 기준: WebGL이 비활성화되어도 용어 목록과 정의를 읽을 수 있고, 그래프 UI는 이 semantic article과 중복된 내용을 모순되게 표시하지 않는다.

### 4.2 idle·ambient 그래프

#### AH-GRAPH-001 — 전역 분포

- 우선순위: MUST
- 관찰됨: 비선택 상태에서 노드가 중앙의 작은 군집이 아니라 화면 전체에 분산된다.
- 수용 기준: 150개 fixture에서 node body bounds가 viewport의 넓은 영역을 점유하고, 화면 가장자리·중앙·중간 깊이에 노드가 존재한다.

#### AH-GRAPH-002 — 모든 label의 존재와 대비 계층

- 우선순위: MUST
- 관찰됨: idle에서도 모든 term name이 존재하지만, 먼 노드 label은 매우 낮은 대비로 보인다.
- 수용 기준: density culling 때문에 노드 이름 전체가 사라지지 않는다. 선택·hover·근접 깊이·section master에 따라 opacity/contrast만 연속적으로 달라진다.

#### AH-GRAPH-003 — 깊이와 원근

- 우선순위: MUST
- 관찰됨: node 크기·명도·겹침이 z-depth에 따라 달라지고, orbit 시 배치와 label이 함께 변한다.
- 수용 기준: 동일한 xy 좌표의 평면 원보다 실제 z 분포·원근 scale·occlusion이 화면에서 식별되며, 3D 재질만 추가한 상태를 통과로 보지 않는다.

#### AH-GRAPH-004 — ambient drift

- 우선순위: MUST
- 관찰됨: idle에서 노드와 camera 장면이 미세하게 계속 떠다닌다.
- 수용 기준: 정지 화면처럼 완전히 고정되지 않되, label이 읽을 수 없는 속도로 흔들리거나 layout이 매 프레임 다시 계산되지 않는다.

#### AH-GRAPH-005 — idle 관계선 억제

- 우선순위: MUST
- 관찰됨: 아무것도 선택하지 않은 idle에서는 관계선이 화면을 어지럽히지 않는다.
- 수용 기준: 모든 link object의 geometry/endpoint는 최신 node position을 가리키지만 visual/object opacity는 0에 가까워 실제 선이 보이지 않는다.

#### AH-GRAPH-006 — hover 국소 강조

- 우선순위: MUST
- 관찰됨: node에 pointer를 가까이 가져가면 해당 label과 주변 label이 선명해지고, hovered node 주변으로 dotted relationship line이 방사된다.
- 수용 기준: hover는 selection route나 detail panel을 만들지 않고, hovered node의 incident link와 근접 label만 강조한다.

#### AH-GRAPH-007 — hover attraction과 복귀

- 우선순위: MUST
- 관찰됨: hover 중 주변 노드가 focal node 주변으로 당겨지는 듯한 국소 배치를 보이며, 빈 영역으로 pointer를 옮기면 다시 분산된다.
- 수용 기준: attraction은 transient visual effect이며 canonical layout/data를 변경하지 않는다. hover 종료 뒤 link와 label tier가 idle로 되돌아간다.

#### AH-GRAPH-008 — node hit target

- 우선순위: MUST
- 관찰됨: canvas에서 node를 클릭하면 해당 용어가 선택되고 URL과 상세 panel이 바뀐다.
- 수용 기준: 보이는 body와 label이 같은 node를 hit-test하며, 빠르게 떠다니는 동안 클릭 대상이 다른 node로 튀지 않는다.

### 4.3 3D 이동·zoom

#### AH-CAMERA-001 — background orbit

- 우선순위: MUST
- 관찰됨: node가 아닌 canvas 영역을 left-drag하면 카메라가 3D로 회전하고, node/label이 perspective에 맞춰 재투영된다.
- 수용 기준: node drag와 background drag를 구분한다. background drag는 선택을 만들거나 layout을 재실행하지 않는다.

#### AH-CAMERA-002 — release inertia

- 우선순위: MUST
- 관찰됨: 긴 drag 후 pointer-up 뒤 장면이 즉시 정지하지 않고 계속 이동했다(ambient motion과 camera damping의 구분은 미확인).
- 수용 기준: pointer-up 뒤 camera가 부드럽게 감쇠하고, 같은 drag를 놓았다는 이유만으로 노드가 초기 배치로 재배열되거나 깜박이지 않는다.

#### AH-CAMERA-003 — zoom to cursor

- 우선순위: MUST
- 관찰됨: canvas wheel 음수 delta는 크게 zoom-in, 양수 delta는 zoom-out으로 동작하며 현재 route는 유지된다.
- 수용 기준: zoom 중심은 pointer 위치와 일관되고, zoom 후 graph bounds·label scale이 업데이트되며 page scroll로 대체되지 않는다.

#### AH-CAMERA-004 — interaction continuity

- 우선순위: MUST
- 관찰 기반 요구: orbit/zoom/hover/selection이 서로의 현재 camera pose를 덮어쓰지 않는다.
- 수용 기준: 이동 중 selection transition이 중복 실행되지 않고, interaction 종료 뒤 단 한 번의 안정화 프레임만으로 재배열·flash 없이 계속 탐색할 수 있다.

### 4.4 선택과 상세 panel

#### AH-SELECT-001 — click/deep-link selection

- 우선순위: MUST
- 관찰됨: node click 또는 `?term=stateful` 같은 URL로 선택하면 같은 상세 상태가 열린다.
- 수용 기준: canvas click, 관계 pill, pager, direct URL이 동일한 selectedNode를 만들고, loading 완료 후 선택 panel이 한 번만 열린다.

#### AH-SELECT-002 — remaining-viewport framing

- 우선순위: MUST
- 관찰됨: 데스크톱 panel이 열리면 canvas가 남은 왼쪽 영역을 사용하고 선택 node가 그 영역의 중심 부근으로 이동한다.
- 수용 기준: 선택 node와 direct neighbors는 읽을 수 있을 만큼 가까워지지만, background context를 모두 밀어내는 과도한 zoom-to-fit을 하지 않는다.

#### AH-SELECT-003 — selected visual hierarchy

- 우선순위: MUST
- 관찰됨: selected node와 direct relationship label/line은 강하고, 비관계 node는 낮은 대비로 남는다.
- 수용 기준: selected > direct neighbor > nearby/master > distant context 순서의 시각적 hierarchy가 유지되며, distant body/label이 일괄 삭제되지 않는다.

#### AH-SELECT-004 — direct link only

- 우선순위: MUST
- 관찰됨: selected state에서 선택 node에 직접 연결된 line만 강조되고, 먼 edge는 보이지 않는다.
- 수용 기준: incident edge만 visible tier를 가지며, hidden edge도 최신 endpoint와 scene attachment를 유지한다.

#### AH-SELECT-005 — desktop detail rail

- 우선순위: MUST
- 관찰됨: 1280px 화면에서 약 426px 폭의 fixed right rail이 열리고 graph canvas는 남은 폭으로 줄어든다.
- 수용 기준: rail 열림/닫힘이 canvas width·camera framing과 함께 transition하며, panel이 graph 위에 불투명하게 겹쳐 선택 node를 가리지 않는다.

#### AH-SELECT-006 — panel header

- 우선순위: MUST
- 관찰됨: section 이름, 현재 순번/전체 수, 큰 title, 짧은 정의, Close 버튼이 상단에 있다.
- 수용 기준: title과 section은 선택 node와 일치하고, close button은 accessible name을 가진다.

#### AH-SELECT-007 — examples and guidance

- 우선순위: MUST
- 관찰됨: `Heard in the wild`에 question/answer bubble 또는 list가 표시되고, 일부 term에는 `Avoid`·`Surfaces as:`가 이어진다.
- 수용 기준: 블록별 border/spacing/문장 순서를 보존하고, 선택 node에 해당하지 않는 예시를 재사용하지 않는다.

#### AH-SELECT-008 — connects-to pills

- 우선순위: MUST
- 관찰됨: `Connects to` 아래에 여러 pill button이 있으며, 일부 term은 수십 개의 관계를 가진다.
- 수용 기준: pill click이 해당 term 선택과 `?term=<slug>` history push를 수행하고, graph 강조·panel 콘텐츠가 함께 바뀐다.

#### AH-SELECT-009 — rich full definition

- 우선순위: MUST
- 관찰됨: full definition은 단락, 표, inline term button을 포함할 수 있다.
- 수용 기준: inline term click은 관계 탐색과 같은 route/selection seam을 사용하고, 표의 header/cell semantics를 유지한다.

#### AH-SELECT-010 — Read more / Show less

- 우선순위: MUST
- 관찰됨: 요약 뒤 `Read more`를 누르면 추가 문단이 펼쳐지고 버튼이 `Show less`로 바뀐다.
- 수용 기준: 펼침 상태는 panel scroll position을 망가뜨리지 않고, 다시 누르면 해당 node의 축약 상태로 복귀한다.

#### AH-SELECT-011 — independent panel scroll

- 우선순위: MUST
- 관찰됨: right rail 안쪽 scroll container가 별도로 스크롤되고 하단 Prev/Next pager는 고정되어 있다.
- 수용 기준: panel scroll이 canvas camera/orbit을 움직이지 않으며, 긴 rich definition도 pager와 Close control을 잃지 않는다.

#### AH-SELECT-012 — source link

- 우선순위: MUST
- 관찰됨: `Read the full entry on aihero.dev` 링크가 term별 원문 URL을 새 탭으로 연다(`target="_blank"`, `rel="noopener noreferrer"`).
- 수용 기준: source URL은 선택 term과 일치하고, 외부 링크 이동이 local graph history를 오염시키지 않는다.

#### AH-SELECT-013 — share action

- 우선순위: SHOULD
- 관찰됨: `Share <Term>` button이 존재한다. 현재 브라우저 환경에서는 클릭 후 visible dialog/clipboard 변화가 없었다.
- 수용 기준: 지원 환경에서는 native share를 열고, 미지원 환경에서는 안전한 link-copy 또는 명확한 실패 피드백을 제공한다. 구현 전 fallback은 사용자 승인으로 확정한다.

#### AH-SELECT-014 — copy markdown

- 우선순위: MUST
- 관찰됨: `Copy <Term> as markdown`은 `# <Term>` heading, full definition, `./Term.md` 형태의 상대 cross-reference를 clipboard에 기록한다.
- 수용 기준: copy는 선택 term의 최신 full content를 사용하고, 성공/실패 피드백을 제공하며, 다른 term의 markdown을 복사하지 않는다.

#### AH-SELECT-015 — Prev/Next pager

- 우선순위: MUST
- 관찰됨: 하단 navigation에 `Prev <Term>`, `Next <Term>`가 있고 순번 순서로 이동한다.
- 수용 기준: pager click이 selection transition, URL, panel content, graph emphasis를 원자적으로 갱신하고 browser back으로 되돌릴 수 있다.

### 4.5 검색

#### AH-SEARCH-001 — search affordance

- 우선순위: MUST
- 관찰됨: idle의 top-left search icon에 hover하면 `Search` tooltip이 나타나고, click하면 pill-shaped input으로 확장된다.
- 수용 기준: button과 input 모두 accessible name `Search the dictionary`를 가지며, input이 열릴 때 graph/camera가 리셋되지 않는다.

#### AH-SEARCH-002 — query route

- 우선순위: MUST
- 관찰됨: `model provider` 검색 시 URL이 `?q=model+provider`로 바뀐다.
- 수용 기준: 새로고침·공유 가능한 search URL이 같은 query와 결과를 재현한다.

#### AH-SEARCH-003 — result filtering

- 우선순위: MUST
- 관찰됨: 검색 결과 count가 `8 TERMS`, `1 TERM`처럼 표시되고, canvas에는 일치 node만 남는다.
- 수용 기준: label query에 대해 결과 수와 visible node set이 일치하고, non-match node/edge가 결과를 오염시키지 않는다. definition full-text 검색은 현재 미확인이므로 별도 승인 없이는 확장하지 않는다.

#### AH-SEARCH-004 — clear search

- 우선순위: MUST
- 관찰됨: query가 있을 때 Clear search button이 나타난다. Clear는 input을 비우고 root URL로 돌아가며 search input은 열린 상태로 남는다.
- 수용 기준: 결과 count/graph filter가 즉시 제거되고, input focus와 accessible state가 유지된다.

#### AH-SEARCH-005 — escape search

- 우선순위: MUST
- 관찰됨: 빈 search input 또는 query 상태에서 Escape를 누르면 search chrome이 닫히고 root idle로 돌아간다.
- 수용 기준: Escape가 term selection을 남기거나 새 history entry를 만들지 않는다.

#### AH-SEARCH-006 — search/selection precedence

- 우선순위: MUST
- 관찰 기반 요구: 검색 중에는 full graph 탐색과 상세 rail이 검색 결과를 가리지 않아야 한다.
- 수용 기준: search를 여는 순간 stale selection panel을 숨기거나 명시적으로 유지하는 정책이 일관되고, 결과 node click은 정상 selected route로 전환한다.

### 4.6 chrome·설정·About

#### AH-CHROME-001 — tooltip system

- 우선순위: SHOULD
- 관찰됨: Search와 About 등 원형 chrome button 위에 pointer를 올리면 검은 tooltip이 나타난다.
- 수용 기준: tooltip은 해당 control 이름과 일치하고 graph label/관계선과 겹쳐 오독을 만들지 않는다.

#### AH-CHROME-002 — About dialog content

- 우선순위: MUST
- 관찰됨: About는 dimmed/blurred graph 위 중앙 dialog를 열고, `The AI Coding Dictionary` 설명, aihero.dev/GitHub link, Matt Pocock credit, badass.dev·Joel Hooks·Vojta Holik partners를 보여준다.
- 수용 기준: dialog는 title과 설명을 가지며, 외부 링크는 원문 destination을 사용한다. 파트너/credit 콘텐츠는 데이터로 관리해 변경 가능하게 한다.

#### AH-CHROME-003 — About close paths

- 우선순위: MUST
- 관찰됨: dialog의 Close button, backdrop click, Escape가 모달을 닫는다.
- 수용 기준: 닫힌 뒤 열기 전의 root/search/selected 상태로 돌아가고 graph가 다시 조작 가능하다.

#### AH-CHROME-004 — section color toggle

- 우선순위: SHOULD
- 관찰됨: `Switch to section colors`를 누르면 노드/배경이 yellow/orange 계열 section color로 바뀌고, button이 `Switch to grayscale`·pressed 상태로 변한다.
- 수용 기준: palette 전환이 node identity·layout·selection을 바꾸지 않고, 같은 toggle을 다시 누르면 grayscale로 돌아간다.

#### AH-CHROME-005 — sound toggle

- 우선순위: SHOULD
- 관찰됨: `Mute interface sounds` click 후 `Unmute interface sounds`·pressed 상태가 된다.
- 수용 기준: mute가 graph 의미와 camera를 바꾸지 않고, toggle label/aria state가 실제 사운드 상태와 일치한다.

#### AH-CHROME-006 — session scope of settings

- 우선순위: OPEN
- 관찰됨: 조사 viewport의 localStorage/sessionStorage가 비어 있어 reload 이후 설정 persistence는 확인하지 못했다.
- 수용 기준: persistence가 필요하면 별도 승인 후 저장 범위와 초기값을 결정한다. 승인 전에는 session-only로 취급한다.

#### AH-CHROME-007 — persistent brand link

- 우선순위: MUST
- 관찰됨: bottom-left `AIHero.dev` link가 `https://www.aihero.dev/s/dictionary`를 새 탭으로 연다.
- 수용 기준: brand link가 graph control을 가리지 않고 외부 원문 destination을 유지한다.

### 4.7 URL·history·오류

#### AH-ROUTE-001 — term deep-link

- 우선순위: MUST
- 관찰됨: `?term=stateful`, `?term=model-provider-request`가 로드 직후 해당 term panel과 focused graph를 연다.
- 수용 기준: hard reload와 새 탭에서도 같은 term, 순번, 관계, panel scroll 초기 상태를 재현한다.

#### AH-ROUTE-002 — unknown term

- 우선순위: MUST
- 관찰됨: `?term=not-a-real-term`은 오류 panel 대신 query가 제거된 root idle로 정규화된다.
- 수용 기준: 알 수 없는 slug가 예외를 내거나 stale selection을 남기지 않는다.

#### AH-ROUTE-003 — push/back/forward

- 우선순위: MUST
- 관찰됨: 관계 pill 또는 pager로 `stateful → session` 이동 후 browser back/forward가 각각의 panel과 graph state를 복원한다.
- 수용 기준: history 복원이 새 layout seed나 중복 transition을 만들지 않고, 선택 URL과 visible panel heading이 일치한다.

#### AH-ROUTE-004 — clear route

- 우선순위: MUST
- 관찰됨: Close, canvas background click, Escape가 `?term`을 제거하고 root로 돌아간다.
- 수용 기준: selection=null, 관계선 hidden, idle ambient가 복원된다.

#### AH-ROUTE-005 — search route precedence

- 우선순위: MUST
- 관찰됨: `?q=stateful`은 detail 없이 1개 결과를 표시한다.
- 수용 기준: `q`와 `term`이 동시에 들어올 때 우선순위 정책을 명시하고, 승인 전에는 조용히 추정하지 않는다.

#### AH-ROUTE-006 — external navigation isolation

- 우선순위: MUST
- 관찰됨: source, brand, GitHub/partner link는 새 탭 외부 이동이다.
- 수용 기준: 외부 링크 클릭이 local `term`/`q` history를 변경하지 않는다.

### 4.8 접근성·동작 안전 (데스크톱)

#### AH-A11Y-001 — semantic controls

- 우선순위: MUST
- 관찰됨: Search, About, palette, mute, Close, relation pill, pager, copy/share에 accessible name이 있다.
- 수용 기준: canvas 자체의 시각 정보에 의존하지 않고, 모든 주요 action을 이름 있는 control과 semantic article로 노출한다.

#### AH-A11Y-002 — keyboard Escape

- 우선순위: MUST
- 관찰됨: Escape가 search, About, selected detail을 닫는다.
- 수용 기준: Escape는 현재 최상위 overlay부터 닫고, 닫힌 뒤 focus가 합리적인 trigger로 돌아간다.

#### AH-A11Y-003 — keyboard traversal

- 우선순위: MUST
- 관찰됨: DOM에 skip link, searchbox, named button, dialog/complementary role이 있으나, 본 조사 backend에서는 안정적인 Tab 순서를 계측하지 못했다.
- 수용 기준: keyboard-only 사용자가 skip link → chrome → search → detail controls → rich inline links 순서로 이동할 수 있고, focus ring이 noise canvas에서 사라지지 않는다.

#### AH-A11Y-004 — reduced motion

- 우선순위: OPEN
- 관찰됨: `prefers-reduced-motion: reduce` media 상태는 강제로 읽을 수 있었지만, 900ms 샘플 사이 그래프 이동이 계속되어 reference의 실제 감쇠 정책은 확정하지 못했다.
- 수용 기준: 사용자가 reduced-motion 지원을 승인하면 ambient drift, hover attraction, camera transition, loading/rail animation을 줄이는 명시적 정책과 브라우저 증거를 추가한다.

#### AH-SAFE-001 — no post-release re-layout

- 우선순위: MUST
- 관찰 기반 요구: camera drag의 pointer-up, wheel 종료, panel close 이후에 canonical node layout이 재생성되면 안 된다.
- 수용 기준: 같은 data/seed에서 interaction 전후 anchor node의 상대 배치가 유지되고, transition 완료 프레임에 전체 노드가 깜박이거나 중앙으로 재배치되지 않는다.

#### AH-SAFE-002 — geometry/visibility coherence

- 우선순위: MUST
- 관찰 기반 요구: 숨은 line도 최신 node endpoint를 유지하고, visibility 변경 순서 때문에 stale geometry가 보이면 안 된다.
- 수용 기준: hover/selection/ambient refresh마다 node position → link geometry → material/visibility 순서가 일관되고, camera 이동 중 선이 이전 프레임 위치에 남지 않는다.

## 5. 시각 방향과 기능 경계

다음은 AI Hero에서 관찰했지만 제품의 고유 스타일로 대체할 수 있는 항목과, 바꾸면 기능적 parity가 깨지는 항목을 분리한다.

### 5.1 대체 가능한 스타일

- 흰색 paper/noise canvas를 어두운 질감 canvas로 대체할 수 있다.
- grayscale node palette를 제품 section color로 대체할 수 있다.
- 정확한 font family, font size, line thickness, noise grain, icon glyph는 기존 design concept에 맞게 조정할 수 있다.
- node body의 재질이 flat circle인지, 제품의 authored volumetric silhouette인지 선택할 수 있다.

### 5.2 기능적으로 보존해야 하는 것

- idle에서 전역 node/label 분포와 hidden relation-line hierarchy
- hover의 label/incident edge 강조와 transient local attraction
- background drag의 3D orbit, release inertia, wheel zoom
- selected node의 remaining-viewport framing과 direct-neighbor-only emphasis
- detail panel의 rich content 순서, independent scroll, relation/pager navigation
- search query route/filter/count, clear/Escape 동작
- About, source/brand external link, palette/sound toggle, copy/share action의 semantics
- deep-link, unknown-term normalization, browser back/forward
- desktop rail의 조작 가능성과 overlay state isolation
- 150-node 규모에서의 no-flicker/no-re-layout 안정성

## 6. 검증 매트릭스 (데스크톱)

### 6.1 브라우저 시나리오

| 시나리오 | 확인해야 할 증거 |
| --- | --- |
| `idle-150` | node count, full-viewport bounds, all label objects present, idle link hidden, ambient frame 증가 |
| `hover-incident` | hover node id, incident link만 잠시 visible, label contrast 증가, pointer leave 후 복귀 |
| `orbit-inertia` | background drag 전후 camera pose, pointer-up 이후 감쇠 frame, canonical anchor 안정성 |
| `wheel-zoom` | cursor anchor, in/out distance, URL 불변, page scroll 불변 |
| `select-drawer` | selected id, remaining canvas width, direct links only, panel heading/count/close |
| `detail-rich` | Heard/Avoid/Connects/full definition/table/Read more/scroll/pager |
| `search-filter` | `?q`, query value, result count, filtered node set, clear/Escape |
| `about-settings` | dialog content/backdrop/Escape, palette pressed state, mute pressed state |
| `history-deep-link` | `?term`, relation/pager push, back/forward, unknown term root normalization |

### 6.2 사람 눈으로 확인해야 하는 증거

자동화된 object visibility만으로는 다음을 판정하지 않는다.

- hover/selection/orbit/zoom 전환이 자연스럽고 flash가 없는가
- label이 항상 존재하지만 시각적 위계가 유지되는가
- 150개에서 화면이 과밀하거나 텅 비어 보이지 않는가
- 관계선이 실제로 “연결 구조”로 읽히고 원통형/평면적인 단일 축으로 오해되지 않는가
- panel이 graph를 가리지 않고, rich content와 pager가 자연스럽게 이어지는가

## 7. 구현 시 확정한 경계와 기본값

아래 항목은 조사 당시 미확인이었지만, 사용자가 전체 데스크톱 구현을 승인하면서 기능을 막지 않는 보수적 기본값으로 확정했다. 수치·스타일은 기존 제품 방향을 유지하고, 새 서버·저장소·런타임은 추가하지 않는다.

1. Share는 지원 브라우저에서 native share를 사용하고, 미지원 환경에서는 현재 term link를 clipboard로 복사하며 결과 상태를 알린다.
2. `prefers-reduced-motion: reduce`는 ambient drift·hover attraction·camera transition·loading/rail CSS animation을 즉시 감쇠하거나 중지한다.
3. 검색 대상은 레퍼런스에서 확인된 label만으로 한정한다. definition/full definition 검색은 별도 승인 없이는 확장하지 않는다.
4. palette·mute 설정은 reload 이후 저장하지 않는 session-only 상태로 둔다.
5. graph edge의 정확한 곡률·점선 간격·색상·속도는 기능 계약이 아닌 제품 스타일로 보고, hover dashed child가 canonical geometry를 공유하는 안전한 구현을 사용한다.
6. loading splash는 WebGL/콘텐츠 준비 중에만 표시하고, 준비가 끝나면 idle 또는 deep-link selected 상태로 한 번 전환한다.

## 8. 승인 후 적용 순서와 완료 증거

승인 후 아래 순서로 적용했고, 각 단계는 브라우저 증거를 얻은 뒤 다음 단계로 넘어갔다.

1. 콘텐츠/route contract: node schema, section/order, deep-link/search/history.
2. idle/hover/orbit/zoom interaction: ambient, hidden edges, local hover attraction, camera damping.
3. selection/detail: remaining-viewport framing, direct links, rich panel, scroll, pager, copy/share.
4. chrome/accessibility: tooltips, About, settings, semantic fallback, keyboard.
5. 150-node desktop verification: no-flicker, no-re-layout, reduced-motion decision.

현재 문서는 **승인된 데스크톱 구현 요구사항**이며, 위 수직 슬라이스는 구현 완료 상태다. 모바일·태블릿·터치 전용 동작은 계속 범위 밖이다.
