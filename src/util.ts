import * as vscode from 'vscode';

export async function exists(uri: vscode.Uri): Promise<boolean> {
	try {
		await vscode.workspace.fs.stat(uri);
		return true;
	} catch {
		return false;
	}
}

export function displayName(uri: vscode.Uri): string {
	return vscode.workspace.asRelativePath(uri, false);
}

export function errorMessage(err: unknown): string {
	return err instanceof Error ? err.message : String(err);
}

/** Editor text if the file is open (so unsaved edits are included), otherwise the contents on disk. */
export async function readSource(uri: vscode.Uri): Promise<string> {
	const open = vscode.workspace.textDocuments.find((doc) => doc.uri.toString() === uri.toString());
	if (open) {
		return open.getText();
	}
	return new TextDecoder('utf-8').decode(await vscode.workspace.fs.readFile(uri));
}
