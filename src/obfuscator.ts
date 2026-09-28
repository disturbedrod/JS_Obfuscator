import { posix as path } from 'path';
import * as JavaScriptObfuscator from 'javascript-obfuscator';
import type { ObfuscatorOptions } from 'javascript-obfuscator';

// Kept free of `vscode` imports so it can be unit tested outside the extension host.

export type { ObfuscatorOptions };

export const DEFAULT_OPTIONS: ObfuscatorOptions = {
	optionsPreset: 'default',
	target: 'browser',
	// The default preset moves strings into an array but leaves them readable; encode all of them.
	stringArrayEncoding: ['base64'],
	stringArrayThreshold: 1,
};

export const OUTPUT_SUFFIX = '.obfuscated';

/** Folder, relative to the workspace folder root, that batch runs mirror their output into. */
export const OUTPUT_FOLDER = 'obfuscated';

export function obfuscateCode(source: string, options: ObfuscatorOptions = DEFAULT_OPTIONS): string {
	return JavaScriptObfuscator.obfuscate(source, options).getObfuscatedCode();
}

/** URI-style (POSIX) path: `dir/app.js` -> `dir/app.obfuscated.js` (extension preserved, so `.mjs`/`.cjs` keep their module type). */
export function getOutputPath(inputPath: string, suffix: string = OUTPUT_SUFFIX): string {
	const { dir, name, ext } = path.parse(inputPath);
	return path.join(dir, `${name}${suffix}${ext || '.js'}`);
}

/**
 * URI-style (POSIX) paths: mirrors `file` under `<root>/<outputFolder>`, keeping its path relative to `root`.
 * `/ws/src/app.js` with root `/ws` -> `/ws/obfuscated/src/app.js`. Returns undefined if `file` is outside `root`.
 */
export function getMirroredOutputPath(root: string, file: string, outputFolder: string = OUTPUT_FOLDER): string | undefined {
	const relative = path.relative(root, file);
	if (!relative || isOutside(relative)) {
		return undefined;
	}
	return path.join(root, outputFolder, relative);
}

/** True for paths inside `<root>/<outputFolder>`, so batch runs never re-obfuscate their own output. */
export function isInOutputFolder(root: string, file: string, outputFolder: string = OUTPUT_FOLDER): boolean {
	const relative = path.relative(path.join(root, outputFolder), file);
	return !isOutside(relative);
}

function isOutside(relative: string): boolean {
	return relative === '..' || relative.startsWith('../') || path.isAbsolute(relative);
}
