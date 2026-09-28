import * as vscode from 'vscode';
import { OptionsResolver, RC_FILE, SECTION, getPresetSetting } from './config';
import { PRESET_NAMES, PresetName } from './obfuscator';
import { displayName, errorMessage, exists } from './util';

const PRESET_DESCRIPTIONS: Record<PresetName, string> = {
	default: 'Renamed identifiers, all strings base64-encoded. Fast, small output.',
	low: 'Adds self-defending code and disables console output.',
	medium: 'Adds control-flow flattening, dead code, split strings. Slower, larger output.',
	high: 'Adds rc4 strings and debug protection. Much slower and larger. Browser code only: Node.js processes never exit.',
};

/** Quick pick that stores the chosen preset in workspace settings (user settings when no folder is open). */
export async function selectPreset(): Promise<void> {
	const current = getPresetSetting();
	const picked = await vscode.window.showQuickPick(
		PRESET_NAMES.map((name) => ({
			label: name,
			description: name === current ? '(current)' : undefined,
			detail: PRESET_DESCRIPTIONS[name],
			name,
		})),
		{ title: 'JS Obfuscator: Select Obfuscation Preset', placeHolder: `Current preset: ${current}` },
	);
	if (!picked) {
		return;
	}

	const target = vscode.workspace.workspaceFolders?.length ? vscode.ConfigurationTarget.Workspace : vscode.ConfigurationTarget.Global;
	await vscode.workspace.getConfiguration(SECTION).update('preset', picked.name, target);

	// A config file's preset beats the setting; say so rather than leave the user wondering why nothing changed.
	const activeUri = vscode.window.activeTextEditor?.document.uri;
	const rc = activeUri ? await new OptionsResolver().findRcConfig(activeUri).catch(() => undefined) : undefined;
	const suffix = rc?.preset && rc.preset !== picked.name ? ` Note: ${displayName(rc.uri)} sets "${rc.preset}", which takes priority for files it covers.` : '';
	vscode.window.showInformationMessage(`JS Obfuscator: preset set to "${picked.name}".${suffix}`);
}

/** Creates a starter `.obfuscatorrc.json` in a workspace folder root, or opens the existing one. */
export async function createConfigFile(): Promise<void> {
	const folder = await pickWorkspaceFolder();
	if (!folder) {
		return;
	}

	const uri = vscode.Uri.joinPath(folder.uri, RC_FILE);
	try {
		if (!(await exists(uri))) {
			const starter = {
				preset: getPresetSetting(vscode.workspace.getConfiguration(SECTION, folder.uri)),
				reservedNames: [],
				reservedStrings: [],
			};
			await vscode.workspace.fs.writeFile(uri, Buffer.from(`${JSON.stringify(starter, null, '\t')}\n`, 'utf8'));
		}
		await vscode.window.showTextDocument(uri);
	} catch (err) {
		vscode.window.showErrorMessage(`JS Obfuscator: could not create ${RC_FILE}: ${errorMessage(err)}`);
	}
}

async function pickWorkspaceFolder(): Promise<vscode.WorkspaceFolder | undefined> {
	const folders = vscode.workspace.workspaceFolders ?? [];
	if (folders.length === 0) {
		vscode.window.showWarningMessage(`JS Obfuscator: open a folder to create ${RC_FILE}.`);
		return undefined;
	}
	if (folders.length === 1) {
		return folders[0];
	}
	return vscode.window.showWorkspaceFolderPick({ placeHolder: `Workspace folder to create ${RC_FILE} in` });
}
