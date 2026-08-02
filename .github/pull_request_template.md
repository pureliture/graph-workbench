## 변경 요약

<!-- 사용자가 체감하는 변경과 변경하지 않은 범위를 간결히 설명합니다. -->

## Contract 영향

<!-- public API, GraphInput validation, selection semantics, renderer contract, host ownership 중 영향을 받는 범위를 적습니다. 영향이 없으면 `없음`이라고 적습니다. -->

## 검증

<!-- 실행한 명령과 결과를 적습니다. 실행하지 못한 검증은 이유를 함께 적습니다. -->

```text
# 일반 변경
npm run check

# browser 관련 변경 (`npm run check` 포함)
npm run check:browser
```

## 공개 정보 점검

<!-- screenshot, fixture, log, 문서에 secret, credential, private URL·host명, 개인·고객 데이터, 보안 취약점 세부정보가 없는지 적습니다. -->

## 체크리스트

- [ ] 변경 범위와 public API/contract 영향을 확인했습니다.
- [ ] 관련 검증을 실행했거나 실행하지 못한 이유를 기록했습니다.
- [ ] 추가한 fixture, screenshot, log, 문서가 공개 가능한 정보만 포함하는지 확인했습니다.
- [ ] 보안 취약점 또는 민감한 운영 정보는 PR에 포함하지 않았습니다.
- [ ] 필요하면 README 또는 API 문서를 함께 갱신했습니다.
