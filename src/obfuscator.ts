import { posix as path } from 'path';
import * as JavaScriptObfuscator from 'javascript-obfuscator';
import type { ObfuscatorOptions } from 'javascript-obfuscator';

// Kept free of `vscode` imports so it can be unit tested outside the extension host.

export type { ObfuscatorOptions };

export const PRESET_NAMES = ['default', 'low', 'medium', 'high'] as const;
export type PresetName = (typeof PRESET_NAMES)[number];

/**
 * Our presets, each built on the javascript-obfuscator preset of the same strength. The library's default and low
 * presets leave strings readable and medium skips a quarter of them, so every preset here encodes all strings.
 */
export const PRESETS: Record<PresetName, ObfuscatorOptions> = {
	default: { optionsPreset: 'default', stringArrayEncoding: ['base64'], stringArrayThreshold: 1 },
	low: { optionsPreset: 'low-obfuscation', stringArrayEncoding: ['base64'], stringArrayThreshold: 1 },
	medium: { optionsPreset: 'medium-obfuscation', stringArrayThreshold: 1 },
	high: { optionsPreset: 'high-obfuscation' },
};

const LIBRARY_PRESET_NAMES: Record<string, PresetName> = {
	'default': 'default',
	'low-obfuscation': 'low',
	'medium-obfuscation': 'medium',
	'high-obfuscation': 'high',
};

/** Options that only mean something to the javascript-obfuscator CLI; the API ignores them. */
export const CLI_ONLY_OPTIONS: ReadonlySet<string> = new Set(['config', 'exclude']);

/** Every API option javascript-obfuscator understands; it silently ignores unknown ones, so we check against this. */
export const KNOWN_OPTIONS: ReadonlySet<string> = new Set(
	Object.keys(JavaScriptObfuscator.getOptionsByPreset('default')).filter((name) => !CLI_ONLY_OPTIONS.has(name)),
);

export function isPresetName(value: unknown): value is PresetName {
	return typeof value === 'string' && (PRESET_NAMES as readonly string[]).includes(value);
}

/** Maps a javascript-obfuscator `optionsPreset` value (`high-obfuscation`) or one of ours (`high`) to our preset name. */
export function toPresetName(value: unknown): PresetName | undefined {
	if (isPresetName(value)) {
		return value;
	}
	return typeof value === 'string' ? LIBRARY_PRESET_NAMES[value] : undefined;
}

/** Preset, then each override layer in order; later layers win. `optionsPreset` in overrides is ignored, the preset picks it. */
export function buildOptions(preset: PresetName, ...overrides: ObfuscatorOptions[]): ObfuscatorOptions {
	// `advertisement` only logs a JavaScript Obfuscator Pro ad to the console; keep it out of the extension host log.
	const options: ObfuscatorOptions = { advertisement: false, ...PRESETS[preset] };
	for (const layer of overrides) {
		const { optionsPreset: _ignored, ...rest } = layer;
		Object.assign(options, rest);
	}
	return options;
}

export const DEFAULT_OUTPUT_SUFFIX = '.obfuscated';

/** Folder, relative to the workspace folder root, that batch runs mirror their output into. */
export const DEFAULT_OUTPUT_FOLDER = 'obfuscated';

export function obfuscateCode(source: string, options: ObfuscatorOptions = buildOptions('default')): string {
	return JavaScriptObfuscator.obfuscate(source, options).getObfuscatedCode();
}

/** TypeScript extensions and the JavaScript extension their output gets, so `.mts`/`.cts` keep their module type. */
const TS_OUTPUT_EXTENSIONS: Record<string, string> = { '.ts': '.js', '.mts': '.mjs', '.cts': '.cjs' };

/** Extension of the obfuscated output for an input extension: TypeScript becomes JavaScript, anything else is kept. */
export function getOutputExtension(ext: string): string {
	return TS_OUTPUT_EXTENSIONS[ext.toLowerCase()] ?? (ext || '.js');
}

/**
 * URI-style (POSIX) path: `dir/app.js` -> `dir/app.obfuscated.js` (extension preserved, so `.mjs`/`.cjs` keep their module type).
 * TypeScript becomes JavaScript: `app.ts` -> `app.obfuscated.js`.
 */
export function getOutputPath(inputPath: string, suffix: string = DEFAULT_OUTPUT_SUFFIX): string {
	const { dir, name, ext } = path.parse(inputPath);
	return path.join(dir, `${name}${suffix}${getOutputExtension(ext)}`);
}

/**
 * URI-style (POSIX) paths: mirrors `file` under `<root>/<outputFolder>`, keeping its path relative to `root`.
 * `/ws/src/app.js` with root `/ws` -> `/ws/obfuscated/src/app.js`. Returns undefined if `file` is outside `root`.
 */
export function getMirroredOutputPath(root: string, file: string, outputFolder: string = DEFAULT_OUTPUT_FOLDER): string | undefined {
	const relative = path.relative(root, file);
	if (!relative || isOutside(relative)) {
		return undefined;
	}
	const { dir, name, ext } = path.parse(relative);
	return path.join(root, outputFolder, dir, `${name}${getOutputExtension(ext)}`);
}

/** True for paths inside `<root>/<outputFolder>`, so batch runs never re-obfuscate their own output. */
export function isInOutputFolder(root: string, file: string, outputFolder: string = DEFAULT_OUTPUT_FOLDER): boolean {
	const relative = path.relative(path.join(root, outputFolder), file);
	return !isOutside(relative);
}

function isOutside(relative: string): boolean {
	return relative === '..' || relative.startsWith('../') || path.isAbsolute(relative);
}

/** True for files written by the single-file command, such as `app.obfuscated.js` or `index.obfuscated.html` for suffix `.obfuscated`. */
export function hasOutputSuffix(file: string, suffix: string = DEFAULT_OUTPUT_SUFFIX): boolean {
	const { name, ext } = path.parse(file);
	return /^\.([cm]?js|html?)$/i.test(ext) && name.endsWith(suffix);
}
