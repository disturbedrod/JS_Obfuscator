import * as vscode from 'vscode';
import { obfuscateFolders } from './obfuscateFolder';
import { getOutputPath, obfuscateCode } from './obfuscator';
import { displayName, errorMessage, exists } from './util';

export function activate(context: vscode.ExtensionContext): void {
	const log = vscode.window.createOutputChannel('JS Obfuscator');
	context.subscriptions.push(
		log,
		vscode.commands.registerCommand('jsObfuscator.obfuscateFileToNewFile', obfuscateFileToNewFile),
		vscode.commands.registerCommand('jsObfuscator.obfuscateFolder', (uri?: vscode.Uri, uris?: vscode.Uri[]) =>
			obfuscateFolders(log, uri instanceof vscode.Uri ? uri : undefined, uris),
		),
	);
}

export function deactivate(): void {}

async function obfuscateFileToNewFile(): Promise<void> {
	const editor = vscode.window.activeTextEditor;
	if (!editor) {
		vscode.window.showWarningMessage('JS Obfuscator: open a JavaScript file first.');
		return;
	}

	const document = editor.document;
	if (document.languageId !== 'javascript') {
		vscode.window.showWarningMessage('JS Obfuscator: the active file is not JavaScript.');
		return;
	}

	const outputUri = await resolveOutputUri(document);
	if (!outputUri) {
		return;
	}

	let obfuscated: string;
	try {
		// Use the editor text rather than the file on disk so unsaved edits are included.
		obfuscated = await vscode.window.withProgress(
			{ location: vscode.ProgressLocation.Notification, title: 'Obfuscating JavaScript…' },
			async () => obfuscateCode(document.getText()),
		);
	} catch (err) {
		vscode.window.showErrorMessage(`JS Obfuscator: could not obfuscate ${displayName(document.uri)}: ${errorMessage(err)}`);
		return;
	}

	await vscode.workspace.fs.writeFile(outputUri, Buffer.from(obfuscated, 'utf8'));

	const outputDocument = await vscode.workspace.openTextDocument(outputUri);
	await vscode.window.showTextDocument(outputDocument, { viewColumn: vscode.ViewColumn.Beside, preview: false });
	vscode.window.showInformationMessage(`JS Obfuscator: wrote ${displayName(outputUri)}`);
}

/**
 * Picks where the obfuscated copy goes. Saved files get a sibling `<name>.obfuscated.js`
 * (confirming before overwriting); untitled documents have no location, so ask for one.
 */
async function resolveOutputUri(document: vscode.TextDocument): Promise<vscode.Uri | undefined> {
	if (document.isUntitled) {
		return vscode.window.showSaveDialog({
			title: 'Save Obfuscated JavaScript',
			filters: { JavaScript: ['js', 'mjs', 'cjs'] },
		});
	}

	const outputUri = document.uri.with({ path: getOutputPath(document.uri.path) });

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
