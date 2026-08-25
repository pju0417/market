# .claude/rules

이 디렉터리는 향후 Claude Code 자동화 규칙(예: 특정 경로 수정 시 추가 검증)을 위한 자리다.
이번 초기 구축 단계에서는 비워둔다.

## Hooks에 대한 결정

`settings.json` 기반 hook(예: 파일 수정 후 자동으로 typecheck/lint/test 실행)은 이번 단계에서
**의도적으로 추가하지 않는다.** 이유:

- 아직 실제 경제 로직이 없어 매 수정마다 전체 파이프라인을 자동 실행할 실익이 적다.
- 프로젝트 경로에 공백/한글이 포함되어 있어 hook 커맨드 이식성을 먼저 검증할 필요가 있다.
- 잘못 구성된 hook은 정상적인 작업 흐름을 막을 수 있어, 실제로 필요해지는 시점(Milestone 1
  이후, 경제 로직 변경이 잦아질 때)에 신중히 추가하는 편이 안전하다.

대신 개발 루프는 다음 명령을 수동/CI에서 순서대로 실행하는 것으로 문서화한다
([CLAUDE.md](../../CLAUDE.md), [README.md](../../README.md) 참고):

```bash
npm run typecheck
npm run lint
npm test
npm run simulate:smoke
```

Milestone 1 이후 실제로 반복 비용이 커지면, 코드 수정(Edit/Write) 후 자동으로 `npm run
typecheck`를 실행하는 PostToolUse hook 추가를 재검토한다.
