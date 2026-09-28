import * as vscode from 'vscode';
import { OptionsResolver, getOutputSettings } from './config';
import { getOutputPath, obfuscateCode } from './obfuscator';
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
	const resolver = new OptionsResolver();
	const written: vscode.Uri[] = [];

	for (const document of documents) {
		try {
			const { suffix } = getOutputSettings(document.uri);
			const outputUri = askForOutput || document.isUntitled ? await pickOutputUri(document, suffix) : await siblingOutputUri(document, suffix);
			if (!outputUri) {
				continue;
			}

			const options = await resolver.resolve(document.uri);
			const obfuscated = await vscode.window.withProgress(
				{ location: vscode.ProgressLocation.Notification, title: `Obfuscating ${displayName(document.uri)}…` },
				async () => obfuscateCode(document.getText(), options),
			);

			await vscode.workspace.fs.writeFile(outputUri, Buffer.from(obfuscated, 'utf8'));
			written.push(outputUri);
		} catch (err) {
			vscode.window.showErrorMessage(`JS Obfuscator: could not obfuscate ${displayName(document.uri)}: ${errorMessage(err)}`);
		}
	}

	if (written.length === 1) {
		const outputDocument = await vscode.workspace.openTextDocument(written[0]);
		await vscode.window.showTextDocument(outputDocument, { viewColumn: vscode.ViewColumn.Beside, preview: false });
		vscode.window.showInformationMessage(`JS Obfuscator: wrote ${displayName(written[0])}`);
	} else if (written.length > 1) {
		vscode.window.showInformationMessage(`JS Obfuscator: wrote ${written.length} obfuscated files.`);
	}
}

async function resolveDocuments(uri: vscode.Uri | undefined, uris: vscode.Uri[] | undefined): Promise<vscode.TextDocument[]> {
	if (!uri) {
		const editor = vscode.window.activeTextEditor;
		if (!editor) {
			vscode.window.showWarningMessage('JS Obfuscator: open a JavaScript file first.');
			return [];
		}
		uri = editor.document.uri;
	}

	const targets = uris?.length ? uris : [uri];
	// openTextDocument returns the already-open document (with unsaved edits) or loads it from disk without showing it.
	// Multi-select can include folders or other files; those fail to open or aren't JavaScript and are skipped.
	const opened = await Promise.allSettled(targets.map((target) => vscode.workspace.openTextDocument(target)));
	const documents = opened.flatMap((result) =>
		result.status === 'fulfilled' && result.value.languageId === 'javascript' ? [result.value] : [],
	);

	if (documents.length < targets.length) {
		const skipped = targets.length - documents.length;
		vscode.window.showWarningMessage(
			documents.length === 0
				? 'JS Obfuscator: the selected file is not JavaScript.'
				: `JS Obfuscator: skipped ${skipped} item(s) that are not JavaScript files.`,
		);
	}
	return documents;
}

async function siblingOutputUri(document: vscode.TextDocument, suffix: string): Promise<vscode.Uri | undefined> {
	const outputUri = document.uri.with({ path: getOutputPath(document.uri.path, suffix) });

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
function pickOutputUri(document: vscode.TextDocument, suffix: string): Thenable<vscode.Uri | undefined> {
	return vscode.window.showSaveDialog({
		title: `Save Obfuscated ${document.isUntitled ? 'JavaScript' : displayName(document.uri)}`,
		defaultUri: document.isUntitled ? undefined : document.uri.with({ path: getOutputPath(document.uri.path, suffix) }),
		filters: { JavaScript: ['js', 'mjs', 'cjs'] },
	});
}
