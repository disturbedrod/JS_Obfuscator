import * as vscode from 'vscode';
import { getOutputSettings } from './config';
import { ObfuscationRun, documentKind, outputFilesFor, writeOutputFiles } from './obfuscation';
import { getOutputPath } from './obfuscator';
import { SourceKind } from './pipeline';
import { displayName, errorMessage, exists } from './util';

/** Writes `<name>.obfuscated.js` next to each file, confirming before overwriting. */
export function obfuscateFileToNewFile(uri?: vscode.Uri, uris?: vscode.Uri[]): Promise<void> {
	return obfuscateFiles(uri, uris, false);
}

/** Like {@link obfuscateFileToNewFile}, but asks where to save each output file. */
export function obfuscateFileAs(uri?: vscode.Uri, uris?: vscode.Uri[]): Promise<void> {
	return obfuscateFiles(uri, uris, true);
}

/**
 * Obfuscates the files passed by a menu (Explorer multi-select, editor title/context), or the active
 * editor when run from the Command Palette. Open documents are read from the editor, so unsaved edits are included.
 */
async function obfuscateFiles(uri: vscode.Uri | undefined, uris: vscode.Uri[] | undefined, askForOutput: boolean): Promise<void> {
	const documents = await resolveDocuments(uri, uris);
	const run = new ObfuscationRun();
	const written: vscode.Uri[] = [];

	for (const { document, kind } of documents) {
		try {
			const outputUri = askForOutput || document.isUntitled ? await pickOutputUri(document.uri, kind) : await siblingOutputUri(document.uri);
			if (!outputUri) {
				continue;
			}

			const obfuscated = await vscode.window.withProgress(
				{ location: vscode.ProgressLocation.Notification, title: `Obfuscating ${displayName(document.uri)}…` },
				() => run.obfuscate(document.uri, document.getText(), kind),
			);

			await writeOutputFiles(outputFilesFor(obfuscated, outputUri));
			written.push(outputUri);
		} catch (err) {
			vscode.window.showErrorMessage(`JS Obfuscator Pro: could not obfuscate ${displayName(document.uri)}: ${errorMessage(err)}`);
		}
	}

	if (written.length === 1) {
		await showOutput(written[0]);
		vscode.window.showInformationMessage(`JS Obfuscator Pro: wrote ${displayName(written[0])}`);
	} else if (written.length > 1) {
		vscode.window.showInformationMessage(`JS Obfuscator Pro: wrote ${written.length} obfuscated files.`);
	}
}

export async function showOutput(uri: vscode.Uri): Promise<void> {
	const outputDocument = await vscode.workspace.openTextDocument(uri);
	await vscode.window.showTextDocument(outputDocument, { viewColumn: vscode.ViewColumn.Beside, preview: false });
}

async function resolveDocuments(uri: vscode.Uri | undefined, uris: vscode.Uri[] | undefined): Promise<{ document: vscode.TextDocument; kind: SourceKind }[]> {
	if (!uri) {
		const editor = vscode.window.activeTextEditor;
		if (!editor) {
			vscode.window.showWarningMessage('JS Obfuscator Pro: open a JavaScript, TypeScript or HTML file first.');
			return [];
		}
		uri = editor.document.uri;
	}

	const targets = uris?.length ? uris : [uri];
	// openTextDocument returns the already-open document (with unsaved edits) or loads it from disk without showing it.
	// Multi-select can include folders or other files; those fail to open or aren't supported and are skipped.
	const opened = await Promise.allSettled(targets.map((target) => vscode.workspace.openTextDocument(target)));
	const documents = opened.flatMap((result) => {
		const kind = result.status === 'fulfilled' ? documentKind(result.value) : undefined;
		return result.status === 'fulfilled' && kind ? [{ document: result.value, kind }] : [];
	});

	if (documents.length < targets.length) {
		const skipped = targets.length - documents.length;
		vscode.window.showWarningMessage(
			documents.length === 0
				? 'JS Obfuscator Pro: the selected file is not JavaScript, TypeScript or HTML. TypeScript declaration files (.d.ts) have no code to obfuscate.'
				: `JS Obfuscator Pro: skipped ${skipped} item(s) that are not JavaScript, TypeScript or HTML files.`,
		);
	}
	return documents;
}

/** `<name><suffix>.<ext>` next to `source`, or undefined if it exists and the user declines to overwrite it. */
export async function siblingOutputUri(source: vscode.Uri): Promise<vscode.Uri | undefined> {
	const { suffix } = getOutputSettings(source);
	const outputUri = source.with({ path: getOutputPath(source.path, suffix) });

	if (await exists(outputUri)) {
		const overwrite = 'Overwrite';
		const choice = await vscode.window.showWarningMessage(
			`${displayName(outputUri)} already exists. Overwrite it?`,
			{ modal: true },
			overwrite,
		);
		if (choice !== overwrite) {
			return undefined;
		}
	}

	return outputUri;
}

/** Save dialog, suggesting the sibling path; the OS dialog handles overwrite confirmation. */
export function pickOutputUri(source: vscode.Uri, kind: SourceKind): Thenable<vscode.Uri | undefined> {
	const untitled = source.scheme === 'untitled';
	const { suffix } = getOutputSettings(source);
	return vscode.window.showSaveDialog({
		title: `Save Obfuscated ${untitled ? (kind === 'html' ? 'HTML' : 'JavaScript') : displayName(source)}`,
		defaultUri: untitled ? undefined : source.with({ path: getOutputPath(source.path, suffix) }),
		filters: kind === 'html' ? { HTML: ['html', 'htm'] } : { JavaScript: ['js', 'mjs', 'cjs'] },
	});
}
