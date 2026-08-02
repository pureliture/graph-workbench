# 기여 가이드

`graph-workbench`는 정규화된 `GraphInput`을 선택 중심의 3D 작업대로 렌더링하는
host-neutral TypeScript 라이브러리입니다. bug fix, 문서, contract·renderer test 개선을
환영합니다. 큰 API 또는 rendering 동작 변경은 먼저 [Issue](https://github.com/pureliture/graph-workbench/issues)를
열어 문제와 호환성 영향을 합의해 주세요.

## 작업 환경

- 라이브러리 build·unit test: Node.js `>=20`
- browser fixture와 Playwright 검증: Node.js `>=22.13.0`

```sh
git clone https://github.com/pureliture/graph-workbench.git
cd graph-workbench
npm ci
npm --prefix sites/browser-fixture ci
```

변경 전후에 다음을 실행하세요.

```sh
# TypeScript build와 unit test
npm run check

# browser fixture lint, build, rendered HTML, Playwright 검증
npm run check:browser
```

browser fixture를 수정하지 않는다면 `npm run check`로 충분할 수 있습니다. Browser entry,
renderer, interaction, fixture 또는 문서의 browser 동작 설명을 변경했다면 `npm run check:browser`를
실행하세요. 이 명령은 `npm run check`를 먼저 실행하므로 두 명령을 따로 반복할 필요는 없습니다.

## Issue와 Pull Request

Issue에는 재현 가능한 최소 정보를 적습니다.

- 기대한 결과와 실제 결과
- Node.js·browser 버전, 사용한 package commit 또는 branch
- 민감정보를 제거한 최소 `GraphInput` 또는 재현 절차
- 가능한 경우 화면 캡처, error message, regression 범위

Pull Request는 한 가지 목적에 집중하고 다음을 포함합니다.

- 변경 이유와 public API·rendering behavior에 미치는 영향
- 관련 Issue 링크와 실행한 검증 명령 및 결과
- 동작 변경에 대응하는 test 또는 fixture 갱신
- 사용자에게 보이는 계약이 바뀌면 `README.md` 갱신

제3자 코드, 생성물, 비밀값, 개인 정보, 실제 운영 endpoint는 포함하지 마세요. 보안
취약점은 [SECURITY.md](SECURITY.md)의 절차를 따릅니다.

## Host 경계

이 라이브러리는 그래프 렌더링과 selection event만 담당합니다. 다음 소유권은 host
application에 남아야 합니다.

- 파일, Tauri IPC, backend, 인증, 영속 상태, domain action
- `GraphInput`의 생성과 domain semantics
- selection persistence, detail UI, 실패 시 fallback UI

기여 코드와 fixture는 이 경계를 우회해 실제 host 상태를 읽거나 action을 실행해서는
안 됩니다. 예제와 test data는 항상 일반화된 값으로 작성하세요.

## 지원 범위

이 저장소는 자원봉사 기반의 experimental `0.1.x` 프로젝트입니다. Issue와 Pull Request는
환영하지만 응답 시간, 기능 수용, 장기 호환성, support 또는 SLA를 보장하지 않습니다.
상세한 배포·버전 안정성 상태는 [README.md](README.md)를 기준으로 합니다.
