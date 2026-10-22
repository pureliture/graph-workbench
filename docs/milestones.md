# 레퍼런스 정렬 그래프 UX milestones

- requirements/design: [graph-reference-ux-spec.md](./graph-reference-ux-spec.md), [graph-search-reference-spec.md](./graph-search-reference-spec.md)
- execution contract: `agentic-execution`
- overall status: completed
- approved amendments: none
- current stop reason: none

## Slice S1 — 전역 장면 유지형 선택 프레이밍

- status: completed
- observable result: 비선택 장면의 전역 분포를 유지한 채 선택 노드와 직접 관계만 강조하고, 선택 노드가 남은 그래프 영역의 중심 가까이에 위치한다.
- owned seams: `src/layout.ts`, `src/renderer.ts`, density browser fixture, existing unit/browser tests
- evidence:
  - `npm run check` PASS — 5 test files, 59 tests.
  - `npm --prefix sites/browser-fixture run test:browser -- tests/graph-workbench.pw.ts --grep "density"` PASS — density idle/selection and deep-link flows, 2 tests.
  - 라이브 in-app browser에서 drawer가 열린 선택 장면의 graph canvas가 drawer를 제외한 영역(`1484px`)으로 측정되고, 선택 노드가 그 영역의 중심에 배치되며 직접 관계만 방사하는 것을 확인.
  - `git diff --check` PASS.
- next action: S2에서 유휴 장면의 화면 점유율과 3D 깊이 단서를 레퍼런스와 맞춘다.

## Slice S2 — 전역 밀도·깊이·움직임

- status: completed
- observable result: 최대 150개 노드에서 body 분포와 깊이 단서가 유지되고 label 과밀만 제한된다.
- owned seams: `src/renderer.ts`, density fixture camera/visibility lifecycle, density browser assertions
- evidence:
  - renderer-owned silhouette-aware full-graph camera target을 추가해 async Object3D 생성 전 vendor fit에 의존하지 않도록 수정.
  - body/label density sampling을 중앙 우선에서 화면 간격을 최대화하는 deterministic farthest-point sampling으로 변경.
  - density fixture가 최종 scene observation 이후 fit을 한 번 더 요청하고 screen projection bounds를 관측하도록 보강.
  - `npm run check` PASS — 5 test files, 59 tests.
  - `npm --prefix sites/browser-fixture run test:browser -- tests/graph-workbench.pw.ts --grep "density"` PASS — 2 tests. 유휴 표시 body bounds가 viewport 폭·높이 각각 50%를 초과하고, z depth span이 100을 초과함을 브라우저에서 검증.
  - in-app browser에서 유휴 150-node 장면이 중앙 군집이 아닌 전역 분포를 사용하고, 선택 후에도 그 분포·3개 직접 관계·선택 중심 프레이밍을 유지하는 것을 확인.
- next action: S3에서 placeholder 중심 fixture를 의미 있는 topology와 레퍼런스 순서의 상세 패널 흐름으로 교체한다.

## Slice S3 — 의미 있는 관계 topology와 상세 패널 흐름

- status: completed
- observable result: 선택 대상의 직접 관계와 상세 패널이 레퍼런스와 같은 탐색 순서를 제공한다.
- owned seams: `sites/browser-fixture/app/density/DenseGraphFixture.tsx`, density styles, density browser tests
- evidence:
  - Query 직접 topology를 Index, Evidence, Vector, Model, Provider, Context 6개 의미 관계로 확장하고 총 150 nodes/149 links 규모는 유지.
  - 상세 panel에 category, definition, usage, related concepts, copy term link, clear focus, previous/next 흐름을 추가.
  - density targeted browser 2 tests PASS — deep-link 초기 선택에서도 Query body와 6개 직접 관계선이 보이고, Model 관계 이동·URL·copy/clear가 동작.
  - in-app browser에서 패널 정보 순서와 전역 graph context를 직접 확인.
- next action: S4에서 unit, build, rendered-html, 전체 browser suite를 실행하고 승인된 관찰 조건을 최종 대조한다.

## Slice S4 — 통합 브라우저 검증

