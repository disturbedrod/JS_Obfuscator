# Roadmap

What has been built, what is waiting to be released, and what comes next. [CHANGELOG.md](CHANGELOG.md) records the
user-facing changes of each release; this file tracks the plan. When an item is done, tick it here, move it to
**Done**, and add it to an "Unreleased" section at the top of the CHANGELOG (create it if needed). Rename that
section to the version number when you release.

_Last updated: 2026-10-18._

## Status

- **Released:** 1.0.0 (2026-10-02), uploaded to the VS Code Marketplace by hand.
- **Not yet released: 1.1.0**, on `macos_branch`. `package.json` is at 1.1.0 and the CHANGELOG entry is headed
  "1.1.0 - Unreleased". It contains the javascript-obfuscator 5.9.0 upgrade, per-file prefixes in folder runs, tests,
  ESLint, CI and the release workflow.
- **Verified locally:** typecheck, lint, 44 unit tests, and 15 integration tests on VS Code 1.142 and 1.95.
- **Not verified yet:** the GitHub Actions workflows, which have never run on GitHub.

## Done

### Phases 1–4 (up to 1.0.0)

- [x] **Phase 1:** obfuscate the current file into a new file, every file in a folder or workspace, or a selection;
  Explorer context menu; **Obfuscate File As…**
- [x] **Phase 2:** presets, `jsObfuscator.options.*` settings, output suffix and folder, exclude globs, per-folder
  `.obfuscatorrc.json` with a schema, preset quick pick
- [x] **Phase 3:** TypeScript and inline HTML `<script>` support, diff preview, preset in the status bar, source maps
- [x] **Phase 4:** Marketplace metadata (publisher, license, icon, repository links), unit and integration tests,
  ESLint, GitHub Actions CI, release workflow

### 1.1.0 (not yet released)

- [x] **A1:** javascript-obfuscator 5.8.0 → 5.9.0, which includes the 5.8.1 fixes for `controlFlowFlattening` and
  `transformObjectKeys`. The regenerated settings and schema did not change.
- [x] **A2:** `@types/vscode` 1.140
- [x] **B1:** folder runs give each file its own `identifiersPrefix` part (`filePrefix()` in `src/obfuscator.ts`), so
  separately obfuscated scripts on one page can't collide on helper names. Setting `jsObfuscator.output.uniquePrefixes`.
- [x] **D1:** unit tests (`test/unit/`, Mocha)
- [x] **D2:** integration tests in VS Code (`test/integration/`, `@vscode/test-cli`), on the latest VS Code and 1.95
- [x] **D3:** ESLint flat config, CI on Linux, macOS and Windows (`.github/workflows/ci.yml`)
- [x] **D4:** release workflow for GitHub releases, Open VSX and the Marketplace (`.github/workflows/release.yml`),
  `npm run publish:ovsx`

## Next steps

### 1. Publish 1.1.0

- [ ] Commit and push `macos_branch`, then check that the CI workflow passes on all three operating systems
- [ ] Open VSX one-time setup: sign in at open-vsx.org, sign the publisher agreement, create a token, run
  `npx ovsx create-namespace rsandoval1206 -p <token>`, and add the token as the `OVSX_PAT` repository secret
  (see README → Publishing)
- [ ] Optional: add a Marketplace token as the `VSCE_PAT` secret. Without it, keep uploading the `.vsix` by hand.
- [x] Set `version` to `1.1.0` in `package.json`
- [ ] On release day, replace "Unreleased" in the CHANGELOG's `1.1.0` heading with the date
- [ ] Merge to `main`, then push the tag `v1.1.0`. The release workflow does the rest. Or upload
  `js-obfuscator-pro-1.1.0.vsix` (from `npm run package`) to the Marketplace by hand.

### 2. Fixes

- [ ] **B2: debug protection under Node.js.** With the `high` preset, debug protection keeps a timer running, so Node
  scripts never exit. _Open decision:_ when `target` is `node`, turn off `debugProtectionInterval` automatically, or
  only warn. Files: `src/obfuscator.ts` (`buildOptions`), the README presets table, plus a unit test.
- [ ] **B3: keep VS Code responsive.** Obfuscation is synchronous and blocks the extension host on large files or the
  `high` preset. Run each job in a `worker_threads` worker so Cancel can stop a file mid-way. Files: new
  `src/worker.ts`, `src/obfuscation.ts`, and a second esbuild entry point in `package.json`.

### 3. Small, high-value features

- [ ] **C2: run report.** Show size before and after, growth ratio and time per file: in the log for folder runs, and
  in the notification for single files.
- [ ] **C3: check the output.** Syntax-check the obfuscated code (and optionally run it once for Node targets) to catch
  broken output before it ships. Add it as a command and as an optional step after obfuscating.
- [ ] **C5: more settings.** Add settings for useful options that are only in `.obfuscatorrc.json` today: `domainLock`,
  `domainLockRedirectUrl`, `seed`, `identifiersPrefix`, `stringArrayWrappersCount`, `stringArrayWrappersType`,
  `renameProperties`, `forceTransformStrings`, `ignoreImports`, `simplify`. Edit `SETTINGS` in
  `scripts/generate-config.mjs`, then run `npm run generate-config`.

### 4. Larger features

- [ ] **C1: obfuscate on save.** Opt-in `jsObfuscator.onSave` with globs. On save, rewrite the output file; never
  touch the original.
- [ ] **C4: clean the output folder.** A command that deletes files in `obfuscated/` whose source no longer exists,
  after a confirmation listing them. Today stale files stay until you delete the folder.
- [ ] **C6: named custom presets.** Defined in settings or `.obfuscatorrc.json`, shown in the preset quick pick and the
  status bar.
- [ ] **C8: wider selection support.** Obfuscate selections in TypeScript (transpile the fragment first) and inside an
  HTML `<script>`.

### 5. Optional

- [ ] **C9: more file types.** JSX and TSX (`javascriptreact` and `typescriptreact`), and inline scripts in `.vue` and
  `.svelte` files.
- [ ] **C7: compare presets.** A view that obfuscates the current file with each preset side by side, showing size,
  time and a sample of the output.
- [ ] **C10: Pro API (opt-in).** javascript-obfuscator's `obfuscatePro` (VM obfuscation), custom presets and
  `getProQuota()`. The token goes in VS Code SecretStorage. It sends code to a server, so it stays off by default and is
  clearly labelled.

## Deferred dependency upgrades

Each one is a major version. Upgrade them one at a time, with the full test suite.

| Package | Current | Latest | Risk |
| --- | --- | --- | --- |
| `typescript` | 5.9 | 7.x | TypeScript 7 is the native port; `transpileModule` (used in `src/typescript.ts`) may not be available in the same form |
| `parse5` | 7.3 | 8.x | API changes may affect `src/html.ts` |
| `@vscode/vsce` | 3.9 | 4.x | Check the changelog before packaging with it |
| `@types/node` | 20 | 26 | Keep on 20 to match esbuild's `--target=node20` |

## Known issues

- Folder runs never delete stale files from the output folder (see C4).
- `npm audit` reports dev-only warnings in `@vscode/test-cli`'s own dependencies. They don't ship in the extension,
  and the fix needs `npm audit fix --force`.
- On some Macs, F5 can't attach the debugger (IPv6 `localhost`); use Ctrl+F5. See README → Troubleshooting.
