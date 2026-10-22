# 레퍼런스 검색 UX 명세 (AI Coding Dictionary 검색 역분석 + 구현 계약)

> 상태: **Approved — 검색 기능 구현 완료**
> 문서 유형: 레퍼런스 역분석 + 구현 명세
> 작성일: 2026-10-22
> 대상 레퍼런스: <https://www.aicodingdictionary.com/>
> 구현 대상: `@pureliture/graph-workbench` 라이브러리 + `sites/browser-fixture` 데모

이 문서는 [AI Coding Dictionary](https://www.aicodingdictionary.com/)의 **검색 기능**이 실제로 어떻게 동작하는지 관찰된 증거로 기록하고, 그 동작을 이 저장소에 구현한 계약을 서술한다. 기존 승인 문서([그래프 레퍼런스 UX 통합 명세](./graph-reference-ux-spec.md), [레퍼런스 UX 요구사항 인벤토리](./aihero-reference-ux-requirements.md))는 수정하지 않으며, 이 문서는 그 명세에 **검색 슬라이스**를 추가한다.

---

## 1. 조사 방법과 증거 출처

### 1.1 조사 범위

- 기준 페이지: `https://www.aicodingdictionary.com/`
- 검색 상태: `https://www.aicodingdictionary.com/?q=stateful`
- 확인 방식: 서버가 반환하는 HTML/CSS/JS 청크의 정적 분석 + DOM/ARIA 속성 추출

### 1.2 증거 등급

- **관찰됨(직접 확인)**: 응답 HTML·CSS·JS 바이트에서 직접 읽은 사실
- **관찰 기반 요구**: 관찰된 동작을 제품 수용 기준으로 번역한 항목
- **분석적 추론**: 소스에서 직접 확인되지는 않았으나 동작 전체와 정합적인 항목

### 1.3 중요한 발견: 검색은 순수 클라이언트 측 기능

`/` 와 `/?q=stateful` 의 응답 HTML은 **바이트 단위로 완전히 동일**하다(53,759 bytes, `cmp` 결과 `IDENTICAL`). 즉 검색 결과는 서버 렌더링되지 않는다. `?q=` 는 클라이언트에서 읽어 DOM 상태만 바꾼다.

```
$ cmp root.html search_q.html
(identical)
```

따라서 이 문서의 증거는 Next.js 클라이언트 청크에서 나온다.

---

## 2. 레퍼런스 검색 구현의 관찰된 증거

### 2.1 검색 엔진: MiniSearch

레퍼런스는 **MiniSearch** 를 사용한다. 근거는 청크 `3n1q26nmmzkuq.js` 에 들어 있는 MiniSearch 의 기본 구현(BM25 계산 함수 `nx`, fuzzy trie `fuzzyGet`, 와일드카드 쿼리, `combineResults`)이다.

```js
// 3n1q26nmmzkuq.js — 검색 인덱스 생성 (lazy singleton)
new ng({
  idField: "slug",
  fields: ["title", "aliases", "description", "body", "usage", "avoid"],
  searchOptions: { boost: nA, prefix: !0, fuzzy: .2, combineWith: "OR" }
})
```

**필드 가중치** (`nA`):

| 필드 | boost | 출처 |
| --- | --- | --- |
| `title` | 3 | 단어 제목 |
| `aliases` | 2.6 | 별칭 |
| `usage` | 2 | 실제 사용 맥락 |
| `description` | 1.5 | 짧은 설명 |
| `body` | 1 | 본문 |
| `avoid` | 1 | 주의 문구 |

**검색 옵션**: `prefix: true`, `fuzzy: 0.2`, `combineWith: "OR"`.
`fuzzy: 0.2` 은 MiniSearch 규칙에 따라 `Math.round(term.length * 0.2)` 만큼의 편집 거리를 허용한다(5글자 단어 → 1회 편집).

**텍스트 정규화** (`nL`) — 마크다운을 검색 가능한 평문으로 바꾼다.

```js
function nL(e) {
  return e
    .replace(/\[(?<text>[^\]]+)\]\([^)]*\)/g, "$<text>")  // 링크 → 텍스트
    .replace(/[#>*_`~]/g, " ")                            //强调 마커 제거
    .replace(/\s+/g, " ")
    .trim();
}
```

### 2.2 결과 선별: 상대 점수 임계값 + 상한

```js
let i = (n[0]?.score ?? 0) * .3;   // 최고 점수의 30%
let o = [];
for (let e of n) {
  if (e.score < i || o.length >= 15) break;
  o.push(e.slug);
  r.set(e.slug, e.score);
}
```

즉 **최고 점수의 30% 미만은 버리고, 최대 15건까지만** 반환한다.

### 2.3 그래프 통합: 매칭 집합 → 클러스터 재패킹

검색이 레퍼런스에서 하는 가장 중요한 일은 **목록을 보여주는 것이 아니라 그래프를 다시 배치하는 것**이다. 청크 `1kt9xpzd5mdoj.js` 의 모듈 `15877` 이 이 responsibilities를 담당한다.

```js
// C(slugs): 노드별 매칭 마스크(1/0)를 만든다
"C", 0, function (t) {
  if (!t) { l.fill(1); u.fill(0); f.active = !1; f.fitRadius = 0; f.tick++; return; }
  let n = new Set;
  for (let i of t) { let t = a.z.get(i); void 0 !== t && n.add(t); }   // slug → node index
  for (let t = 0; t < a.r; t++) l[t] = +!!n.has(t);
  f.active = !0;
}

