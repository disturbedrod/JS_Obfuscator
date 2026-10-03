import * as vscode from 'vscode';
import { getOutputSettings } from './config';
import { ObfuscationRun, outputFilesFor, writeOutputFiles } from './obfuscation';
import { getMirroredOutputPath, hasOutputSuffix, isInOutputFolder } from './obfuscator';
import { SOURCE_GLOB, SourceKind, sourceKindFromPath } from './pipeline';
import { displayName, errorMessage, readSource } from './util';

interface Job {
	source: vscode.Uri;
	kind: SourceKind;
	output: vscode.Uri;
	/** `<root>/<output folder>`, where root is the containing workspace folder, else the selected folder. */
	outputRoot: vscode.Uri;
}

/**
 * Obfuscates every JavaScript, TypeScript and HTML file under the given folders (Explorer context menu) or under every
 * workspace folder (Command Palette), mirroring the results into `<workspace folder>/<jsObfuscator.output.folder>/`.
 */
export async function obfuscateFolders(log: vscode.OutputChannel, uri?: vscode.Uri, uris?: vscode.Uri[]): Promise<void> {
	const scopes = uri ? (uris?.length ? uris : [uri]) : (vscode.workspace.workspaceFolders ?? []).map((f) => f.uri);
	if (scopes.length === 0) {
		vscode.window.showWarningMessage('JS Obfuscator Pro: open a folder or workspace first.');
		return;
	}

	let jobs: Job[];
	let skipped: string[];
	try {
		({ jobs, skipped } = await collectJobs(scopes));
	} catch (err) {
		vscode.window.showErrorMessage(`JS Obfuscator Pro: ${errorMessage(err)}`);
		return;
	}
	if (jobs.length === 0) {
		vscode.window.showInformationMessage('JS Obfuscator Pro: no JavaScript, TypeScript or HTML files found.');
		return;
	}

	const outputRoots = [...new Set(jobs.map((job) => `${displayName(job.outputRoot)}/`))];
	const confirm = 'Obfuscate';
	const choice = await vscode.window.showWarningMessage(
		`Obfuscate ${jobs.length} file${jobs.length === 1 ? '' : 's'} into ${outputRoots.join(', ')}?`,
		{
			modal: true,
			detail:
				'Original files are not modified. Existing files in the output folder are overwritten.' +
				(skipped.length ? ` ${skipped.length} TypeScript file(s) are skipped because a JavaScript file of the same name is written instead. The run's log in the JS Obfuscator Pro output panel lists them.` : ''),
		},
		confirm,
	);
	if (choice !== confirm) {
		return;
	}

	log.appendLine(`\n[${new Date().toLocaleString()}] Obfuscating ${jobs.length} file(s)`);
	for (const line of skipped) {
		log.appendLine(`  skip  ${line}`);
	}
	const failures: string[] = [];
	let done = 0;
	const run = new ObfuscationRun();

	const cancelled = await vscode.window.withProgress(
		{ location: vscode.ProgressLocation.Notification, title: 'Obfuscating', cancellable: true },
		async (progress, token) => {
			for (const job of jobs) {
				if (token.isCancellationRequested) {
					return true;
				}
				progress.report({ message: displayName(job.source), increment: 100 / jobs.length });
				// Obfuscation is synchronous; yield so the progress UI and Cancel button stay responsive.
				await new Promise((resolve) => setImmediate(resolve));

				try {
					const obfuscated = await run.obfuscate(job.source, await readSource(job.source), job.kind);
					await writeOutputFiles(outputFilesFor(obfuscated, job.output));
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
		? await vscode.window.showWarningMessage(`JS Obfuscator Pro: ${summary}`, showLog)
		: await vscode.window.showInformationMessage(`JS Obfuscator Pro: ${summary}`, reveal, showLog);
	if (action === showLog) {
		log.show();
	} else if (action === reveal) {
		await vscode.commands.executeCommand('revealInExplorer', jobs[0].outputRoot);
	}
}

/** Jobs keyed by output, so overlapping scopes don't repeat files. `skipped` lists TypeScript files whose output a JavaScript file already claims. */
async function collectJobs(scopes: vscode.Uri[]): Promise<{ jobs: Job[]; skipped: string[] }> {
	const jobs = new Map<string, Job>();
	const skipped = new Map<string, string>();
	for (const scope of scopes) {
		const root = vscode.workspace.getWorkspaceFolder(scope)?.uri ?? scope;
		const { suffix, folder, exclude } = getOutputSettings(root);
		const outputRoot = vscode.Uri.joinPath(root, folder);
		const files = await vscode.workspace.findFiles(new vscode.RelativePattern(scope, SOURCE_GLOB), combineGlobs(exclude));
		for (const source of files) {
			const kind = sourceKindFromPath(source.path);
			const outputPath = getMirroredOutputPath(root.path, source.path, folder);
			// Skip declaration files and our own output: the mirror folder, and `app.obfuscated.js` files from the single-file command.
			if (!kind || !outputPath || isInOutputFolder(root.path, source.path, folder) || hasOutputSuffix(source.path, suffix)) {
				continue;
			}
			const output = root.with({ path: outputPath });
			const job: Job = { source, kind, output, outputRoot };
			// `app.ts` and `app.js` side by side both mirror to `app.js`; the JavaScript file wins, as it's usually the build of the other.
			const existing = jobs.get(output.toString());
			if (existing && existing.source.toString() !== source.toString()) {
				const [keep, drop] = kind === 'typescript' ? [existing, job] : [job, existing];
				jobs.set(output.toString(), keep);
				skipped.set(drop.source.toString(), `${displayName(drop.source)}: ${displayName(keep.source)} is also written to ${displayName(output)}`);
				continue;
			}
			jobs.set(output.toString(), job);
		}
	}
	return {
		jobs: [...jobs.values()].sort((a, b) => a.source.path.localeCompare(b.source.path)),
		skipped: [...skipped.values()].sort(),
	};
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
