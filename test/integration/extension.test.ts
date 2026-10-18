import * as assert from 'assert';
import * as fs from 'fs';
import * as vscode from 'vscode';
import { filePrefix } from '../../src/obfuscator';
import { declaredFunctions, inlineScripts, runScripts } from '../helpers';

// Runs inside VS Code against a copy of test/fixtures/workspace (see .vscode-test.mjs).

const EXTENSION_ID = 'rsandoval1206.js-obfuscator-pro';
const root = (): vscode.Uri => vscode.workspace.workspaceFolders![0].uri;
const file = (relative: string): vscode.Uri => vscode.Uri.joinPath(root(), ...relative.split('/'));
const read = (relative: string): string => fs.readFileSync(file(relative).fsPath, 'utf8');
const exists = (relative: string): boolean => fs.existsSync(file(relative).fsPath);
const remove = (relative: string): void => fs.rmSync(file(relative).fsPath, { recursive: true, force: true });

type Window = typeof vscode.window;
const restores: (() => void)[] = [];

/**
 * Replaces a `vscode.window` function until the end of the test. Test files inside the extension folder get the same
 * `vscode` API object as the extension, so this is what the extension calls; dialogs can't be clicked in tests.
 */
function stubWindow<K extends keyof Window>(name: K, implementation: (...args: unknown[]) => unknown): unknown[][] {
	const calls: unknown[][] = [];
	const target = vscode.window as unknown as Record<string, unknown>;
	const original = target[name];
	target[name] = (...args: unknown[]) => {
		calls.push(args);
		return Promise.resolve(implementation(...args));
	};
	restores.push(() => (target[name] = original));
	return calls;
}

async function closeEditors(): Promise<void> {
	await vscode.commands.executeCommand('workbench.action.closeAllEditors');
}

