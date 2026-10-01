# Contributing to LoopSmith

Use GitHub issues for reproducible bugs and focused feature proposals. Discuss major musical-model, project-schema, or licensing changes before implementation.

## Development

Use Node.js 24 LTS (minimum 22.12) and npm 10 or newer:

```sh
npm ci
npm run dev
```

The local `@loopsmith/core` package builds from `src/core.ts`; do not commit its `dist` directory. Generated browser builds, reports, raw corpus data, and release archives are also excluded from Git.

## Pull requests

- Keep changes focused and preserve unrelated code.
- Add regression tests before fixing a bug where practical.
- Preserve seeded determinism and schema compatibility unless an explicit migration is included.
- Exercise keyboard access, responsive layout, and worker cancellation for interface changes.
- Do not add credentials, analytics, account requirements, copyrighted game melodies/samples, or source corpus sequences.
- Preserve third-party notices and record the source/license of any new dependency or corpus input.
- Explain behavioral changes and the checks actually run in the PR description.

```sh
npm run test:package
npm run typecheck
npm run lint
npm test
npm run build
npm run test:e2e
npm run package:itch
npm run verify:release
npm run test:itch
```

Playwright uses installed Google Chrome (`channel: 'chrome'`). Install it with `npx playwright install chrome` if needed. Tests bind ports 4174 and 4186; run build/package/browser commands sequentially because they share `dist`. Never run release preparation in a live production checkout.

Contributions to application code are licensed under the project's MIT License. Third-party code retains its own license. See [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md), [SECURITY.md](SECURITY.md), and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
