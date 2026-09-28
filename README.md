# JS Obfuscator

A Visual Studio Code extension for obfuscating JavaScript, powered by
[javascript-obfuscator](https://github.com/javascript-obfuscator/javascript-obfuscator).

## Features

### Obfuscate the current file

Open a `.js`, `.mjs` or `.cjs` file and run **JS Obfuscator: Obfuscate File to New File** from:

- the Command Palette (`Cmd/Ctrl+Shift+P`)
- the editor context menu (right-click in the editor)
- the editor title bar menu

The obfuscated code is written to a new file next to the original: `app.js` becomes `app.obfuscated.js`.
The original file is never modified. If the output file already exists, you are asked before it is overwritten.
Unsaved changes in the editor are included, because the extension reads the current editor contents.
For an unsaved (untitled) editor, you are asked where to save the output.

### Obfuscate a whole folder or workspace

Run **JS Obfuscator: Obfuscate All JavaScript in Folder** from:

- the Command Palette: processes every folder in the workspace
- the Explorer context menu on a folder: processes only that folder (multi-select works too)

Every `.js`, `.mjs` and `.cjs` file is obfuscated into an `obfuscated/` folder at the root of its workspace folder,
mirroring the original structure: `src/lib/math.js` becomes `obfuscated/src/lib/math.js`.

- Original files are never modified. You confirm the file count before anything is written.
- Skipped: `node_modules/`, `.git/`, the `obfuscated/` folder itself, and `*.obfuscated.js` files from the single-file command.
- Files that fail to parse are skipped and listed in the **JS Obfuscator** output panel; the rest still run.
- The run can be cancelled from the progress notification.
- Existing files in `obfuscated/` are overwritten, but stale files there are not deleted. Delete the folder for a clean build.
- Only JavaScript files are written; other assets (HTML, CSS, images) are not copied.
- Each file is obfuscated independently. Global names are not renamed, so code shared between files through globals keeps working.

### Obfuscation strength

Obfuscation uses javascript-obfuscator's `default` preset with every string literal moved into a base64-encoded
string array. Configurable presets are planned for Phase 2.

## Roadmap

- [x] **Phase 1a:** obfuscate the current file into a new file
- [x] **Phase 1b:** obfuscate every JS file in the project/folder
- [ ] **Phase 1c:** obfuscate a selection; Explorer context menu; "Save As" output path
- [ ] **Phase 2:** settings (presets low/medium/high/custom, common options, output mode/suffix/folder), per-project `.obfuscatorrc.json`, preset quick pick
- [ ] **Phase 3:** TypeScript and inline HTML `<script>` support, diff preview, status bar preset, source maps
- [ ] **Phase 4:** unit and integration tests, ESLint, GitHub Actions CI, marketplace metadata, publish to VS Code Marketplace and Open VSX

## Development

```bash
npm install
npm run compile
```

Press **F5** in VS Code to launch an Extension Development Host with the extension loaded.

The extension is bundled with esbuild into `out/extension.js`, so runtime dependencies such as
`javascript-obfuscator` are included in the package even though `node_modules` is excluded.

| Script | Purpose |
| --- | --- |
| `npm run compile` | Type-check and bundle once |
| `npm run watch` | Rebundle on change (used by F5) |
| `npm run typecheck` | Run `tsc` without emitting |
| `npm run package` | Build a `.vsix` |

## Packaging

```bash
npm run package
```

This produces a `.vsix` you can install via **Extensions → … → Install from VSIX**.

## Credits

Obfuscation is performed by [javascript-obfuscator](https://github.com/javascript-obfuscator/javascript-obfuscator)
(BSD-2-Clause).
