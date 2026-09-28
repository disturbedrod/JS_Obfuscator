import * as nodePath from 'path';
import * as ts from 'typescript';
import { SourceMap, stripSourceMapComment } from './sourceMap';

// Kept free of `vscode` imports so it can be unit tested outside the extension host.

export interface TranspileRequest {
	source: string;
	/** File name, used for the module format (`.mts`/`.cts`) and error messages. */
	fileName: string;
	/** File system folder to search upwards from for `tsconfig.json`; undefined uses defaults (unsaved documents). */
	configSearchDir?: string;
	sourceMap: boolean;
	/** Compiler options per `tsconfig.json` path. Share one per command run so each config is read once. */
	cache?: Map<string, ts.CompilerOptions>;
}

export interface TranspileResult {
	code: string;
	map?: SourceMap;
}

/**
 * Strips types from TypeScript with the nearest `tsconfig.json`'s compiler options, so the output matches what `tsc`
 * would emit for this file (module format, target, decorators). Each file is transpiled alone: no type checking.
 * Throws on syntax errors rather than obfuscating half-broken output.
 */
export function transpileTypeScript(request: TranspileRequest): TranspileResult {
	const { source, fileName, sourceMap } = request;
	const compilerOptions: ts.CompilerOptions = {
		...baseCompilerOptions(request),
		// Only the JavaScript is wanted, whatever the project's build normally emits.
		noEmit: false,
		emitDeclarationOnly: false,
		declaration: false,
		declarationMap: false,
		sourceMap,
		inlineSourceMap: false,
		inlineSources: sourceMap,
		sourceRoot: undefined,
		mapRoot: undefined,
	};

	const output = ts.transpileModule(source, { compilerOptions, fileName: nodePath.basename(fileName), reportDiagnostics: true });
	// Only syntax errors: option diagnostics (such as deprecated settings) don't change the emitted code.
	const errors = (output.diagnostics ?? []).filter((d) => d.file && d.category === ts.DiagnosticCategory.Error);
	if (errors.length) {
		throw new Error(`TypeScript syntax error: ${errors.slice(0, 3).map(formatDiagnostic).join('; ')}`);
	}

	return {
		code: stripSourceMapComment(output.outputText),
		map: output.sourceMapText ? (JSON.parse(output.sourceMapText) as SourceMap) : undefined,
	};
}

function baseCompilerOptions({ fileName, configSearchDir, cache }: TranspileRequest): ts.CompilerOptions {
	const configPath = configSearchDir ? ts.findConfigFile(configSearchDir, ts.sys.fileExists) : undefined;
	if (!configPath) {
		const commonJs = nodePath.extname(fileName).toLowerCase() === '.cts';
		return { target: ts.ScriptTarget.ES2022, module: commonJs ? ts.ModuleKind.CommonJS : ts.ModuleKind.ESNext };
	}

	let options = cache?.get(configPath);
	if (!options) {
		options = readTsConfig(configPath);
		cache?.set(configPath, options);
	}
	return options;
}

function readTsConfig(configPath: string): ts.CompilerOptions {
	const { config, error } = ts.readConfigFile(configPath, ts.sys.readFile);
	if (error) {
		throw new Error(`${configPath}: ${ts.flattenDiagnosticMessageText(error.messageText, ' ')}`);
	}
	const parsed = ts.parseJsonConfigFileContent(config, ts.sys, nodePath.dirname(configPath), undefined, configPath);
	// 18003: "No inputs were found"; irrelevant when transpiling a single file.
	const errors = parsed.errors.filter((d) => d.category === ts.DiagnosticCategory.Error && d.code !== 18003);
	if (errors.length) {
		throw new Error(`${configPath}: ${errors.map((d) => ts.flattenDiagnosticMessageText(d.messageText, ' ')).join('; ')}`);
	}
	return parsed.options;
}

function formatDiagnostic(diagnostic: ts.Diagnostic): string {
	const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, ' ');
	if (!diagnostic.file || diagnostic.start === undefined) {
		return message;
	}
	const { line, character } = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start);
	return `line ${line + 1}, column ${character + 1}: ${message}`;
}
