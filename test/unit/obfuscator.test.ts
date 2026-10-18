import * as assert from 'assert';
import {
	KNOWN_OPTIONS,
	PRESET_NAMES,
	buildOptions,
	filePrefix,
	getMirroredOutputPath,
	getOutputExtension,
	getOutputPath,
	hasOutputSuffix,
	isInOutputFolder,
	isPresetName,
	obfuscateCode,
	toPresetName,
} from '../../src/obfuscator';
import { runScripts } from '../helpers';

describe('obfuscator', () => {
	describe('buildOptions', () => {
		it('starts from the preset with the advertisement turned off', () => {
			const options = buildOptions('default');
			assert.strictEqual(options.optionsPreset, 'default');
			assert.strictEqual(options.advertisement, false);
			assert.deepStrictEqual(options.stringArrayEncoding, ['base64']);
			assert.strictEqual(options.stringArrayThreshold, 1);
		});

		it('applies override layers in order, later ones winning', () => {
			const options = buildOptions('low', { compact: false, seed: 1 }, { compact: true });
			assert.strictEqual(options.optionsPreset, 'low-obfuscation');
			assert.strictEqual(options.compact, true);
			assert.strictEqual(options.seed, 1);
		});

		it('ignores optionsPreset in overrides; the preset picks it', () => {
			assert.strictEqual(buildOptions('high', { optionsPreset: 'low-obfuscation' }).optionsPreset, 'high-obfuscation');
		});
	});

	describe('preset names', () => {
		it('accepts our names and the library names', () => {
			assert.ok(PRESET_NAMES.every(isPresetName));
			assert.strictEqual(isPresetName('medium-obfuscation'), false);
			assert.strictEqual(toPresetName('medium-obfuscation'), 'medium');
			assert.strictEqual(toPresetName('high'), 'high');
			assert.strictEqual(toPresetName('extreme'), undefined);
			assert.strictEqual(toPresetName(3), undefined);
		});
	});

	it('KNOWN_OPTIONS lists API options but not CLI-only ones', () => {
		assert.ok(KNOWN_OPTIONS.has('stringArray'));
		assert.ok(KNOWN_OPTIONS.has('identifiersPrefix'));
		assert.ok(!KNOWN_OPTIONS.has('config'));
		assert.ok(!KNOWN_OPTIONS.has('exclude'));
	});

	describe('output paths', () => {
		it('turns TypeScript extensions into JavaScript ones and keeps the rest', () => {
			assert.strictEqual(getOutputExtension('.ts'), '.js');
			assert.strictEqual(getOutputExtension('.MTS'), '.mjs');
			assert.strictEqual(getOutputExtension('.cts'), '.cjs');
			assert.strictEqual(getOutputExtension('.html'), '.html');
			assert.strictEqual(getOutputExtension(''), '.js');
		});

		it('adds the suffix before the extension', () => {
			assert.strictEqual(getOutputPath('/ws/src/app.js'), '/ws/src/app.obfuscated.js');
			assert.strictEqual(getOutputPath('/ws/app.mts', '.min'), '/ws/app.min.mjs');
			assert.strictEqual(getOutputPath('/ws/index.html'), '/ws/index.obfuscated.html');
		});

		it('mirrors files under the output folder, and refuses files outside the root', () => {
			assert.strictEqual(getMirroredOutputPath('/ws', '/ws/src/app.ts'), '/ws/obfuscated/src/app.js');
			assert.strictEqual(getMirroredOutputPath('/ws', '/ws/a.js', 'dist/obf'), '/ws/dist/obf/a.js');
			assert.strictEqual(getMirroredOutputPath('/ws', '/other/a.js'), undefined);
			assert.strictEqual(getMirroredOutputPath('/ws', '/ws'), undefined);
		});

		it('recognises its own output', () => {
			assert.ok(isInOutputFolder('/ws', '/ws/obfuscated/a.js'));
			assert.ok(!isInOutputFolder('/ws', '/ws/obfuscated-not/a.js'));
			assert.ok(hasOutputSuffix('/ws/app.obfuscated.js'));
			assert.ok(hasOutputSuffix('/ws/index.obfuscated.HTML'));
			assert.ok(!hasOutputSuffix('/ws/app.obfuscated.ts'));
			assert.ok(!hasOutputSuffix('/ws/app.js'));
		});
	});

	describe('filePrefix', () => {
		it('is stable, a valid identifier start, and differs between paths', () => {
			assert.strictEqual(filePrefix('src/app.js'), filePrefix('src/app.js'));
			assert.notStrictEqual(filePrefix('src/app.js'), filePrefix('src/app2.js'));
			for (const name of ['a.js', 'src/b.js', 'deep/nested/path/c.ts', '']) {
				assert.match(filePrefix(name), /^f[0-9a-z]+$/);
			}
		});

		it('has no collisions across a few thousand paths', () => {
			const prefixes = new Set(Array.from({ length: 5000 }, (_, i) => filePrefix(`src/module${i}/index.js`)));
			assert.strictEqual(prefixes.size, 5000);
		});
	});

	describe('obfuscateCode', () => {
		const source = `
			var hits = 0;
			function touch() { hits++; return true; }
			var a = false && touch();
			var b = true || touch();
			var c = null ?? 'fallback';
			var words = ['alpha', 'beta'].map(function (w) { return w.toUpperCase(); }).join('-');
			var result = [a, b, c, words, hits].join('|');
		`;

		for (const preset of PRESET_NAMES) {
			it(`keeps behaviour with the ${preset} preset`, () => {
				// Debug protection keeps a timer running, which would keep the test process alive.
				const code = obfuscateCode(source, buildOptions(preset, { debugProtection: false, debugProtectionInterval: 0, seed: 1 }));
				assert.ok(!code.includes("'alpha'"), 'strings should be encoded');
				assert.strictEqual(runScripts([code], 'result'), 'false|true|fallback|ALPHA-BETA|0');
			});
		}

		it('throws on syntax errors', () => {
			assert.throws(() => obfuscateCode('function (', buildOptions('default')));
		});
	});
});
