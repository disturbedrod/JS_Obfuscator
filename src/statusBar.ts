import * as vscode from 'vscode';
import { OptionsResolver, RC_FILE, SECTION, getPresetSetting } from './config';
import { documentKind } from './obfuscation';
import { displayName, errorMessage } from './util';

/**
 * Status bar item showing the preset that applies to the active JavaScript, TypeScript or HTML file.
 * Clicking it picks a preset, or opens the `.obfuscatorrc.json` that sets it, since the setting wouldn't win.
 */
export function registerStatusBar(): vscode.Disposable[] {
	const item = vscode.window.createStatusBarItem('jsObfuscator.preset', vscode.StatusBarAlignment.Right, 100);
	item.name = 'JS Obfuscator Pro Preset';
	let generation = 0;

	const update = async (): Promise<void> => {
		// Updates can overlap while config files are read; only the latest one may touch the item.
		const current = ++generation;
		const document = vscode.window.activeTextEditor?.document;
		if (!document || !documentKind(document) || !vscode.workspace.getConfiguration(SECTION).get<boolean>('statusBar.enabled', true)) {
			item.hide();
			return;
		}

		try {
			const rc = await new OptionsResolver().findRcConfig(document.uri);
			if (current !== generation) {
				return;
			}
			const preset = rc?.preset ?? getPresetSetting(vscode.workspace.getConfiguration(SECTION, document.uri));
			item.text = `$(lock) ${preset}`;
			item.backgroundColor = undefined;
			if (rc?.preset) {
				item.tooltip = `JS Obfuscator Pro preset: ${preset}, set by ${displayName(rc.uri)}. Click to open it.`;
				item.command = { title: `Open ${RC_FILE}`, command: 'vscode.open', arguments: [rc.uri] };
			} else {
				item.tooltip = `JS Obfuscator Pro preset: ${preset}. Click to change it.`;
				item.command = 'jsObfuscator.selectPreset';
			}
		} catch (err) {
			if (current !== generation) {
				return;
			}
			item.text = '$(warning) preset';
			item.tooltip = `JS Obfuscator Pro: ${errorMessage(err)}`;
			item.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
			item.command = undefined;
		}
		item.show();
	};

	const watcher = vscode.workspace.createFileSystemWatcher(`**/${RC_FILE}`);
	void update();
	return [
		item,
		watcher,
		watcher.onDidCreate(update),
		watcher.onDidChange(update),
		watcher.onDidDelete(update),
		vscode.window.onDidChangeActiveTextEditor(update),
		vscode.workspace.onDidChangeConfiguration((event) => event.affectsConfiguration(SECTION) && update()),
	];
}
