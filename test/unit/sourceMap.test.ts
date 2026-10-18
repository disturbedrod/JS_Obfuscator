import * as assert from 'assert';
import { SourceMap, chainSourceMaps, stripSourceMapComment, withSourceMap } from '../../src/sourceMap';

const map: SourceMap = {
	version: 3,
	sources: ['sourceMap'],
	sourcesContent: ['var a = 1;'],
	names: [],
	mappings: 'AAAA',
};

const separate = { mode: 'separate', baseUrl: '', includeSources: true } as const;

describe('sourceMap', () => {
	it('stripSourceMapComment removes only a trailing map comment', () => {
		assert.strictEqual(stripSourceMapComment('var a;\n//# sourceMappingURL=a.js.map\n'), 'var a;');
		assert.strictEqual(stripSourceMapComment('var a;'), 'var a;');
		assert.strictEqual(stripSourceMapComment('//# sourceMappingURL=x\nvar a;'), '//# sourceMappingURL=x\nvar a;');
	});

	describe('withSourceMap', () => {
		it('writes just the code without a map', () => {
			assert.deepStrictEqual(withSourceMap('code', undefined, '/ws/a.obfuscated.js', '/ws/a.js', separate), [
				{ path: '/ws/a.obfuscated.js', text: 'code' },
			]);
		});

		it('writes a separate .map whose sources point back at the original', () => {
			const [code, mapFile] = withSourceMap('code', map, '/ws/out/a.js', '/ws/src/a.ts', { ...separate, baseUrl: 'https://x/' });
			assert.strictEqual(code.path, '/ws/out/a.js');
			assert.strictEqual(code.text, 'code\n//# sourceMappingURL=https://x/a.js.map\n');
			assert.strictEqual(mapFile.path, '/ws/out/a.js.map');
			const written = JSON.parse(mapFile.text) as SourceMap;
			assert.deepStrictEqual(written.sources, ['../src/a.ts']);
			assert.strictEqual(written.file, 'a.js');
			assert.deepStrictEqual(written.sourcesContent, ['var a = 1;']);
		});

		it('embeds the map inline', () => {
			const files = withSourceMap('code', map, '/ws/a.obfuscated.js', '/ws/a.js', { ...separate, mode: 'inline' });
			assert.strictEqual(files.length, 1);
			const data = /base64,(.+)\n$/.exec(files[0].text)?.[1];
			assert.ok(data);
			assert.deepStrictEqual((JSON.parse(Buffer.from(data, 'base64').toString('utf8')) as SourceMap).sources, ['a.js']);
		});

		it('drops sourcesContent when sources are not included, and names untitled sources', () => {
			const [, mapFile] = withSourceMap('code', map, '/a.js', undefined, { ...separate, includeSources: false });
			const written = JSON.parse(mapFile.text) as SourceMap;
			assert.deepStrictEqual(written.sources, ['untitled']);
			assert.strictEqual(written.sourcesContent, undefined);
		});
	});

	it('chainSourceMaps maps through both maps', () => {
		// outer: output line 0 col 0 -> intermediate line 1 col 0; inner: intermediate line 1 -> original line 2.
		const outer: SourceMap = { version: 3, sources: ['mid.js'], names: [], mappings: 'AACA' };
		const inner: SourceMap = { version: 3, sources: ['orig.ts'], names: [], mappings: ';AAEA' };
		const chained = chainSourceMaps(outer, inner);
		assert.deepStrictEqual(chained.sources, ['orig.ts']);
		assert.strictEqual(chained.mappings, 'AAEA');
	});
});
