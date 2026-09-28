import { posix as path } from 'path';
import remapping, { type EncodedSourceMap } from '@jridgewell/remapping';

// Kept free of `vscode` imports so it can be unit tested outside the extension host.

export type SourceMap = EncodedSourceMap;

export type SourceMapMode = 'separate' | 'inline';

export interface SourceMapSettings {
	mode: SourceMapMode;
	/** Prepended to the map file name in the `sourceMappingURL` comment, as javascript-obfuscator's own option does. */
	baseUrl: string;
	/** False drops `sourcesContent`, so the map names the original file without embedding its code. */
	includeSources: boolean;
}

/** A trailing `//# sourceMappingURL=` comment, as added by TypeScript and javascript-obfuscator. */
const SOURCE_MAP_COMMENT = /\n?\/\/# sourceMappingURL=\S*\s*$/;

export function stripSourceMapComment(code: string): string {
	return code.replace(SOURCE_MAP_COMMENT, '');
}

/** Maps positions in `outer`'s output through `outer` and then `inner`, so a map of obfuscated code points at the TypeScript. */
export function chainSourceMaps(outer: SourceMap, inner: SourceMap): SourceMap {
	const chained = remapping(outer, (_file, ctx) => (ctx.depth === 1 ? inner : null));
	return JSON.parse(chained.toString()) as SourceMap;
}

export interface OutputFile {
	/** URI-style (POSIX) path. */
	path: string;
	text: string;
}

/**
 * The files to write for obfuscated `code` saved at `outputPath`: the code itself, plus `<output>.map` in separate mode.
 * The map's `sources` is rewritten to the original file relative to the output, since javascript-obfuscator
 * always writes the placeholder `"sourceMap"` there. `sourcePath` is undefined for unsaved (untitled) documents.
 */
export function withSourceMap(
	code: string,
	map: SourceMap | undefined,
	outputPath: string,
	sourcePath: string | undefined,
	settings: SourceMapSettings,
): OutputFile[] {
	if (!map) {
		return [{ path: outputPath, text: code }];
	}

	const outputDir = path.dirname(outputPath);
	const source = sourcePath ? path.relative(outputDir, sourcePath) || path.basename(sourcePath) : 'untitled';
	const { sourcesContent, ...rest } = map;
	const finalMap: SourceMap = {
		...rest,
		file: path.basename(outputPath),
		sources: [source],
		...(settings.includeSources && sourcesContent ? { sourcesContent: sourcesContent.slice(0, 1) } : {}),
	};
	const json = JSON.stringify(finalMap);
	const body = stripSourceMapComment(code).replace(/\s*$/, '\n');

	if (settings.mode === 'inline') {
		const data = Buffer.from(json, 'utf8').toString('base64');
		return [{ path: outputPath, text: `${body}//# sourceMappingURL=data:application/json;charset=utf-8;base64,${data}\n` }];
	}

	const mapPath = `${outputPath}.map`;
	return [
		{ path: outputPath, text: `${body}//# sourceMappingURL=${settings.baseUrl}${path.basename(mapPath)}\n` },
		{ path: mapPath, text: json },
	];
}
