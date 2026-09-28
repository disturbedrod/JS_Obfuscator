import * as vscode from 'vscode';
import { OptionsResolver } from './config';
import { ObfuscatorOptions, obfuscateCode } from './obfuscator';
import { errorMessage } from './util';

/**
 * Replaces each non-empty selection with its obfuscated form in a single edit, so one Undo restores it.
 * Each selection is obfuscated as a standalone program, so it must be complete statements.
 */
export async function obfuscateSelection(): Promise<void> {
	const editor = vscode.window.activeTextEditor;
	if (!editor || editor.document.languageId !== 'javascript') {
		vscode.window.showWarningMessage('JS Obfuscator: select code in a JavaScript file first.');
		return;
	}

	const selections = editor.selections.filter((selection) => !selection.isEmpty);
	if (selections.length === 0) {
		vscode.window.showInformationMessage('JS Obfuscator: select the code to obfuscate first.');
		return;
	}

	let options: ObfuscatorOptions;
	try {
		// A source map for a fragment spliced into a file would point at the wrong place, so selections never get one.
		options = { ...(await new OptionsResolver().resolve(editor.document.uri)), sourceMap: false };
	} catch (err) {
		vscode.window.showErrorMessage(`JS Obfuscator: ${errorMessage(err)}`);
		return;
	}

	let replacements: { range: vscode.Range; text: string }[];
	try {
		// Obfuscate everything before editing, so a failure in one selection leaves the document untouched.
		replacements = selections.map((range) => ({ range, text: obfuscateCode(editor.document.getText(range), options) }));
	} catch (err) {
		vscode.window.showErrorMessage(
			`JS Obfuscator: could not obfuscate the selection: ${errorMessage(err)}. ` +
				'Select complete statements (for example whole functions), not part of an expression.',
		);
		return;
	}

	const applied = await editor.edit((builder) => {
		for (const { range, text } of replacements) {
			builder.replace(range, text);
		}
	});
	if (!applied) {
		vscode.window.showErrorMessage('JS Obfuscator: the document changed while obfuscating; nothing was replaced.');
	}
}
