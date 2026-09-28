import { posix as path } from 'path';
import * as JavaScriptObfuscator from 'javascript-obfuscator';
import type { CompilerOptions } from 'typescript';
import { replaceInlineScripts } from './html';
import type { ObfuscatorOptions } from './obfuscator';
import { OutputFile, SourceMap, chainSourceMaps, stripSourceMapComment, withSourceMap } from './sourceMap';
import { transpileTypeScript } from './typescript';

// Kept free of `vscode` imports so it can be unit tested outside the extension host.

export type SourceKind = 'javascript' | 'typescript' | 'html';

/** Files a folder run picks up. Declaration files (`.d.ts`) match too and are filtered by {@link sourceKindFromPath}. */
export const SOURCE_GLOB = '**/*.{js,mjs,cjs,ts,mts,cts,html,htm}';

const KIND_BY_EXTENSION: Record<string, SourceKind> = {
	'.js': 'javascript',
	'.mjs': 'javascript',
	'.cjs': 'javascript',
	'.ts': 'typescript',
	'.mts': 'typescript',
	'.cts': 'typescript',
	'.html': 'html',
	'.htm': 'html',
};

/** `.d.ts`, `.d.mts` and `.d.cts` contain only types, so there is nothing to obfuscate. */
export function isDeclarationFile(file: string): boolean {
	return /\.d\.[cm]?ts$/i.test(file);
}

export function sourceKindFromPath(file: string): SourceKind | undefined {
	return isDeclarationFile(file) ? undefined : KIND_BY_EXTENSION[path.extname(file).toLowerCase()];
}

/** Kind for an editor's language; `file` rules out declaration files. */
export function sourceKindFromLanguage(languageId: string, file: string): SourceKind | undefined {
	if (languageId === 'javascript' || languageId === 'html') {
		return languageId;
	}
	return languageId === 'typescript' && !isDeclarationFile(file) ? 'typescript' : undefined;
}

export interface SourceInput {
	text: string;
	kind: SourceKind;
	/** File name or path; its extension picks the TypeScript module format. */
	fileName: string;
	/** File system folder to search for `tsconfig.json` from; undefined for unsaved documents. */
	configSearchDir?: string;
	/** Shared across a command run so each `tsconfig.json` is read once. */
	tsConfigCache?: Map<string, CompilerOptions>;
}

export interface ObfuscationResult {
	code: string;
	/** Present when the `sourceMap` option is on, except for HTML. */
	map?: SourceMap;
}

/**
 * Obfuscates JavaScript, TypeScript (transpiled first) or the inline scripts of an HTML page.
 * The source map, if any, is returned unattached; {@link outputFiles} adds it once the output path is known.
 */
export function obfuscateSource(input: SourceInput, options: ObfuscatorOptions): ObfuscationResult {
	// HTML scripts would each need their own map, so HTML gets none.
	const sourceMap = options.sourceMap === true && input.kind !== 'html';
	// The map comment and `sources` are written by outputFiles, so the library's own settings for them are overridden.
	// inputFileName must still be non-empty: the library rejects an empty one when maps don't embed the sources.
	const libraryOptions: ObfuscatorOptions = {
		...options,
		sourceMap,
		sourceMapMode: 'separate',
		sourceMapFileName: '',
		inputFileName: path.basename(input.fileName) || 'input.js',
	};

	switch (input.kind) {
		case 'javascript':
			return runObfuscator(input.text, libraryOptions);

		case 'typescript': {
			const transpiled = transpileTypeScript({
				source: input.text,
				fileName: input.fileName,
				configSearchDir: input.configSearchDir,
				sourceMap,
				cache: input.tsConfigCache,
			});
			const result = runObfuscator(transpiled.code, libraryOptions);
			return { code: result.code, map: result.map && transpiled.map ? chainSourceMaps(result.map, transpiled.map) : undefined };
		}

		case 'html':
			return {
				code: replaceInlineScripts(input.text, (code, index, count) => {
					// Classic scripts on a page share one global scope, and the obfuscator's helper functions are
					// globals with random short names. A per-script prefix keeps two scripts' helpers from colliding.
					const prefix = count > 1 ? { identifiersPrefix: `${options.identifiersPrefix ?? ''}s${index + 1}` } : {};
					return runObfuscator(code, { ...libraryOptions, ...prefix }).code;
				}),
			};
	}
}

/** The files to write when `result` is saved at `outputPath`: the code, plus a `.map` file for separate source maps. */
export function outputFiles(result: ObfuscationResult, outputPath: string, sourcePath: string | undefined, options: ObfuscatorOptions): OutputFile[] {
	return withSourceMap(result.code, result.map, outputPath, sourcePath, {
		mode: options.sourceMapMode === 'inline' ? 'inline' : 'separate',
		baseUrl: options.sourceMapBaseUrl ?? '',
		includeSources: options.sourceMapSourcesMode !== 'sources',
	});
}

function runObfuscator(code: string, options: ObfuscatorOptions): ObfuscationResult {
	const result = JavaScriptObfuscator.obfuscate(code, options);
	if (!options.sourceMap) {
		return { code: result.getObfuscatedCode() };
	}
	return { code: stripSourceMapComment(result.getObfuscatedCode()), map: JSON.parse(result.getSourceMap()) as SourceMap };
}
