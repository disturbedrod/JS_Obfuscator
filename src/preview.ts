import { posix as path } from 'path';
import * as vscode from 'vscode';
import { getOutputSettings } from './config';
import { pickOutputUri, showOutput, siblingOutputUri } from './obfuscateFile';
import { Obfuscated, ObfuscationRun, OutputFileUri, documentKind, outputFilesFor, writeOutputFiles } from './obfuscation';
import { getOutputPath } from './obfuscator';
import { SourceKind } from './pipeline';
import { displayName, errorMessage } from './util';

export const PREVIEW_SCHEME = 'js-obfuscator-preview';

interface Preview {
	obfuscated: Obfuscated;
	kind: SourceKind;
	/** Where Save writes: next to the source. Undefined for unsaved documents, which ask. */
	outputUri?: vscode.Uri;
	/** Files for `outputUri`; the first is the obfuscated code shown in the diff. */
	files: OutputFileUri[];
}

const UNTITLED_EXTENSIONS: Record<SourceKind, string> = { javascript: '.js', typescript: '.ts', html: '.html' };

/**
 * Read-only documents holding obfuscation previews. The obfuscated code is kept, not regenerated, so saving
 * writes exactly what was previewed (obfuscation is random unless `seed` is set).
 */
class PreviewProvider implements vscode.TextDocumentContentProvider {
	readonly previews = new Map<string, Preview>();
	private counter = 0;

	add(preview: Preview, displayPath: string): vscode.Uri {
		// The query makes each preview unique, so previewing the same file again shows fresh output.
		const uri = vscode.Uri.from({ scheme: PREVIEW_SCHEME, path: displayPath, query: String(++this.counter) });
		this.previews.set(uri.toString(), preview);
		return uri;
	}

	provideTextDocumentContent(uri: vscode.Uri): string {
		return this.previews.get(uri.toString())?.files[0].text ?? '// This preview has expired. Run "JS Obfuscator Pro: Preview Obfuscation" again.';
	}
}

export function registerPreview(): vscode.Disposable[] {
	const provider = new PreviewProvider();
	return [
		vscode.workspace.registerTextDocumentContentProvider(PREVIEW_SCHEME, provider),
		vscode.workspace.onDidCloseTextDocument((document) => provider.previews.delete(document.uri.toString())),
		vscode.commands.registerCommand('jsObfuscator.previewObfuscation', (uri?: unknown) =>
			previewObfuscation(provider, uri instanceof vscode.Uri ? uri : undefined),
		),
		vscode.commands.registerCommand('jsObfuscator.savePreview', (uri?: unknown) =>
			savePreview(provider, uri instanceof vscode.Uri ? uri : undefined),
		),
	];
}

/** Obfuscates a file (or the active editor) and shows the original and obfuscated code side by side in a diff editor. */
async function previewObfuscation(provider: PreviewProvider, uri: vscode.Uri | undefined): Promise<void> {
	let document: vscode.TextDocument | undefined;
	try {
		document = uri ? await vscode.workspace.openTextDocument(uri) : vscode.window.activeTextEditor?.document;
	} catch (err) {
		vscode.window.showErrorMessage(`JS Obfuscator Pro: ${errorMessage(err)}`);
		return;
	}
	const kind = document && documentKind(document);
	if (!document || !kind) {
		vscode.window.showWarningMessage('JS Obfuscator Pro: open a JavaScript, TypeScript or HTML file to preview.');
		return;
	}
	const source = document;

	try {
		const obfuscated = await vscode.window.withProgress(
			{ location: vscode.ProgressLocation.Notification, title: `Obfuscating ${displayName(source.uri)}…` },
			() => new ObfuscationRun().obfuscate(source.uri, source.getText(), kind),
		);

		const outputUri = source.isUntitled ? undefined : source.uri.with({ path: getOutputPath(source.uri.path, getOutputSettings(source.uri).suffix) });
		// Untitled documents have no extension; add one so the output name and syntax highlighting are right.
		const displayPath = outputUri?.path ?? `/${getOutputPath(`${source.uri.path}${UNTITLED_EXTENSIONS[kind]}`, getOutputSettings().suffix)}`;
		const files = outputFilesFor(obfuscated, outputUri ?? source.uri.with({ path: displayPath }));
		const previewUri = provider.add({ obfuscated, kind, outputUri, files }, displayPath);

		const title = `${path.basename(source.uri.path)} ↔ ${path.basename(displayPath)} (Obfuscation Preview)`;
		await vscode.commands.executeCommand('vscode.diff', source.uri, previewUri, title, { preview: false });
	} catch (err) {
		vscode.window.showErrorMessage(`JS Obfuscator Pro: could not obfuscate ${displayName(source.uri)}: ${errorMessage(err)}`);
	}
}

/** Writes the previewed output next to the source (asking before overwriting), or where the user picks for unsaved documents. */
async function savePreview(provider: PreviewProvider, uri: vscode.Uri | undefined): Promise<void> {
	const previewUri = uri?.scheme === PREVIEW_SCHEME ? uri : activePreviewUri();
	const preview = previewUri && provider.previews.get(previewUri.toString());
	if (!preview) {
		vscode.window.showWarningMessage('JS Obfuscator Pro: this preview has expired. Run "JS Obfuscator Pro: Preview Obfuscation" again.');
		return;
	}

	try {
		const { source } = preview.obfuscated;
		const outputUri = preview.outputUri ? await siblingOutputUri(source) : await pickOutputUri(source, preview.kind);
		if (!outputUri) {
			return;
		}
		// The map comment and `sources` depend on where the file goes, so only reuse the files for the path they were made for.
		const files = outputUri.toString() === preview.outputUri?.toString() ? preview.files : outputFilesFor(preview.obfuscated, outputUri);
		await writeOutputFiles(files);

		const open = 'Open';
		const choice = await vscode.window.showInformationMessage(`JS Obfuscator Pro: wrote ${displayName(outputUri)}`, open);
		if (choice === open) {
			await showOutput(outputUri);
		}
	} catch (err) {
		vscode.window.showErrorMessage(`JS Obfuscator Pro: could not save the preview: ${errorMessage(err)}`);
	}
}

function activePreviewUri(): vscode.Uri | undefined {
	const editors = [vscode.window.activeTextEditor, ...vscode.window.visibleTextEditors];
	return editors.find((editor) => editor?.document.uri.scheme === PREVIEW_SCHEME)?.document.uri;
}
