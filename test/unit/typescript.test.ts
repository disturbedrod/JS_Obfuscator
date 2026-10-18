import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { CompilerOptions } from 'typescript';
import { transpileTypeScript } from '../../src/typescript';

describe('typescript', () => {
	let dir: string;

	beforeEach(() => {
		dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jsobf-ts-'));
	});

	afterEach(() => {
		fs.rmSync(dir, { recursive: true, force: true });
	});

	it('strips types with ES module defaults when there is no tsconfig', () => {
		const { code, map } = transpileTypeScript({ source: 'export const n: number = 1;', fileName: 'a.ts', sourceMap: false });
		assert.match(code, /export const n = 1;/);
		assert.strictEqual(map, undefined);
	});

	it('uses CommonJS for .cts files without a tsconfig', () => {
		const { code } = transpileTypeScript({ source: 'export const n: number = 1;', fileName: 'a.cts', sourceMap: false });
		assert.match(code, /exports\.n = 1/);
	});

	it('uses the nearest tsconfig.json, reading each one once per cache', () => {
		fs.writeFileSync(path.join(dir, 'tsconfig.json'), '{ "compilerOptions": { "module": "commonjs", "target": "es5" } }');
		const nested = path.join(dir, 'src', 'deep');
		fs.mkdirSync(nested, { recursive: true });
		const cache = new Map<string, CompilerOptions>();

		const { code } = transpileTypeScript({ source: 'export const f = () => 1;', fileName: 'a.ts', configSearchDir: nested, sourceMap: false, cache });
		assert.match(code, /exports\.f = /);
		assert.match(code, /function \(\)/, 'target es5 turns arrows into functions');
		assert.strictEqual(cache.size, 1);
	});

	it('reports tsconfig errors', () => {
		fs.writeFileSync(path.join(dir, 'tsconfig.json'), '{ "compilerOptions": { "module": "nope" } }');
		assert.throws(() => transpileTypeScript({ source: 'let a = 1;', fileName: 'a.ts', configSearchDir: dir, sourceMap: false }), /tsconfig\.json/);
	});

	it('throws on syntax errors with the position', () => {
		assert.throws(
			() => transpileTypeScript({ source: 'let a = 1;\nlet b: = 2;', fileName: 'a.ts', sourceMap: false }),
			/TypeScript syntax error: line 2, column \d+/,
		);
	});

	it('returns a map without a sourceMappingURL comment when asked', () => {
		const { code, map } = transpileTypeScript({ source: 'const n: number = 1;', fileName: 'a.ts', sourceMap: true });
		assert.ok(map);
		assert.ok(!code.includes('sourceMappingURL'));
		assert.deepStrictEqual(map.sourcesContent, ['const n: number = 1;']);
	});
});
