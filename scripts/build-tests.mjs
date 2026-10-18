// Bundles each test file under test/ into out/test/, keeping npm packages (and `vscode`) external so they load from
// node_modules at run time. Source files under src/ are bundled in, so tests see the same module format as the extension.
// Run with `npm run build-tests`; the test scripts do it for you.

import { readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { build } from 'esbuild';

function testFiles(dir) {
	return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
		const file = join(dir, entry.name);
		if (entry.isDirectory()) {
			return entry.name === 'fixtures' ? [] : testFiles(file);
		}
		return entry.name.endsWith('.ts') ? [file] : [];
	});
}

rmSync('out/test', { recursive: true, force: true });
await build({
	entryPoints: testFiles('test'),
	outbase: 'test',
	outdir: 'out/test',
	bundle: true,
	packages: 'external',
	external: ['vscode'],
	format: 'cjs',
	platform: 'node',
	target: 'node20',
	sourcemap: true,
	logLevel: 'warning',
});