// n(slugs): 매칭 서브그래프를 물리 시뮬레이션으로 다시 묶는다
"n", 0, function (t) {
  // ... 매칭 노드의 무게 중심을 원점으로 옮기고,
  // d3-force-3d(charge -55, collide inDegree+18, forceX/Y/Z 0.06, 커스텀 link force)를 180 tick 돌린 뒤
  // 새 위치를 오프셋 배열 u 에 기록하고, fitRadius(최대 거리 + 16)를 계산한다.
  f.tick++;
}
```

관찰된 사실:
- 매칭 노드만 이동하고, 비매칭 노드의 위치는 그대로 유지된다.
- 매칭 클러스터의 무게 중심은 월드 원점(0,0,0)으로 이동한다.
- `fitRadius` 로 카메라가 클러스터만 프레임할 수 있다.
- `tick` 카운터가 증가해 재렌더를 유발한다.

### 2.4 디바운스 250ms

```js
// 3n1q26nmmzkuq.js — 검색 컴포넌트 iQ
G.current = setTimeout(() => {
  (0, nW.n)(t.slugs);   // 클러스터 재패킹
  V();                  // bumpRepack
}, 250);
```

타이핑 중에는 마스크만 즉시 갱신하고(`nW.C`), 250ms 동안 입력이 멈춘 뒤에만 물리 재배치를 실행한다.

### 2.5 URL 계약: `?q=`

```js
// nuqs 계열 훅 사용
let [A, D] = b("q", n);
// n = { defaultValue: "", history: "replace", throttleMs: 250, clearOnDefault: !0 }
```

- `?q=<query>` 로 쿼리를 주소에 담는다.
- `history: "replace"` — 새 히스토리 엔트리를 만들지 않는다.
- `throttleMs: 250` — 주소 갱신 지연.
- `clearOnDefault: true` — 쿼리가 비면 파라미터를 제거한다.

### 2.6 키보드 계약

레퍼런트는 **검색창을 먼저 열고** 결과를 그래프에서 본다.

| 키 | 동작 | 근거 |
| --- | --- | --- |
| `/` | 검색 입력 focus + 전체 선택 (텍스트 입력 중이 아니면) | `i="/"===e.key && !n` |
| `⌘K` / `Ctrl+K` | 검색 입력 focus + 전체 선택 | `(e.metaKey||e.ctrlKey) && "k"===r` |
| `⌘F` / `Ctrl+F` | 검색 입력 focus + 전체 선택 (**선택된 term이 없을 때만**) | `&& !L.w.getState().focusedSlug` |
| `Enter` | 최고 매칭 term 선택 후 입력 blur | `let t=U.current; t&&(e.preventDefault(), $(t), H.current?.blur())` |
| `Escape` | 쿼리가 있으면 쿼리 비움 → 없으면 선택 해제 → 없으면 입력 blur | 3단계 폴백 |

### 2.7 결과 선택 시 쿼리 초기화

```js
// matchCount > 0 이고 쿼리가 남아있으면 쿼리를 지운다
d = () => { B > 0 && "" !== A.trim() && D(""); }
```

term 을 하나 고르면 쿼리가 비워져 그래프가 일반 읽기 모드로 되돌아간다.

### 2.8 UI: 좌상단 확장형 필드

`css_435wermyueh-6.css` 에서 확인된 레퍼런스 스타일(클래스 해시는 빌드마다 달라진다).

```css
.field { width: 2.4rem; height: 2.4rem; border-radius: 999px; overflow: hidden;
         transition: width .46s cubic-bezier(.16,1,.3,1), padding .46s ...; }
