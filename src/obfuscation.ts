import * as nodePath from 'path';
import type { CompilerOptions } from 'typescript';
import * as vscode from 'vscode';
import { OptionsResolver } from './config';
import type { ObfuscatorOptions } from './obfuscator';
import { ObfuscationResult, SourceKind, obfuscateSource, outputFiles, sourceKindFromLanguage } from './pipeline';

export interface Obfuscated {
	source: vscode.Uri;
	result: ObfuscationResult;
	options: ObfuscatorOptions;
}

export interface OutputFileUri {
	uri: vscode.Uri;
	text: string;
}

/** JavaScript, TypeScript (not declaration files) or HTML; undefined for anything we can't obfuscate. */
export function documentKind(document: vscode.TextDocument): SourceKind | undefined {
	return sourceKindFromLanguage(document.languageId, document.uri.path);
}

/** One command run. Create one per run so `.obfuscatorrc.json` and `tsconfig.json` files are read once each. */
export class ObfuscationRun {
	private readonly resolver = new OptionsResolver();
	private readonly tsConfigCache = new Map<string, CompilerOptions>();

	async obfuscate(source: vscode.Uri, text: string, kind: SourceKind): Promise<Obfuscated> {
		const options = await this.resolver.resolve(source);
		const result = obfuscateSource(
			{
				text,
				kind,
				fileName: source.path,
				configSearchDir: source.scheme === 'file' ? nodePath.dirname(source.fsPath) : undefined,
				tsConfigCache: this.tsConfigCache,
			},
			options,
		);
		return { source, result, options };
	}
}

/** The obfuscated file at `output`, plus its `.map` file when separate source maps are on. */
export function outputFilesFor({ source, result, options }: Obfuscated, output: vscode.Uri): OutputFileUri[] {
	const sourcePath = source.scheme === 'untitled' ? undefined : source.path;
	return outputFiles(result, output.path, sourcePath, options).map((file) => ({ uri: output.with({ path: file.path }), text: file.text }));
}

export async function writeOutputFiles(files: OutputFileUri[]): Promise<void> {
	for (const { uri, text } of files) {
		await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(uri, '..'));
		await vscode.workspace.fs.writeFile(uri, Buffer.from(text, 'utf8'));
	}
}
