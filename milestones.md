# 그래프 데스크톱 UX 구현 마일스톤

> 선택 계약: `agentic-execution`
>
> 승인 요구사항: [`docs/aihero-reference-ux-requirements.md`](docs/aihero-reference-ux-requirements.md)
>
> 승인 설계: [`docs/graph-reference-ux-spec.md`](docs/graph-reference-ux-spec.md)의 D1–D5와 위 요구사항의 기능 경계
>
> 범위: 최대 150개 노드의 데스크톱 경험. 모바일·태블릿·터치 전용 동작은 제외한다.

## 슬라이스 상태

| 슬라이스 | 상태 | 관찰 가능한 결과 | 증거 |
| --- | --- | --- | --- |
| 1. density + hover | 완료 | 150개 노드의 모든 body/label이 유지되고, idle 관계선은 숨겨지며 hover 시 incident dotted edge와 국소 attraction이 나타남 | `npm test` 61/61, density Chromium 시나리오 통과 |
| 2. selection + camera | 완료 | 선택·해제·orbit·zoom이 동일 camera pose를 보존하고 no-flicker/no-re-layout으로 종료됨 | `check:browser` Chromium orbit/selection 시나리오 통과 |
| 3. content + detail | 완료 | 실제 term 콘텐츠, rich definition, 관계 탐색, pager, copy/share를 한 흐름으로 제공함 | density deep-link/rich-detail 시나리오 통과 |
| 4. graph accessibility | 완료 | semantic fallback과 desktop keyboard 경로를 제공하며 reference branding/overlay는 포함하지 않음 | graph 시나리오 + rendered HTML/lint 통과 |

## 활성 슬라이스

모든 데스크톱 구현 슬라이스가 완료되었다. 모바일·태블릿·터치 전용 동작은 사용자 지시에 따라 검증하지 않는다.

## 승인된 설계 보정

완료된 blocker 보정: 상세 rail의 닫기 버튼이 그래프 controls와 겹치지 않도록 rail layering을 조정했다. Chromium에서 닫기 동작을 재검증했다.

## 다음 행동

최종 검증: `npm test` 61/61, fixture lint, site build/rendered HTML, reference-branding 제거 Chromium 시나리오를 통과했다. `tsconfig.tsbuildinfo` 같은 build-only 산출물은 커밋하지 않는다.
