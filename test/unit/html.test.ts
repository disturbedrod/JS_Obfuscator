import * as assert from 'assert';
import { findInlineScripts, replaceInlineScripts } from '../../src/html';

describe('html', () => {
	describe('findInlineScripts', () => {
		it('finds inline JavaScript with its offsets and line', () => {
			const html = '<html>\n<head>\n<script>var a = 1;</script>\n</head></html>';
			const [script] = findInlineScripts(html);
			assert.strictEqual(script.code, 'var a = 1;');
			assert.strictEqual(html.slice(script.start, script.end), 'var a = 1;');
			assert.strictEqual(script.line, 3);
		});

		it('skips external, empty and non-JavaScript scripts', () => {
			const html = [
				'<script src="x.js"></script>',
				'<script>   </script>',
				'<script type="application/json">{"a":1}</script>',
				'<script type="text/template"><b>hi</b></script>',
				'<script type="module">export const m = 1;</script>',
				'<script type=" Text/JavaScript ">var t = 1;</script>',
			].join('\n');
			assert.deepStrictEqual(
				findInlineScripts(html).map((s) => s.code),
				['export const m = 1;', 'var t = 1;'],
			);
		});

		it('looks inside <template> elements', () => {
			const html = '<template><div><script>var inTemplate = 1;</script></div></template>';
			assert.deepStrictEqual(findInlineScripts(html).map((s) => s.code), ['var inTemplate = 1;']);
		});

		it('ignores scripts in SVG', () => {
			assert.deepStrictEqual(findInlineScripts('<svg><script>var s = 1;</script></svg>'), []);
		});
	});

	describe('replaceInlineScripts', () => {
		it('replaces only the code and keeps everything else byte for byte', () => {
			const html = '<!doctype html>\n<p class="x">Hi</p>\n<script>\n    var a = 1;\n  </script>\n<script src="y.js"></script>\n';
			const result = replaceInlineScripts(html, () => 'REPLACED');
			assert.strictEqual(result, '<!doctype html>\n<p class="x">Hi</p>\n<script>\n    REPLACED\n  </script>\n<script src="y.js"></script>\n');
		});

		it('passes each script its index and the script count', () => {
			const calls: string[] = [];
			replaceInlineScripts('<script>a()</script><script>b()</script>', (code, index, count) => {
				calls.push(`${code}:${index}/${count}`);
				return code;
			});
			assert.deepStrictEqual(calls, ['a():0/2', 'b():1/2']);
		});

		it('escapes </script inside the new code', () => {
			const result = replaceInlineScripts('<script>x</script>', () => 'var s = "</script>";');
			assert.strictEqual(result, '<script>var s = "<\\/script>";</script>');
		});

		it('says which script failed', () => {
			assert.throws(
				() =>
					replaceInlineScripts('<script>ok()</script>\n\n<script>bad(</script>', (code) => {
						if (code.startsWith('bad')) {
							throw new Error('Unexpected token');
						}
						return code;
					}),
				/inline <script> 2 of 2 \(line 3\): Unexpected token/,
			);
		});
	});
});
