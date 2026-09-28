import { posix as path } from 'path';
import * as vscode from 'vscode';
import {
	DEFAULT_OUTPUT_FOLDER,
	DEFAULT_OUTPUT_SUFFIX,
	KNOWN_OPTIONS,
	ObfuscatorOptions,
	PresetName,
	buildOptions,
	isPresetName,
	toPresetName,
} from './obfuscator';
import { displayName, errorMessage } from './util';

export const SECTION = 'jsObfuscator';
export const RC_FILE = '.obfuscatorrc.json';

export interface OutputSettings {
	suffix: string;
	folder: string;
	exclude: string[];
}

interface RcConfig {
	uri: vscode.Uri;
	preset?: PresetName;
	options: ObfuscatorOptions;
}

/** Output settings for the file or folder `scope`; throws with a readable message if a setting is invalid. */
export function getOutputSettings(scope?: vscode.Uri): OutputSettings {
	const config = vscode.workspace.getConfiguration(SECTION, scope);

	const suffix = config.get<string>('output.suffix', DEFAULT_OUTPUT_SUFFIX).trim();
	if (!suffix || /[\\/:*?"<>|]/.test(suffix)) {
		throw new Error(`Setting ${SECTION}.output.suffix must be a non-empty file name part such as ".obfuscated".`);
	}

	const folder = config.get<string>('output.folder', DEFAULT_OUTPUT_FOLDER).trim().replace(/\\/g, '/').replace(/^\.\/|\/+$/g, '');
	if (!folder || path.isAbsolute(folder) || /^[a-zA-Z]:/.test(folder) || folder.split('/').includes('..')) {
		throw new Error(`Setting ${SECTION}.output.folder must be a folder path inside the workspace folder, such as "obfuscated".`);
	}

	const exclude = config.get<string[]>('exclude', []).filter((glob) => typeof glob === 'string' && glob.trim());
	return { suffix, folder, exclude };
}

/**
 * Resolves the obfuscator options for a file, in increasing priority:
 * 1. the preset (`.obfuscatorrc.json` "preset", else the `jsObfuscator.preset` setting)
 * 2. `jsObfuscator.options.*` settings the user has explicitly set (unset ones leave the preset's value)
 * 3. options in the nearest `.obfuscatorrc.json`, searching up from the file to its workspace folder root
 *
 * Create one per command run: config files are cached for the lifetime of the resolver.
 */
export class OptionsResolver {
	private readonly rcFiles = new Map<string, Promise<RcConfig | undefined>>();

	async resolve(uri: vscode.Uri): Promise<ObfuscatorOptions> {
		const config = vscode.workspace.getConfiguration(SECTION, uri);
		const rc = await this.findRcConfig(uri);
		const preset = rc?.preset ?? getPresetSetting(config);
		return buildOptions(preset, explicitOptionSettings(config), rc?.options ?? {});
	}

	/** The `.obfuscatorrc.json` that applies to `uri`, if any. */
	async findRcConfig(uri: vscode.Uri): Promise<RcConfig | undefined> {
		if (uri.scheme === 'untitled') {
			return undefined;
		}
		const root = vscode.workspace.getWorkspaceFolder(uri)?.uri;
		let dir = vscode.Uri.joinPath(uri, '..');
		// Outside a workspace only the file's own folder is checked, so a stray config higher up is never picked up.
		while (true) {
			const rc = await this.readRcConfig(vscode.Uri.joinPath(dir, RC_FILE));
			if (rc) {
				return rc;
			}
			const parent = vscode.Uri.joinPath(dir, '..');
			if (!root || dir.path === root.path || parent.path === dir.path || !dir.path.startsWith(root.path)) {
				return undefined;
			}
			dir = parent;
		}
	}

	private readRcConfig(uri: vscode.Uri): Promise<RcConfig | undefined> {
		let cached = this.rcFiles.get(uri.toString());
		if (!cached) {
			cached = loadRcConfig(uri);
			this.rcFiles.set(uri.toString(), cached);
		}
		return cached;
	}
}

export function getPresetSetting(config: vscode.WorkspaceConfiguration = vscode.workspace.getConfiguration(SECTION)): PresetName {
	const preset = config.get<string>('preset');
	return isPresetName(preset) ? preset : 'default';
}

/** `jsObfuscator.options.*` values the user actually set, at any level. Defaults are skipped so the preset decides. */
function explicitOptionSettings(config: vscode.WorkspaceConfiguration): ObfuscatorOptions {
	const overrides: Record<string, unknown> = {};
	for (const name of Object.keys(config.get<object>('options') ?? {})) {
		const inspected = config.inspect(`options.${name}`);
		const value = inspected?.workspaceFolderValue ?? inspected?.workspaceValue ?? inspected?.globalValue;
		if (value !== undefined) {
			overrides[name] = value;
		}
	}
	return overrides;
}

async function loadRcConfig(uri: vscode.Uri): Promise<RcConfig | undefined> {
	let bytes: Uint8Array;
	try {
		bytes = await vscode.workspace.fs.readFile(uri);
	} catch {
		return undefined;
	}
	return parseRcConfig(uri, new TextDecoder('utf-8').decode(bytes));
}

function parseRcConfig(uri: vscode.Uri, text: string): RcConfig {
	const name = displayName(uri);
	let json: unknown;
	try {
		json = JSON.parse(text);
	} catch (err) {
		throw new Error(`${name} is not valid JSON: ${errorMessage(err)}`);
	}
	if (typeof json !== 'object' || json === null || Array.isArray(json)) {
		throw new Error(`${name} must contain a JSON object of obfuscator options.`);
	}

	const { $schema: _schema, preset: presetValue, optionsPreset, ...options } = json as Record<string, unknown>;

	if ('exclude' in options) {
		throw new Error(`${name}: "exclude" is not supported here; use the ${SECTION}.exclude setting instead.`);
	}
	const unknown = Object.keys(options).filter((key) => !KNOWN_OPTIONS.has(key));
	if (unknown.length) {
		throw new Error(`${name}: unknown option${unknown.length === 1 ? '' : 's'} ${unknown.map((k) => `"${k}"`).join(', ')}.`);
	}

	const rawPreset = presetValue ?? optionsPreset;
	const preset = rawPreset === undefined ? undefined : toPresetName(rawPreset);
	if (rawPreset !== undefined && !preset) {
		throw new Error(`${name}: preset must be one of "default", "low", "medium", "high" (got ${JSON.stringify(rawPreset)}).`);
	}

	return { uri, preset, options };
}
