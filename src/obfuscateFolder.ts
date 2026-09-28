import * as vscode from 'vscode';
import { OptionsResolver, getOutputSettings } from './config';
import { getMirroredOutputPath, hasOutputSuffix, isInOutputFolder, obfuscateCode } from './obfuscator';
import { displayName, errorMessage, readSource } from './util';

const JS_GLOB = '**/*.{js,mjs,cjs}';

interface Job {
	source: vscode.Uri;
	output: vscode.Uri;
	/** `<root>/<output folder>`, where root is the containing workspace folder, else the selected folder. */
	outputRoot: vscode.Uri;
}

/**
 * Obfuscates every JavaScript file under the given folders (Explorer context menu) or under every
 * workspace folder (Command Palette), mirroring the results into `<workspace folder>/<jsObfuscator.output.folder>/`.
 */
export async function obfuscateFolders(log: vscode.OutputChannel, uri?: vscode.Uri, uris?: vscode.Uri[]): Promise<void> {
	const scopes = uri ? (uris?.length ? uris : [uri]) : (vscode.workspace.workspaceFolders ?? []).map((f) => f.uri);
	if (scopes.length === 0) {
		vscode.window.showWarningMessage('JS Obfuscator: open a folder or workspace first.');
		return;
	}

	let jobs: Job[];
	try {
		jobs = await collectJobs(scopes);
	} catch (err) {
		vscode.window.showErrorMessage(`JS Obfuscator: ${errorMessage(err)}`);
		return;
	}
	if (jobs.length === 0) {
		vscode.window.showInformationMessage('JS Obfuscator: no JavaScript files found.');
		return;
	}

	const outputRoots = [...new Set(jobs.map((job) => `${displayName(job.outputRoot)}/`))];
	const confirm = 'Obfuscate';
	const choice = await vscode.window.showWarningMessage(
		`Obfuscate ${jobs.length} JavaScript file${jobs.length === 1 ? '' : 's'} into ${outputRoots.join(', ')}?`,
		{ modal: true, detail: 'Original files are not modified. Existing files in the output folder are overwritten.' },
		confirm,
	);
	if (choice !== confirm) {
		return;
	}

	log.appendLine(`\n[${new Date().toLocaleString()}] Obfuscating ${jobs.length} file(s)`);
	const failures: string[] = [];
	let done = 0;
	const resolver = new OptionsResolver();

	const cancelled = await vscode.window.withProgress(
		{ location: vscode.ProgressLocation.Notification, title: 'Obfuscating JavaScript', cancellable: true },
		async (progress, token) => {
			for (const job of jobs) {
				if (token.isCancellationRequested) {
					return true;
				}
				progress.report({ message: displayName(job.source), increment: 100 / jobs.length });
				// Obfuscation is synchronous; yield so the progress UI and Cancel button stay responsive.
				await new Promise((resolve) => setImmediate(resolve));

				try {
					const options = await resolver.resolve(job.source);
					const obfuscated = obfuscateCode(await readSource(job.source), options);
					await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(job.output, '..'));
					await vscode.workspace.fs.writeFile(job.output, Buffer.from(obfuscated, 'utf8'));
					log.appendLine(`  ok    ${displayName(job.source)} -> ${displayName(job.output)}`);
					done++;
				} catch (err) {
					log.appendLine(`  FAIL  ${displayName(job.source)}: ${errorMessage(err)}`);
					failures.push(displayName(job.source));
				}
			}
			return false;
		},
	);

	const summary = `Obfuscated ${done} of ${jobs.length} file(s)${failures.length ? `, ${failures.length} failed` : ''}${cancelled ? ' (cancelled)' : ''}.`;
	log.appendLine(`  ${summary}`);

	const showLog = 'Show Log';
	const reveal = 'Reveal in Explorer';
	const action = failures.length || cancelled
		? await vscode.window.showWarningMessage(`JS Obfuscator: ${summary}`, showLog)
		: await vscode.window.showInformationMessage(`JS Obfuscator: ${summary}`, reveal, showLog);
	if (action === showLog) {
		log.show();
	} else if (action === reveal) {
		await vscode.commands.executeCommand('revealInExplorer', jobs[0].outputRoot);
	}
}

async function collectJobs(scopes: vscode.Uri[]): Promise<Job[]> {
	const jobs = new Map<string, Job>();
	for (const scope of scopes) {
		const root = vscode.workspace.getWorkspaceFolder(scope)?.uri ?? scope;
		const { suffix, folder, exclude } = getOutputSettings(root);
		const outputRoot = vscode.Uri.joinPath(root, folder);
		const files = await vscode.workspace.findFiles(new vscode.RelativePattern(scope, JS_GLOB), combineGlobs(exclude));
		for (const source of files) {
			const outputPath = getMirroredOutputPath(root.path, source.path, folder);
			// Skip our own output: the mirror folder, and `app.obfuscated.js` files from the single-file command.
			if (!outputPath || isInOutputFolder(root.path, source.path, folder) || hasOutputSuffix(source.path, suffix)) {
				continue;
			}
			jobs.set(source.toString(), { source, output: root.with({ path: outputPath }), outputRoot });
		}
	}
	return [...jobs.values()].sort((a, b) => a.source.path.localeCompare(b.source.path));
}

/**
 * findFiles takes a single exclude glob, so several are joined as `{a,b}`. An empty list gives null, meaning no excludes.
 * VS Code globs don't nest braces, so only a lone pattern may use `{}` itself.
 */
function combineGlobs(globs: string[]): string | null {
	if (globs.length === 0) {
		return null;
	}
	return globs.length === 1 ? globs[0] : `{${globs.join(',')}}`;
}
