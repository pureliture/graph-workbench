# 레퍼런스 정렬 그래프 UX milestones

- requirements/design: [graph-reference-ux-spec.md](./graph-reference-ux-spec.md)
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