- status: completed
- observable result: unit, build, rendered-html, browser 증거로 승인된 요구사항을 확인한다.
- owned seams: repository checks, rendered HTML checks, Playwright browser suite, docs evidence
- evidence:
  - `npm run check:browser` PASS — unit 5 files/59 tests, browser-fixture lint, site build, rendered-html 3 tests, Playwright 24 passed/1 skipped.
  - Playwright는 실제 WebGL canvas에서 150-node density idle/selection, semantic depth bodies, hidden relationship curves, selection transition intermediate frames, direct-neighbor-only movement with stable context anchors, drawer/mobile resize, deep-link/history, keyboard and reduced-motion flows를 검증했다.
  - skipped 1건은 CDP visibility control을 제공하지 않는 실행 환경에서만 건너뛰는 기존 조건부 테스트이며 실패가 아니다.
  - `git diff --check` PASS.
- next action: 승인된 구현 slice의 로컬 검증이 끝났으므로 사용자에게 결과를 인계한다. commit/deploy는 별도 승인 범위다.

## Slice S5 — 레퍼런스 검색 읽기 모드

- status: completed
- observable result: 쿼리가 그래프를 읽기 모드로 전환한다. 매칭 노드가 강조되고 하나의 클러스터로 묶여 카메라가 그 클러스터를 프레임하며, `?q=` 주소로 같은 상태를 공유할 수 있다.
- requirements/design: [graph-search-reference-spec.md](./graph-search-reference-spec.md)
- owned seams: `src/search.ts`, `src/presentation.ts`, `src/layout.ts`, `src/renderer.ts`, `src/workbench.ts`, `sites/browser-fixture/app/graph-search/`, 두 라우트 픽스처, unit/browser tests
- evidence:
  - 레퍼런스 역분석으로 MiniSearch 설정(필드 가중치, `prefix: true`, `fuzzy: 0.2`, `combineWith: "OR"`), 상대 점수 임계값 30%, 15건 상한, 250ms 디바운스 후 매칭 서브그래프 재패킹, `?q=` replace/throttle 주소 계약, `/`·`⌘K`·`⌘F`·`Enter`·`Escape` 키보드 계약, 좌상단 확장형 필드와 `aria-live` 개수 힌드를 확인했다.
  - `src/search.ts` 를 추가해 라이브러리 수준의 검색 인덱스·랭킹·퍼지·메타데이터 검색을 제공한다. `GraphPresentation.matchedNodeIds` 강조 채널, `layout.ts` 의 결정론적 매칭 클러스터, `renderer.ts` 의 매칭 티어와 클러스터 프레이밍, `workbench.ts` 의 `search`/`setSearchQuery`/`getSearchState`/`clearSearch` 를 함께 구현했다.
  - `npm run check` PASS — 6 test files, 89 tests (`test/search.test.ts` 29건).
  - `npm run check:browser` PASS — unit 6 files/89 tests, fixture lint, site build, rendered-html 3 tests, Playwright 32 passed/1 skipped. 신규 5건이 슬래시 단축키, `?q=` 공유 링크, Enter 제출과 쿼리 초기화, 오타 복원, 150-node density 검색과 semantic fallback 필터를 검증했다.
  - skipped 1건은 CDP visibility control을 제공하지 않는 실행 환경에서만 건너뛰는 기존 조건부 테스트이며 실패가 아니다.
  - 저장소 자체 결함 수정: `sites/browser-fixture/.openai/hosting.json` 이 `661e06c` 에서 삭제되었으나 빌드 플러그인이 여전히 요구해 `npm run site:build` 가 `ENOENT` 로 실패했다. 식별자를 노출하지 않는 값으로 복원했다.
- next action: 승인된 구현 slice의 로컬 검증이 끝났으므로 사용자에게 결과를 인계한다. commit/deploy는 별도 승인 범위다.

## Slice S6 — 레퍼런스 렌더링 품질 parity (색상 제외)