.field:focus-within, .field[data-active=true] { width: min(360px, 80vw); padding: 0 10px 0 0; }
.input { min-width: 0; flex: auto; opacity: 0; transition: opacity .28s 60ms; }
.field:focus-within .input, .field[data-active=true] .input { opacity: 1; }
.hint { opacity: 0; transition: opacity .25s; }
.hint[data-show=true] { opacity: 1; }
```

- 필드는 **좌상단 고정**(top:14px; left:32px)이고, 아이콘 하나 폭으로 접혀 있다가 focus 또는 쿼리 보유 시 확장된다.
- 입력은 `opacity: 0` 으로 숨겨졌다가 focus/active 시 나타난다.
- 결과 **목록 드롭다운은 없다**. 검색 결과는 그래프 위에서 보인다.
- 개수 힌트는 `aria-live="polite"` 이며 `"no matches"` 또는 `"N terms"` / `"1 term"` 을 낸다.

### 2.9 입력 요소 계약

```jsx
<input id="atlas-search" name="q" type="search" value={A}
       placeholder="Search the dictionary" aria-label="Search the dictionary"
       autoComplete="off" autoCorrect="off" autoCapitalize="off"
       spellCheck={false} enterKeyHint="search" />
```

`Clear search` 라벨을 가진 클리어 버튼이 있고, 클릭하면 값을 비우고 입력에 다시 포커스를 준다.

### 2.10 검색 관련 스토어 상태

```js
{ hoveredSlug, focusedSlug, activeSection, query, matchCount, matchSlugs,
  searchActive, repackTick, sheetExpanded, searchResetTick, sectionColorOn, overviewSection }
