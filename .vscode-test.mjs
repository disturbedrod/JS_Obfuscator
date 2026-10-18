// Configuration for `vscode-test` (npm run test:integration). The fixture workspace is copied to a temporary folder
// first, since the tests write obfuscated files and settings into it.

import { cpSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defineConfig } from '@vscode/test-cli';

const workspace = join(mkdtempSync(join(tmpdir(), 'js-obfuscator-pro-')), 'workspace');
cpSync('test/fixtures/workspace', workspace, { recursive: true });
// node_modules can't be committed as a fixture (it's gitignored), so the excluded dependency is made here.
mkdirSync(join(workspace, 'node_modules', 'dep'), { recursive: true });
writeFileSync(join(workspace, 'node_modules', 'dep', 'index.js'), "var dependency = 'excluded';\n");

export default defineConfig({
	files: 'out/test/integration/**/*.test.js',
	workspaceFolder: workspace,
	// Pin with VSCODE_TEST_VERSION (for example 1.95.0) to test the oldest supported VS Code.
	version: process.env.VSCODE_TEST_VERSION || 'stable',
	launchArgs: ['--disable-extensions', '--disable-workspace-trust'],
	mocha: { ui: 'bdd', timeout: 60_000 },
});