- status: completed
- observable result: 노드 재질과 카메라 움직임이 레퍼런스와 같은 특성을 가진다. 색상 팔레트는 제품 고유 체계를 유지한다.
- requirements/design: 레퍼런스 렌더링 계약의 REA 역분석 증거(아래 evidence)와 제품 승인 명세 S1–S4의 시각 계층 유지
- owned seams: `src/renderer.ts`, unit/browser tests, `README.md`
- evidence:
  - REA 역분석으로 레퍼런스 렌더링 계약을 바이트 단위로 확인했다. 노드는 instanced billboard + 커스텀 셰이더의 flat matte disc(hard edge, no shading, opaque, MSAA), dimming은 배경색 paper-mix, 카메라는 camera-controls(`smoothTime` .28 / dragging .1 / rotateSpeed .6), idle drift 0.045 rad/s(500ms 후, 1.6s ease-in), release 관성 exp decay(0.6s), selection fit 1100ms 창, FOV 50°, fit 거리 320~1200(서치 120~1200)이다.
  - 구현: `MeshStandardMaterial` + outline shell 제거 → 불투명 `MeshBasicMaterial` flat disc. 강조 tiers는 투명도 대신 배경색 mix로 표현한다. 라벨에 배경색 halo sprite를 추가했다. Orbit damping 0.08→0.05, rotateSpeed 0.6, idle 방위각 drift(500ms/1.6s ease-in/0.045 rad/s, hover·선택·검색·전이 중 정지), 전이 easing을 exponential ease-out으로 교체했다. FOV 50은 기존 three 기본값과 일치함을 확인했다.
  - 의도적으로 바꾸지 않은 것: 노드 크기 매핑(레퍼런스 inDegree 기반 ↔ 제품 kind/silhouette 기반), paper grain 배경, 4.2s 인트로 sweep, 링크 거리 fade 셰이더.
  - `npm run check` PASS — 6 test files, 100 tests. `npm run check:browser` PASS — unit/lint/site build/rendered-html 3 tests, Playwright 33 passed/1 skipped (신규 halo 1건 포함).
  - skipped 1건은 CDP visibility control을 제공하지 않는 실행 환경에서만 건너뛰는 기존 조건부 테스트이며 실패가 아니다.
  - `git diff --check` PASS.
- next action: S7에서 S6가 의도적으로 남긴 4건(inDegree 크기 매핑, paper grain, 인트로 sweep, 링크 거리 fade)을 마저 일치시킨다.

## Slice S7 — 레퍼런스 품질 parity 후속 4건 (색상 제외)

- status: completed
- observable result: 노드 크기가 inDegree 기반이 되고, 3D 표면에 film grain이 얹히며, idle 진입 시 sweep 인트로가 재생되고, incident 간선이 거리 fade를 가진다.
- owned seams: `src/renderer.ts`, `src/renderer-contract.ts` (`playIntroSweep`), `src/workbench.ts` (idle 마운트 인트로), 픽스처 CSS/텔레메트리, unit/browser tests
- evidence:
  - REA 추가 역분석: 노드 반지름 `2.2 + log1p(inDegree)/log1p(37)*6.5`(2.2~8.7), edge fade(`near=camDist-17.5`, `far=camDist+100`, strength .98, 제곱), search 시 fade 완화 계수.
  - `defaultNodeSilhouette`가 kind 형태를 유지한 채 반지름·앵커를 degree 기반으로 산출한다. 팩토리는 선택적 3번째 인자로 degree를 받으며, 렌더러 내부 sync가 지오메트리를 자동 교체한다.
  - `.graph-shell::after` fractal-noise 오버레이(pointer-events 없음, 렌더러 픽셀 예산과 무관).
  - idle 마운트(선택·검색·reduced-motion 없음)에서 4.2s expo sweep(방위각 -6.6 + 고도 lift). 사용자 드래그가 시작되면 즉시 취소된다.
  - incident 간선에 카메라 거리 기반 fade(제곱)를 적용한다. hover dashed, idle 숨김 링크에는 적용하지 않는다.
  - density 라우트에 200ms 간격 live query projection 텔레메트리(`graph-density-live-query-projection`)를 추가했다. idle drift로 settled 관측 스냅샷이 1초 만에 낡아 hover 테스트가 낡은 좌표를 찌르게 된 것을 확인하고, 테스트를 live 재조준 루프로 바꿨다.
  - `npm run check` PASS — 6 test files, 100 tests. `npm run check:browser` PASS — Playwright 33 passed / 1 skipped(기존 조건부). 1회성 flake(캠퍼스 클릭 타이밍)가 있어 전체 스위트를 재실행해 확정했다.
  - `git diff --check` PASS.
- next action: 승인된 구현 slice의 로컬 검증이 끝났으므로 사용자에게 결과를 인계한다. commit/deploy는 별도 승인 범위다.