```

---

## 3. 이 저장소에서 복사되지 않았던 기능 (Gap)

| 레퍼런스 기능 | 조사 시점의 이 저장소 상태 | 판정 |
| --- | --- | --- |
| 라이브러리 수준 검색 API | `src/` 전체에 search/query/index/match 개념 없음. `GraphPresentation` 에 강조 채널 없음 | **부재** |
| 퍼지·프리픽스·점수 랭킹 | `BrowserGraphFixture.tsx` 의 `toLocaleLowerCase().includes()` 부분 문자열 1개 | **부재** |
| 메타데이터(정의·요약·섹션) 검색 | `label, id, kind, type` 4개 필드만. `metadata` 는 미검색 | **부재** |
| 그래프 내 매칭 하이라이트 | `sceneVisualForNode` 가 selected / 1-hop / depth 만 인지 | **부재** |
| 매칭 서브그래프 클러스터 재패킹 | `src/layout.ts` 에 부분집합 재배치 함수 없음 | **부재** |
| 검색 결과를 카메라로 프레이밍 | `nodeCameraTarget` 는 단일 노드 + 1-hop 만 | **부재** |
| `?q=` URL 모드 | `?q` 는 코드에서 **삭제 대상**으로만 존재(`DenseGraphFixture.tsx`) | **부재** |
| 항상 보이는 확장형 검색 필드 | `⌘K` 모달 팔레트만 존재 | **부재** |
| `/density` 라우트 검색 | 검색 UI 자체가 없음. `semantic-fallback` 은 정적 목록 | **부재** |
| 결과 개수 `aria-live` 안내 | 없음 | **부재** |
| `/`, `⌘F`, `Enter`, `Escape` 검색 키보드 계약 | `⌘K` 와 `/` 는 팔레트 오픈용 | **부재** |
| 검색 유닛 테스트 / 브라우저 검증 | 없음 (Matrix 1건만) | **부재** |

기존 구현(`⌘K` 팔레트)은 "정확한 이름으로 노드 점프" 용도였고, 레퍼런스의 검색은 "쿼리로 그래프를 읽기 모드로 전환" 용도다. 두 기능은 서로 다른 층위이므로 **둘 다 유지**한다.

---

## 4. 구현 계약

### 4.1 라이브러리 (`src/`)

#### 4.1.1 `src/search.ts` — 검색 엔진

| 심볼 | 설명 |
| --- | --- |
| `createGraphSearchIndex(input, options?)` | 그래프 입력으로부터 재사용 가능한 검색 인덱스 생성. 동일 입력 → 동일 문서·동일 순위. |
| `searchGraph(index, query, options?)` | 인덱스에 쿼리 실행. |
| `toGraphSearchText(value)` | 마크다운을 검색용 평문으로 평탄화(레퍼런스 `nL` 동일 규칙). |
| `GRAPH_SEARCH_FIELD_BOOSTS` | 필드 가중치(레퍼런스 `nA` + 그래프 고유 `identity`). |
| `GraphSearchOptions` | `limit`(15), `relativeScoreThreshold`(0.3), `fuzzy`(0.2), `prefix`(true), `combineWith`("OR"), `resolveDocument`. |

레퍼런스와의 필드 매핑:

| 레퍼런스 필드 | 이 저장소 필드 | 출처 |
| --- | --- | --- |
| `title` | `title` | `node.label` |
| `aliases` | `aliases` | `metadata.aliases` 등 |
| `usage` | `usage` | `metadata.usage` 등 |
| — | `identity` | `node.id` + `kind` + `type` + `metadata.section` |
| `description` | `description` | `metadata.summary` 등 |
| `body` | `body` | `metadata.definition` 등 |
| `avoid` | `avoid` | `metadata.avoid` 등 |

#### 4.1.2 `src/presentation.ts` — 강조 채널

```ts
readonly matchedNodeIds?: readonly string[] | null;
```

- `undefined`/`null` → 검색 중 아님(일반 읽기 티어).
- `[]` → 검색 중이지만 매칭 0건(그래프 전체가 컨텍스트로 읽힘).
- `["a", "b"]` → 검색 중, 나열 순서가 ** relevancy 순서**.

#### 4.1.3 `src/layout.ts` — 매칭 티어 + 결정론적 클러스터

- `visualCue()` 에 매칭 티어 추가: `selected > matched > direct neighbour > distant context`.
- `linkVisualCue()` 에서 검색 중에는 **양 끝점이 모두 매칭된 간선만** 표시.
- `searchClusterPositions()` — 레퍼런스의 d3-force 재패킹을 **결정론적**으로 재현:
  - Vogel 스파이럴 시드 → 고정 반복 횟수의 완화 패스(반발·링크 스프링·중심 당김·최소 이격).
  - 무작위값을 쓰지 않으므로 동일 입력 → 동일 클러스터(저장소의 결정론 계약 유지).
  - 클러스터 무게 중심은 원점, `fitRadius` 산출.
- **선택이 우선**: 활성 선택이 있으면 검색 클러스터는 위치를 바꾸지 않고 강조 티어만 적용한다(선택 1-hop 성좌의 계약을 깨지 않기 위함).

#### 4.1.4 `src/renderer.ts` — 렌더링

- `sceneVisualForNode()` — 매칭 노드는 깊이 감쇠를 받지 않고 `primary` 라벨 티어 + 확대 스케일.
- `applyFinalVisuals()` — 매칭 노드에 focus rim 을 표시해 그래프 안에서 클러스터가 식별되게 한다.
- `searchCameraTarget()` + `focusNodeSet()` — 매칭 클러스터만 프레임하는 카메라 타깃(선택 프레이밍과 동일한 실루엣 인식 수학).

#### 4.1.5 `src/workbench.ts` — 호스트 API

| 메서드 | 설명 |
| --- | --- |
| `search(query, options?)` | 읽기 모드를 바꾸지 않고 쿼리만 실행. |
| `setSearchQuery(query, options?)` | 쿼리 실행 + 매칭 강조 + 클러스터 재배치 + 카메라 프레이밍. |
| `getSearchState()` | `{ active, matches, nodeIds, query }`. |
| `clearSearch()` | 쿼리 해제, 강조 해제, 카메라 원복. |

- 워크벤치가 검색 읽기 모드의 소유자다. 호스트의 `setPresentation()` 은 매칭을 drop 할 수 없다.
- `GraphWorkbenchOptions.searchOptions` 로 인덱스 생성 규칙(필드 가중치·문서 해석)을 호스트가 지정할 수 있다.

### 4.2 데모 픽스처 (`sites/browser-fixture/`)

- `app/graph-search/useGraphSearch.ts` — 공유 검색 상태(쿼리·랭킹·`?q=` 주소·워크벤치 전달).
- `app/graph-search/GraphSearchField.tsx` — 레퍼런스 스타일 확장형 필드(아이콘 → focus 시 확장, 클리어 버튼, `aria-live` 개수 힌트).
- `/` 라우트와 `/density` 라우트 **양쪽**에 동일 컴포넌트를 사용한다.
- `?q=` 는 `history: "replace"` + 250ms 스로틀, 빈 쿼리면 파라미터 제거(레퍼런스와 동일).
- `/` 와 `⌘F` 는 검색 필드에 포커스. `⌘K` 는 기존 Matrix 팔레트를 연다(기존 계약 유지).
- `Escape` 는 입력에 포커스가 있을 때 쿼리를 비운다.
- `Enter` 는 최고 매칭을 선택하고 쿼리를 비운다(레퍼런스 §2.7 동일).
- `/density` 의 `semantic-fallback`(WebGL 없음 읽기 표면)도 같은 쿼리를 따른다.

---

## 5. 수용 기준

| ID | 기준 |
| --- | --- |
| AH-SEARCH-001 | 동일 입력·동일 쿼리는 항상 같은 매칭 순서를 반환한다. |
| AH-SEARCH-002 | 최고 점수의 30% 미만 매칭은 제외되고, 결과는 최대 15건이다. |
| AH-SEARCH-003 | 오타가 있는 쿼리도 매칭된다(짧은 단어 기준 20% 편집 거리). |
| AH-SEARCH-004 | `label` 뿐 아니라 `metadata` 의 정의·요약·사용 맥락·섹션도 검색된다. |
| AH-SEARCH-005 | 검색 중에는 매칭 노드가 강조되고 비매칭 노드는 컨텍스트 티어로 낮아진다. |
| AH-SEARCH-006 | 매칭 노드가 없을 때도 검색 모드로 읽힌다(전체가 낮은 대비). |
| AH-SEARCH-007 | 검색 중에는 양 끝점이 모두 매칭된 간선만 보인다. |
| AH-SEARCH-008 | 매칭 노드들은 하나의 클러스터로 묶이고, 비매칭 노드의 위치는 유지된다. |
| AH-SEARCH-009 | 동일 입력·동일 매칭 목록은 항상 같은 클러스터를 만든다. |
| AH-SEARCH-010 | 활성 선택이 있으면 검색은 강조만 바꾸고 선택 배치는 건드리지 않는다. |
| AH-SEARCH-011 | `?q=<query>` 로 페이지를 열면 같은 읽기 모드가 복원된다. |
| AH-SEARCH-012 | `/` 와 `⌘F` 는 검색 입력에 포커스한다. `Enter` 는 최고 매칭을 선택하고 쿼리를 비운다. `Escape` 는 쿼리를 비운다. |
| AH-SEARCH-013 | 결과 개수는 `aria-live="polite"` 로 `"N terms"` / `"no matches"` 형태로 알린다. |
| AH-SEARCH-014 | `/density` 라우트도 동일 검색을 제공하고, `semantic-fallback` 목록도 같은 쿼리를 따른다. |

---

## 6. 검증 증거

### 6.1 유닛 (Vitest, `test/search.test.ts`, 29 케이스)

- `npm run check` → **6 파일 / 89 테스트 통과** (`test/search.test.ts` 29건 포함).
- 엔진: 랭킹, 퍼지, 프리픽스, 메타데이터/섹션 검색, 상대 임계값, 15건 상한, 결정론, 마크다운 평탄화, 호스트 `resolveDocument`.
- 레이아웃: 검색 티어, 0건 매칭, 간선 필터, 클러스터 이동, 결정론, 선택 우선 규칙.
- 워크벤치: 매칭 적용, 클러스터 프레이밍 + 원복, 호스트 프레젠테이션 갱신 보존, 읽기 모드 무변경 조회, 입력 변경 시 쿼리 재실행.

### 6.2 브라우저 (Playwright, 5 신규 케이스)

`npm run check:browser` → **32 passed / 1 skipped**.

| 케이스 | 확인 |
| --- | --- |
| `the persistent search field focuses with the slash shortcut and emphasizes the matched node` | `/` 포커스, `?q=` 갱신, 매칭 노드 불투명도 > 비매칭 노드, `1 term` 힌트 |
| `a shared search link restores the same reading mode` | `?q=ingest` 링크 복원 |
| `the search field submits the best match and clears the running query` | Enter → `?term=profile:platform`, 쿼리 초기화 |
| `the search field recovers a term from a misspelled query` | `cosole` → `console` fuzzy 매칭 |
| `the density route searches the 150-term dictionary and filters the semantic fallback` | 150노드 라우트 검색 + fallback 목록 필터 |

---

## 7. 레퍼런스 대비 의도적 차이

| 항목 | 레퍼런스 | 이 저장소 | 사유 |
| --- | --- | --- | --- |
| 결과 표시 | 그래프 위에서만 (드롭다운 없음) | 그래프 강조 + Matrix 팔레트의 랭킹 목록 | 저장소에 이미 존재하던 노드 점프 팔레트를 폐기하지 않는다. |
| 클러스터 배치 | d3-force-3d 180 tick (무작위 지터 포함) | 결정론적 Vogel 스파일 + 완화 패스 | 저장소의 결정론적 레이아웃 계약을 유지해야 한다(같은 입력 → 같은 배치). |
| 필드 | `title, aliases, description, body, usage, avoid` | + `identity`(id/kind/type/section) | 그래프 고유 좌표가 검색 대상이 되어야 한다. |
| 선택 우선순위 | 검색과 선택이 독립 | 선택이 있으면 선택이 읽기 배치를 소유 | 선택 1-hop 성좌 계약(`AH-SAFE-001`) 보호. |
| 카메라 | `fitRadius` 기반 자동 프레이밍 | 같은 실루엣 인식 프레이밍 수학 재사용 | 렌더러가 이미 가진 품질을 그대로 사용. |

---

## 8. 검증 시 발견한 저장소 자체 결함 (수정)

`sites/browser-fixture/.openai/hosting.json` 이 커밋 `661e06c` 에서 삭제되었으나 `build/sites-vite-plugin.ts` 는 여전히 이를 빌드 산출물에 복사한다. 그 결과 `npm run site:build` 가 `ENOENT` 로 실패해 `npm run check:browser` 전체가 실행 불가했다. 프로젝트 식별자를 노출하지 않도록 값을 비워 두고 파일을 복원했다.