describe('JS Obfuscator Pro extension', () => {
	afterEach(async () => {
		restores.splice(0).reverse().forEach((restore) => restore());
		await closeEditors();
	});

	it('activates and registers every contributed command', async () => {
		const extension = vscode.extensions.getExtension(EXTENSION_ID);
		assert.ok(extension, `${EXTENSION_ID} should be installed`);
		await extension.activate();

		const contributed = (extension.packageJSON as { contributes: { commands: { command: string }[] } }).contributes.commands.map((c) => c.command);
		const registered = new Set(await vscode.commands.getCommands(true));
		for (const command of contributed) {
			assert.ok(registered.has(command), `${command} should be registered`);
		}
	});

	describe('Obfuscate File to New File', () => {
		after(() => ['app.obfuscated.js', 'src/greet.obfuscated.js', 'page.obfuscated.html'].forEach(remove));

		it('writes <name>.obfuscated.js next to a JavaScript file', async () => {
			stubWindow('showInformationMessage', () => undefined);
			await vscode.commands.executeCommand('jsObfuscator.obfuscateFileToNewFile', file('app.js'));

			const output = read('app.obfuscated.js');
			assert.ok(!output.includes("'Hello'"));
			assert.strictEqual(runScripts([output], 'greeting'), 'Hello from app');
			assert.strictEqual(read('app.js'), "var greeting = ['Hello', 'from', 'app'].join(' ');\n", 'the original is untouched');
		});

		it('asks before overwriting, and keeps the file when declined', async () => {
			const before = read('app.obfuscated.js');
			const prompts = stubWindow('showWarningMessage', () => undefined);
			await vscode.commands.executeCommand('jsObfuscator.obfuscateFileToNewFile', file('app.js'));
			assert.strictEqual(prompts.length, 1);
			assert.match(String(prompts[0][0]), /already exists/);
			assert.strictEqual(read('app.obfuscated.js'), before);
		});

		it('overwrites when confirmed', async () => {
			const before = read('app.obfuscated.js');
			stubWindow('showWarningMessage', () => 'Overwrite');
			stubWindow('showInformationMessage', () => undefined);
			await vscode.commands.executeCommand('jsObfuscator.obfuscateFileToNewFile', file('app.js'));
			assert.notStrictEqual(read('app.obfuscated.js'), before, 'obfuscation is random without a seed');
		});

		it('transpiles TypeScript into a .js file', async () => {
			stubWindow('showInformationMessage', () => undefined);
			await vscode.commands.executeCommand('jsObfuscator.obfuscateFileToNewFile', file('src/greet.ts'));
			assert.strictEqual(runScripts([read('src/greet.obfuscated.js')], 'tsGreeting'), 'Hi TypeScript');
		});

		it('obfuscates the inline scripts of an HTML page and keeps the markup', async () => {
			stubWindow('showInformationMessage', () => undefined);
			await vscode.commands.executeCommand('jsObfuscator.obfuscateFileToNewFile', file('page.html'));
			const output = read('page.obfuscated.html');
			assert.ok(output.includes('<h1>Fixture page</h1>'));
			assert.ok(!output.includes("'one'"));
			assert.strictEqual(runScripts(inlineScripts(output), 'first + second'), 'onetwo');
		});
	});

	describe('Obfuscate Selection', () => {
		it('replaces the selection in place', async () => {
			const document = await vscode.workspace.openTextDocument({ language: 'javascript', content: "var picked = 'selected text';" });
			const editor = await vscode.window.showTextDocument(document);
			editor.selection = new vscode.Selection(document.positionAt(0), document.positionAt(document.getText().length));

			await vscode.commands.executeCommand('jsObfuscator.obfuscateSelection');
			const text = document.getText();
			assert.ok(!text.includes('selected text'));
			assert.strictEqual(runScripts([text], 'picked'), 'selected text');
		});
	});

	describe('Preview Obfuscation', () => {
		after(() => remove('app.obfuscated.js'));

		it('shows a diff and saves exactly what was previewed', async () => {
			await vscode.commands.executeCommand('jsObfuscator.previewObfuscation', file('app.js'));
			const tab = vscode.window.tabGroups.activeTabGroup.activeTab;
			assert.ok(tab?.input instanceof vscode.TabInputTextDiff, 'a diff editor should be open');
			const previewUri = tab.input.modified;
			assert.strictEqual(previewUri.scheme, 'js-obfuscator-preview');
			const previewed = (await vscode.workspace.openTextDocument(previewUri)).getText();

			remove('app.obfuscated.js');
			stubWindow('showInformationMessage', () => undefined);
			await vscode.commands.executeCommand('jsObfuscator.savePreview', previewUri);
			assert.strictEqual(read('app.obfuscated.js'), previewed);
		});
	});

	describe('Obfuscate All JavaScript in Folder', () => {
		const settings = () => vscode.workspace.getConfiguration('jsObfuscator');

		afterEach(async () => {
			remove('obfuscated');
			await settings().update('output.uniquePrefixes', undefined, vscode.ConfigurationTarget.Workspace);
		});

		async function runFolder(): Promise<unknown[][]> {
			const confirms = stubWindow('showWarningMessage', (_message, options) =>
				(options as vscode.MessageOptions | undefined)?.modal ? 'Obfuscate' : undefined,
			);
			stubWindow('showInformationMessage', () => undefined);
			await vscode.commands.executeCommand('jsObfuscator.obfuscateFolder');
			return confirms;
		}

		it('mirrors every source file into obfuscated/ and skips excluded and declaration files', async () => {
			const confirms = await runFolder();
			assert.match(String(confirms[0][0]), /^Obfuscate 4 files into obfuscated\/\?$/);

			assert.strictEqual(runScripts([read('obfuscated/app.js')], 'greeting'), 'Hello from app');
			assert.strictEqual(runScripts([read('obfuscated/src/greet.js')], 'tsGreeting'), 'Hi TypeScript');
			assert.strictEqual(runScripts(inlineScripts(read('obfuscated/page.html')), 'first + second'), 'onetwo');
			assert.ok(!exists('obfuscated/node_modules'));
			assert.ok(!exists('obfuscated/src/types.d.js'));
			assert.ok(!exists('obfuscated/src/types.d.ts'));
		});

		it('applies the nearest .obfuscatorrc.json', async () => {
			await runFolder();
			assert.ok(read('obfuscated/custom/pretty.js').split('\n').length > 5, 'compact: false from the config file');
			assert.strictEqual(read('obfuscated/app.js').trim().split('\n').length, 1, 'other files stay compact');
		});

		it('gives each file its own identifiers prefix, so files can share a page', async () => {
			await runFolder();
			const app = read('obfuscated/app.js');
			const greet = read('obfuscated/src/greet.js');
			assert.ok(declaredFunctions(app).every((name) => name.startsWith(`${filePrefix('app.js')}_`)));
			assert.ok(declaredFunctions(greet).every((name) => name.startsWith(`${filePrefix('src/greet.ts')}_`)));
			assert.strictEqual(runScripts([app, greet], 'greeting + " / " + tsGreeting'), 'Hello from app / Hi TypeScript');
		});

		it('leaves the prefix out when jsObfuscator.output.uniquePrefixes is off', async () => {
			await settings().update('output.uniquePrefixes', false, vscode.ConfigurationTarget.Workspace);
			await runFolder();
			assert.ok(declaredFunctions(read('obfuscated/app.js')).every((name) => name.startsWith('_0x')));
		});

		it('does nothing when the confirmation is cancelled', async () => {
			stubWindow('showWarningMessage', () => undefined);
			await vscode.commands.executeCommand('jsObfuscator.obfuscateFolder');
			assert.ok(!exists('obfuscated'));
		});
	});

	describe('configuration commands', () => {
		afterEach(async () => {
			remove('.obfuscatorrc.json');
			await vscode.workspace.getConfiguration('jsObfuscator').update('preset', undefined, vscode.ConfigurationTarget.Workspace);
		});

		it('Select Obfuscation Preset stores the picked preset', async () => {
			stubWindow('showQuickPick', (items) => (items as { name: string }[]).find((item) => item.name === 'medium'));
			stubWindow('showInformationMessage', () => undefined);
			await vscode.commands.executeCommand('jsObfuscator.selectPreset');
			assert.strictEqual(vscode.workspace.getConfiguration('jsObfuscator').get('preset'), 'medium');
		});

		it('Create .obfuscatorrc.json writes a starter file with the current preset', async () => {
			await vscode.workspace.getConfiguration('jsObfuscator').update('preset', 'low', vscode.ConfigurationTarget.Workspace);
			await vscode.commands.executeCommand('jsObfuscator.createConfigFile');
			assert.deepStrictEqual(JSON.parse(read('.obfuscatorrc.json')), { preset: 'low', reservedNames: [], reservedStrings: [] });
		});
	});
});
