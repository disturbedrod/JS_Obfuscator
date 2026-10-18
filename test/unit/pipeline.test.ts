import * as assert from 'assert';
import { buildOptions, filePrefix } from '../../src/obfuscator';
import { isDeclarationFile, obfuscateSource, outputFiles, sourceKindFromLanguage, sourceKindFromPath } from '../../src/pipeline';
import type { SourceMap } from '../../src/sourceMap';
import { declaredFunctions, inlineScripts, runScripts } from '../helpers';

const options = buildOptions('default', { seed: 1 });

describe('pipeline', () => {
	describe('source kinds', () => {
		it('maps extensions to kinds and skips declaration files', () => {
			assert.strictEqual(sourceKindFromPath('/a/b.MJS'), 'javascript');
			assert.strictEqual(sourceKindFromPath('/a/b.cts'), 'typescript');
			assert.strictEqual(sourceKindFromPath('/a/b.htm'), 'html');
			assert.strictEqual(sourceKindFromPath('/a/b.d.ts'), undefined);
			assert.strictEqual(sourceKindFromPath('/a/b.css'), undefined);
			assert.ok(isDeclarationFile('x.d.mts'));
		});

		it('maps editor languages to kinds', () => {
			assert.strictEqual(sourceKindFromLanguage('javascript', '/a.js'), 'javascript');
			assert.strictEqual(sourceKindFromLanguage('typescript', '/a.ts'), 'typescript');
			assert.strictEqual(sourceKindFromLanguage('typescript', '/a.d.ts'), undefined);
			assert.strictEqual(sourceKindFromLanguage('json', '/a.json'), undefined);
		});
	});

	describe('obfuscateSource', () => {
		it('obfuscates JavaScript', () => {
			const { code, map } = obfuscateSource({ text: 'var out = "hello" + " world";', kind: 'javascript', fileName: 'a.js' }, options);
			assert.ok(!code.includes('hello'));
			assert.strictEqual(map, undefined);
			assert.strictEqual(runScripts([code], 'out'), 'hello world');
		});

		it('transpiles TypeScript first', () => {
			const text = 'enum Color { Red = "red" }\nconst pick = (c: Color): string => c.toUpperCase();\nvar out = pick(Color.Red);';
			const { code } = obfuscateSource({ text, kind: 'typescript', fileName: 'a.ts' }, options);
			assert.strictEqual(runScripts([code], 'out'), 'RED');
		});

		it('obfuscates every inline script of a page and gives each its own prefix', () => {
			const html = '<p>keep</p><script>var a = "one";</script><script>var b = "two";</script><script type="text/x-tpl">"raw"</script>';
			const { code, map } = obfuscateSource({ text: html, kind: 'html', fileName: 'page.html' }, { ...options, sourceMap: true });
			assert.strictEqual(map, undefined, 'HTML pages get no source map');
			assert.ok(code.startsWith('<p>keep</p><script>'));
			assert.ok(code.endsWith('<script type="text/x-tpl">"raw"</script>'));

			const scripts = inlineScripts(code).slice(0, 2);
			assert.strictEqual(runScripts(scripts, 'a + b'), 'onetwo');
			const helpers = scripts.flatMap(declaredFunctions);
			assert.ok(helpers.some((name) => name.startsWith('s1_')));
			assert.ok(helpers.some((name) => name.startsWith('s2_')));
		});

		it('keeps separately obfuscated files apart when each has its own file prefix', () => {
			const files = { 'a.js': 'var a = ["x", "y"].join("");', 'src/b.js': 'var b = ["z", "w"].join("");' };
			const outputs = Object.entries(files).map(([name, text]) =>
				obfuscateSource({ text, kind: 'javascript', fileName: name }, { ...options, identifiersPrefix: filePrefix(name) }).code,
			);
			const helpers = outputs.flatMap(declaredFunctions);
			assert.strictEqual(new Set(helpers).size, helpers.length, 'helper names should not repeat');
			assert.strictEqual(runScripts(outputs, 'a + b'), 'xyzw');
		});

		it('chains TypeScript source maps back to the .ts file', () => {
			const text = 'const greet = (name: string): string => `hi ${name}`;\nconsole.log(greet("x"));\n';
			const sourceMapOptions = { ...options, sourceMap: true };
			const result = obfuscateSource({ text, kind: 'typescript', fileName: '/ws/src/a.ts' }, sourceMapOptions);
			assert.ok(result.map);

			const [code, mapFile] = outputFiles(result, '/ws/src/a.obfuscated.js', '/ws/src/a.ts', sourceMapOptions);
			assert.match(code.text, /\/\/# sourceMappingURL=a\.obfuscated\.js\.map\n$/);
			const map = JSON.parse(mapFile.text) as SourceMap;
			assert.deepStrictEqual(map.sources, ['a.ts']);
			assert.deepStrictEqual(map.sourcesContent, [text]);
		});

		it('throws on invalid code', () => {
			assert.throws(() => obfuscateSource({ text: 'var = ;', kind: 'javascript', fileName: 'a.js' }, options));
		});
	});
});
