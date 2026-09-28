import { html as htmlSpec, parse, type DefaultTreeAdapterMap } from 'parse5';

// Kept free of `vscode` imports so it can be unit tested outside the extension host.

type Node = DefaultTreeAdapterMap['node'];
type Element = DefaultTreeAdapterMap['element'];

export interface InlineScript {
	/** Offsets of the script's contents (between `<script ...>` and `</script>`) in the HTML. */
	start: number;
	end: number;
	/** 1-based line of the contents, for error messages. */
	line: number;
	code: string;
}

/** `type` values the HTML spec runs as JavaScript (plus `module`); anything else, such as JSON or templates, is left alone. */
const JAVASCRIPT_TYPES = new Set([
	'',
	'module',
	'text/javascript',
	'application/javascript',
	'application/ecmascript',
	'application/x-ecmascript',
	'application/x-javascript',
	'text/ecmascript',
	'text/javascript1.0',
	'text/javascript1.1',
	'text/javascript1.2',
	'text/javascript1.3',
	'text/javascript1.4',
	'text/javascript1.5',
	'text/jscript',
	'text/livescript',
	'text/x-ecmascript',
	'text/x-javascript',
]);

/** Inline JavaScript `<script>` elements with code in them, in document order. Scripts with `src` are skipped. */
export function findInlineScripts(html: string): InlineScript[] {
	const scripts: InlineScript[] = [];
	const visit = (node: Node): void => {
		if ('tagName' in node) {
			if (isInlineJavaScript(node)) {
				const location = node.childNodes[0]?.sourceCodeLocation;
				if (location) {
					const code = html.slice(location.startOffset, location.endOffset);
					if (code.trim()) {
						scripts.push({ start: location.startOffset, end: location.endOffset, line: location.startLine, code });
					}
				}
			}
			// A <template>'s children live in a separate fragment.
			if (node.tagName === 'template' && 'content' in node) {
				visit(node.content as Node);
			}
		}
		if ('childNodes' in node) {
			node.childNodes.forEach(visit);
		}
	};
	visit(parse(html, { sourceCodeLocationInfo: true }));
	return scripts;
}

/**
 * Replaces the code of every inline JavaScript `<script>` with `transform(code)`, leaving the rest of the page
 * byte-for-byte unchanged. Whitespace around the code is kept so the markup stays indented.
 */
export function replaceInlineScripts(html: string, transform: (code: string, index: number, count: number) => string): string {
	const scripts = findInlineScripts(html);
	let result = '';
	let last = 0;
	scripts.forEach((script, index) => {
		let code: string;
		try {
			code = transform(script.code, index, scripts.length);
		} catch (err) {
			throw new Error(`inline <script> ${index + 1} of ${scripts.length} (line ${script.line}): ${err instanceof Error ? err.message : String(err)}`);
		}
		const leading = /^\s*/.exec(script.code)![0];
		const trailing = /\s*$/.exec(script.code)![0];
		result += html.slice(last, script.start) + leading + escapeScriptEnd(code) + trailing;
		last = script.end;
	});
	return result + html.slice(last);
}

function isInlineJavaScript(element: Element): boolean {
	if (element.tagName !== 'script' || element.namespaceURI !== htmlSpec.NS.HTML) {
		return false;
	}
	const attr = (name: string) => element.attrs.find((a) => a.name === name)?.value;
	return attr('src') === undefined && JAVASCRIPT_TYPES.has((attr('type') ?? '').trim().toLowerCase());
}

/**
 * `</script` anywhere in the code would end the element early. In obfuscated code it can only be inside a string,
 * template or regular expression, where `<\/script` means the same thing.
 */
function escapeScriptEnd(code: string): string {
	return code.replace(/<\/(script)/gi, '<\\/$1');
}
