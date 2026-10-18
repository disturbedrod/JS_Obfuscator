import * as vm from 'vm';

/**
 * Runs scripts in one fresh global scope, as classic scripts on a page share one, and returns the value of `expression`.
 * The context gets its own `console` so `disableConsoleOutput` can't silence the test runner's.
 */
export function runScripts(scripts: string[], expression: string): unknown {
	const context = vm.createContext({ console: { ...console } });
	for (const script of scripts) {
		vm.runInContext(script, context, { timeout: 5000 });
	}
	return vm.runInContext(expression, context);
}

/** Code of each inline `<script>` in an HTML page. Good enough for the pages the tests build. */
export function inlineScripts(html: string): string[] {
	return [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map((match) => match[1]);
}

/** Names of the top-level `function` declarations in obfuscated code, which is where the obfuscator puts its helpers. */
export function declaredFunctions(code: string): string[] {
	return [...code.matchAll(/function (\w+)\(/g)].map((match) => match[1]);
}
