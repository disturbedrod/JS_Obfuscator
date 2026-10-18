// ESLint flat config: recommended JavaScript and TypeScript rules, plus type-aware checks for unhandled promises,
// which matter in an extension because a rejected command promise fails silently.

import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
	{ ignores: ['out/**', 'node_modules/**', '.vscode-test/**', 'test/fixtures/**', '*.vsix'] },
	js.configs.recommended,
	...tseslint.configs.recommended,
	{
		files: ['**/*.ts'],
		languageOptions: {
			parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
		},
		rules: {
			'@typescript-eslint/no-floating-promises': 'error',
			'@typescript-eslint/no-misused-promises': ['error', { checksVoidReturn: false }],
			'@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true }],
			curly: ['error', 'all'],
			eqeqeq: ['error', 'always'],
		},
	},
	{
		files: ['**/*.mjs'],
		languageOptions: { globals: globals.node },
	},
);
