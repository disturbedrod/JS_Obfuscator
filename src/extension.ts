import * as vscode from 'vscode';
import { createConfigFile, selectPreset } from './configCommands';
import { obfuscateFileAs, obfuscateFileToNewFile } from './obfuscateFile';
import { obfuscateFolders } from './obfuscateFolder';
import { obfuscateSelection } from './obfuscateSelection';

export function activate(context: vscode.ExtensionContext): void {
	const log = vscode.window.createOutputChannel('JS Obfuscator');
	context.subscriptions.push(
		log,
		vscode.commands.registerCommand('jsObfuscator.obfuscateFileToNewFile', (uri?: unknown, uris?: unknown) =>
			obfuscateFileToNewFile(asUri(uri), asUris(uris)),
		),
		vscode.commands.registerCommand('jsObfuscator.obfuscateFileAs', (uri?: unknown, uris?: unknown) =>
			obfuscateFileAs(asUri(uri), asUris(uris)),
		),
		vscode.commands.registerCommand('jsObfuscator.obfuscateSelection', obfuscateSelection),
		vscode.commands.registerCommand('jsObfuscator.obfuscateFolder', (uri?: unknown, uris?: unknown) =>
			obfuscateFolders(log, asUri(uri), asUris(uris)),
		),
		vscode.commands.registerCommand('jsObfuscator.selectPreset', selectPreset),
		vscode.commands.registerCommand('jsObfuscator.createConfigFile', createConfigFile),
	);
}

export function deactivate(): void {}

// Menus pass the clicked resource and, from the Explorer, the multi-selection. Other callers pass other
// things (the editor title menu passes `{ groupId }` second), so keep only real URIs.
function asUri(value: unknown): vscode.Uri | undefined {
	return value instanceof vscode.Uri ? value : undefined;
}

function asUris(value: unknown): vscode.Uri[] | undefined {
	return Array.isArray(value) ? value.filter((item): item is vscode.Uri => item instanceof vscode.Uri) : undefined;
}
