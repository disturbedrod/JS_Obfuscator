# JS Obfuscator

A Visual Studio Code extension for obfuscating JavaScript, powered by
[javascript-obfuscator](https://github.com/javascript-obfuscator/javascript-obfuscator).

## Commands

All commands are in the Command Palette under **JS Obfuscator**.

| Command | Where else | Output |
| --- | --- | --- |
| **Obfuscate File to New File** | Editor right-click, editor title bar (lock icon), Explorer right-click on JS files | `app.obfuscated.js` next to the original |
| **Obfuscate File As…** | Editor right-click, Explorer right-click on JS files | Wherever you choose |
| **Obfuscate Selection** | Editor right-click when text is selected | Replaces the selection (one Undo reverts it) |
| **Obfuscate All JavaScript in Folder** | Explorer right-click on folders | Mirrored copy in `obfuscated/` |
| **Select Obfuscation Preset** | | Changes `jsObfuscator.preset` |
| **Create .obfuscatorrc.json** | | Starter config in the workspace root |

## Features

### Obfuscate a file

Run **JS Obfuscator: Obfuscate File to New File** on a `.js`, `.mjs` or `.cjs` file from:

- the Command Palette (`Cmd/Ctrl+Shift+P`): uses the active editor
- the editor context menu (right-click in the editor) or the lock icon in the editor title bar
- the Explorer context menu on one or more JavaScript files, which don't need to be open

The obfuscated code is written to a new file next to the original: `app.js` becomes `app.obfuscated.js`
(the suffix is set by `jsObfuscator.output.suffix`).
The original file is never modified. If the output file already exists, you are asked before it is overwritten.
Unsaved changes in an open editor are included, because the extension reads the current editor contents.
For an unsaved (untitled) editor, you are asked where to save the output.

**JS Obfuscator: Obfuscate File As…** is available from the same places. It does the same thing but asks where to save,
suggesting `<name>.obfuscated.js`.

### Obfuscate a selection

Select code in a JavaScript editor and run **JS Obfuscator: Obfuscate Selection** from the editor context menu or the
Command Palette. The selection is replaced with its obfuscated form in a single edit, so one **Undo** restores it.
Multiple selections (multi-cursor) are supported.

- Each selection is obfuscated as a standalone program, so it must be complete statements, such as whole functions.
  Part of an expression fails with an error, and the document is left unchanged.
- Top-level names in the selection are kept, so the rest of the file can still call functions defined in it.
  This stops being true if you turn on `renameGlobals`.

### Obfuscate a whole folder or workspace

Run **JS Obfuscator: Obfuscate All JavaScript in Folder** from:

- the Command Palette: processes every folder in the workspace
- the Explorer context menu on a folder: processes only that folder (multi-select works too)

Every `.js`, `.mjs` and `.cjs` file is obfuscated into an `obfuscated/` folder (see `jsObfuscator.output.folder`) at the root of its workspace folder,
mirroring the original structure: `src/lib/math.js` becomes `obfuscated/src/lib/math.js`.

- Original files are never modified. You confirm the file count before anything is written.
- Skipped: the `jsObfuscator.exclude` globs (`node_modules/` and `.git/` by default), the output folder itself, and `*.obfuscated.js` files from the single-file command.
- Files that fail to parse are skipped and listed in the **JS Obfuscator** output panel; the rest still run.
- The run can be cancelled from the progress notification.
- Existing files in `obfuscated/` are overwritten, but stale files there are not deleted. Delete the folder for a clean build.
- Only JavaScript files are written; other assets (HTML, CSS, images) are not copied.
- Each file is obfuscated independently. Global names are not renamed by default, so code shared between files through
  globals keeps working. Turning on `renameGlobals` breaks that.

## Configuration

### Presets

Pick a preset with **JS Obfuscator: Select Obfuscation Preset**, or set `jsObfuscator.preset`:

| Preset | What it adds | Watch out for |
| --- | --- | --- |
| `default` | Renamed identifiers, every string moved into a base64-encoded string array | |
| `low` | Self-defending code, console output disabled | Output breaks if reformatted; `console.log` and friends do nothing |
| `medium` | Control-flow flattening, dead code, split strings, numbers as expressions, obfuscated object keys | Slower and several times larger |
| `high` | rc4 string encoding, debug protection | Much slower and larger. **Browser code only**: debug protection keeps a timer running, so Node.js scripts never exit |

Each preset includes everything in the presets above it, so `medium` and `high` also disable console output and
break if reformatted. Every preset hides all string literals. They are based on javascript-obfuscator's own presets of the same names;
`default`, `low` and `medium` go further on strings than the library does.

### Settings

| Setting | Default | Purpose |
| --- | --- | --- |
| `jsObfuscator.preset` | `default` | Base preset |
| `jsObfuscator.options.*` | | 20 common javascript-obfuscator options such as `target`, `renameGlobals`, `reservedNames`, `controlFlowFlattening` and `stringArrayEncoding` |
| `jsObfuscator.output.suffix` | `.obfuscated` | Single-file output name: `app.js` becomes `app<suffix>.js` |
| `jsObfuscator.output.folder` | `obfuscated` | Folder, relative to the workspace folder, for folder/workspace runs |
| `jsObfuscator.exclude` | `**/node_modules/**`, `**/.git/**` | Globs skipped by folder/workspace runs |

A `jsObfuscator.options.*` setting only overrides the preset once you set it, in user or workspace settings.
Settings left alone use the preset's value.

### `.obfuscatorrc.json`

For per-project or per-folder options, run **JS Obfuscator: Create .obfuscatorrc.json**, or create the file yourself:

```json
{
  "preset": "medium",
  "target": "node",
  "reservedNames": ["^keepThisName$"],
  "stringArrayEncoding": ["rc4"]
}
```

- It accepts every javascript-obfuscator option, not just the 20 in settings. The editor completes and validates them.
- Unknown option names are rejected, so a typo is caught instead of being silently ignored.
- `"preset"` takes our preset names. The library's `"optionsPreset"` (`"high-obfuscation"` etc.) also works.
- The nearest file wins: the extension looks in the file's folder, then each parent folder up to the workspace
  folder root. Files in different folders can use different configs. Files outside a workspace only use a config in their own folder.
- `exclude` is not supported in this file; use the `jsObfuscator.exclude` setting.

### Priority

From lowest to highest:

1. The preset, taken from `.obfuscatorrc.json` if it sets one, otherwise from `jsObfuscator.preset`
2. `jsObfuscator.options.*` settings you have set
3. Options in `.obfuscatorrc.json`

## Roadmap

- [x] **Phase 1:** obfuscate the current file into a new file; obfuscate every JS file in the project/folder; obfuscate a selection; Explorer context menu; "Save As" output path
- [x] **Phase 2:** settings (presets, common options, output suffix/folder, exclude globs), per-folder `.obfuscatorrc.json` with schema, preset quick pick
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
| `npm run generate-config` | Regenerate the settings in `package.json` and `schemas/obfuscatorrc.schema.json` from javascript-obfuscator's options. Run it after upgrading the library |

### Trying it in another project

- **While developing:** press **Ctrl+F5** (Run Without Debugging). In the **[Extension Development Host]** window that
  opens, use **File → Open Folder…** to open the other project. That window remembers the folder for next time. After
  code changes, press **Cmd/Ctrl+R** in it to reload.
- **As an installed extension:** run `npm run package`, then **Extensions → … → Install from VSIX**, or
  `code --install-extension js-obfuscator-0.0.1.vsix`. Reinstall after every change.

### Troubleshooting

**"Extension host did not start in 10 seconds" when pressing F5.** On some machines the debugger connects to
`localhost` over IPv6 (`::1`) while the waiting extension host only listens on IPv4, so it never attaches. Use **Ctrl+F5**
(Run Without Debugging) instead, or update VS Code or install the **JavaScript Debugger (Nightly)** extension to keep
breakpoints.

## Packaging

```bash
npm run package
```

This produces a `.vsix` you can install via **Extensions → … → Install from VSIX**.

## Credits

Obfuscation is performed by [javascript-obfuscator](https://github.com/javascript-obfuscator/javascript-obfuscator)
(BSD-2-Clause).
