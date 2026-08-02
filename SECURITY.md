# 보안 정책

## 지원 범위

현재 `graph-workbench`는 npm registry, GitHub Release, version tag 없이 immutable Git
commit으로 설치하는 experimental `0.1.0` 배포 모델입니다. 과거 commit에 대한 backport나
보안 patch 제공은 보장하지 않습니다.

| 대상 | 조사 기준 |
|---|---|
| `main`의 최신 source | 지원 — 재현과 영향 확인의 기준입니다. |
| README에 명시된 immutable Git commit | 제한적 지원 — 최신 source에서도 재현 가능한지 먼저 확인합니다. |
| 과거 Git commit, fork, 로컬 미공개 변경 | 지원하지 않음 |

이 정책은 support 또는 SLA를 약속하지 않습니다. 보안 관련 이슈도 유지보수자의 가용 범위에서
처리합니다.

## 취약점 신고

먼저 저장소 [Security 페이지](https://github.com/pureliture/graph-workbench/security)에
`Report a vulnerability`가 표시되면 해당 private form을 사용하세요. 이 기능을 사용할 수 없을
때에도 취약점 세부정보를 public Issue, Pull Request, commit, discussion에 올리지 마세요.

대신 [비공개 보안 신고 경로 요청 form](https://github.com/pureliture/graph-workbench/issues/new?template=security_channel_request.yml)을
열어 다음처럼 **비민감 정보만** 적어 private 신고 경로를 요청합니다.

```text
제목: Security: private reporting channel request

본문: 취약점 세부정보 없이 private 연락 경로를 요청합니다.
```

재현 절차, exploit, credential, access token, 개인 정보, 실제 URL·IP·파일 경로, 고객·운영
data는 이 요청에 포함하지 않습니다. 유지보수자는 private
[GitHub Security Advisory](https://docs.github.com/en/code-security/concepts/vulnerability-reporting-and-management/repository-security-advisories)를
만들고 신고자를 collaborator로 초대한 뒤 세부 내용을 요청합니다.

Private channel이 제공된 후에는 영향 범위, 최소 재현 절차, 예상 영향, 사용 중인 Node.js와
browser 환경, 가능한 완화책을 함께 알려 주세요. 제3자 시스템을 대상으로 한 공격·데이터
수집은 수행하지 마세요.

## 공개 수정

수정이 준비되기 전에는 공개 Issue나 Pull Request에 취약점 원인·exploit 상세를 남기지
않습니다. 유지보수자가 수정과 공개 시점을 조율한 뒤, 필요한 범위에서 changelog 또는 Issue로
안내합니다.

일반적인 사용 문의와 비보안 bug report는 [CONTRIBUTING.md](CONTRIBUTING.md)를 따르세요.
