# JS Obfuscator

A Visual Studio Code extension for obfuscating JavaScript, TypeScript and the inline scripts of HTML pages, powered by
[javascript-obfuscator](https://github.com/javascript-obfuscator/javascript-obfuscator).

## Commands

All commands are in the Command Palette under **JS Obfuscator**.

| Command | Where else | Output |
| --- | --- | --- |
| **Obfuscate File to New File** | Editor right-click, editor title bar (lock icon), Explorer right-click on JS/TS/HTML files | `app.obfuscated.js` (or `.html`) next to the original |
| **Obfuscate File As…** | Editor right-click, Explorer right-click on JS/TS/HTML files | Wherever you choose |
| **Preview Obfuscation** | Editor right-click, Explorer right-click on JS/TS/HTML files | Diff of the original and the obfuscated code; nothing is written |
| **Save Obfuscated Output** | Save icon in the preview's title bar | Writes the previewed code, like Obfuscate File to New File |
| **Obfuscate Selection** | Editor right-click when text is selected in a JavaScript file | Replaces the selection (one Undo reverts it) |
| **Obfuscate All JavaScript in Folder** | Explorer right-click on folders | Mirrored copy of the JS, TS and HTML files in `obfuscated/` |
| **Select Obfuscation Preset** | Preset in the status bar | Changes `jsObfuscator.preset` |
| **Create .obfuscatorrc.json** | | Starter config in the workspace root |

## Features

### Obfuscate a file

Run **JS Obfuscator: Obfuscate File to New File** on a JavaScript (`.js`, `.mjs`, `.cjs`), TypeScript (`.ts`, `.mts`, `.cts`)
or HTML (`.html`, `.htm`) file from:

- the Command Palette (`Cmd/Ctrl+Shift+P`): uses the active editor
- the editor context menu (right-click in the editor) or the lock icon in the editor title bar
- the Explorer context menu on one or more files, which don't need to be open

The obfuscated code is written to a new file next to the original: `app.js` becomes `app.obfuscated.js`
(the suffix is set by `jsObfuscator.output.suffix`). TypeScript becomes JavaScript (`app.ts` → `app.obfuscated.js`,
`app.mts` → `app.obfuscated.mjs`), and HTML stays HTML (`index.html` → `index.obfuscated.html`).
The original file is never modified. If the output file already exists, you are asked before it is overwritten.
Unsaved changes in an open editor are included, because the extension reads the current editor contents.
For an unsaved (untitled) editor, you are asked where to save the output.

**JS Obfuscator: Obfuscate File As…** is available from the same places. It does the same thing but asks where to save,
suggesting `<name>.obfuscated.js`.

### TypeScript

TypeScript files are transpiled to JavaScript first, then obfuscated. The extension uses the compiler options of the
nearest `tsconfig.json` (searching up from the file, as `tsc` does), so the module format, target and decorator settings
match your normal build. Without a `tsconfig.json`, it targets ES2022 and keeps `import`/`export`, except in `.cts`
files, which get `require()`.

- Each file is transpiled on its own, with no type checking: type errors don't stop it, syntax errors do.
- Output-related options such as `outDir`, `declaration` and `noEmit` are ignored. Only the JavaScript is written.
- Declaration files (`.d.ts`) are skipped, since they contain no code. `.tsx` is not supported.
- Imports of other `.ts` files are left as they are, so obfuscate the whole folder to get every file.

### HTML pages

For an HTML file, the code inside each inline `<script>` element is obfuscated. The rest of the page is copied
unchanged, byte for byte.

- Scripts with `src`, and scripts whose `type` isn't JavaScript (such as `application/json`, `importmap` or templates),
  are left alone. `type="module"` scripts are obfuscated.
- Event handler attributes (`onclick="…"`) and `javascript:` links are not obfuscated.
- Each script is obfuscated separately. The obfuscator's helper functions get a per-script prefix (`s1…`, `s2…`),
  so scripts on the same page can't overwrite each other's helpers. Names shared between scripts keep working,
  unless you turn on `renameGlobals`.
- If a script fails to parse, the error names the script and its line, and nothing is written.

### Preview before saving

**JS Obfuscator: Preview Obfuscation** opens a diff with the original on the left and the obfuscated code on the right.
Nothing is written. Click the save icon in the preview's title bar (**Save Obfuscated Output**) to write exactly what
you see to the usual `<name>.obfuscated.js`. You are asked before an existing file is overwritten. Obfuscation is random
unless `seed` is set, so previewing again gives different output.

### Status bar

The status bar shows the preset that applies to the active JavaScript, TypeScript or HTML file, as a lock icon and the preset name.
Click it to pick another preset. If the preset comes from a `.obfuscatorrc.json`, the tooltip names that file and
clicking opens it, because the setting wouldn't take effect for that file. An invalid config file shows a warning
instead. Hide the item with `jsObfuscator.statusBar.enabled`.

### Source maps

Turn on `jsObfuscator.options.sourceMap` (or `"sourceMap": true` in `.obfuscatorrc.json`) to write a source map with each
obfuscated JavaScript or TypeScript file:

- `sourceMapMode: "separate"` (default) writes `app.obfuscated.js.map` next to the output and adds a `sourceMappingURL`
  comment. `sourceMapBaseUrl` is put in front of the map's name in that comment, for maps hosted elsewhere.
- `sourceMapMode: "inline"` embeds the map in the output file instead.
- For TypeScript, the map points at the `.ts` file, not at the intermediate JavaScript.
- Folder runs write the maps into the mirror folder too, pointing back at the original files.
- HTML pages and selections never get source maps.

**Keep source maps private.** A map, especially with the default `sourceMapSourcesMode: "sources-content"`, contains
your original code and undoes the obfuscation. Use maps to decode your own error reports, and don't deploy them.
`sourceMapSourcesMode: "sources"` leaves the code out of the map and keeps only the file name.

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

Every JavaScript, TypeScript and HTML file is obfuscated into an `obfuscated/` folder (see `jsObfuscator.output.folder`)
at the root of its workspace folder, mirroring the original structure: `src/lib/math.js` becomes
`obfuscated/src/lib/math.js`, and `src/main.ts` becomes `obfuscated/src/main.js`.

- Original files are never modified. You confirm the file count before anything is written.
- Skipped: the `jsObfuscator.exclude` globs (`node_modules/` and `.git/` by default), the output folder itself,
  `*.obfuscated.*` files from the single-file command, and `.d.ts` files. To leave HTML or TypeScript out, add
  `**/*.html` or `**/*.ts` to `jsObfuscator.exclude`.
- When `app.ts` and `app.js` sit side by side, both would become `obfuscated/app.js`. The JavaScript file wins, since it
  is usually the build of the other. The skipped TypeScript files are listed in the output panel.
- Files that fail to parse are skipped and listed in the **JS Obfuscator** output panel; the rest still run.
- The run can be cancelled from the progress notification.
- Existing files in `obfuscated/` are overwritten, but stale files there are not deleted. Delete the folder for a clean build.
- Every HTML page is written, with or without inline scripts. Other assets (CSS, images, JSON) are not copied.
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
| `jsObfuscator.options.*` | | 22 common javascript-obfuscator options such as `target`, `renameGlobals`, `reservedNames`, `controlFlowFlattening`, `stringArrayEncoding` and `sourceMap` |
| `jsObfuscator.output.suffix` | `.obfuscated` | Single-file output name: `app.js` becomes `app<suffix>.js` |
| `jsObfuscator.output.folder` | `obfuscated` | Folder, relative to the workspace folder, for folder/workspace runs |
| `jsObfuscator.exclude` | `**/node_modules/**`, `**/.git/**` | Globs skipped by folder/workspace runs |
| `jsObfuscator.statusBar.enabled` | `true` | Show the active file's preset in the status bar |

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

- It accepts every javascript-obfuscator option, not just the 22 in settings. The editor completes and validates them.
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
- [x] **Phase 3:** TypeScript and inline HTML `<script>` support, diff preview, status bar preset, source maps
- [ ] **Phase 4:** unit and integration tests, ESLint, GitHub Actions CI, marketplace metadata, publish to VS Code Marketplace and Open VSX

## Development

```bash
npm install
npm run compile
```

Press **F5** in VS Code to launch an Extension Development Host with the extension loaded
(or **Ctrl+F5**, see [Troubleshooting](#troubleshooting)).

The extension is bundled with esbuild into `out/extension.js`, so runtime dependencies (`javascript-obfuscator`,
`typescript`, `parse5` and `@jridgewell/remapping`) are included in the package even though `node_modules` is excluded.
`npm run package` minifies the bundle.

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
