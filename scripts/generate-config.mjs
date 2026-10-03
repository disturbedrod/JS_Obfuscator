// Generates the `contributes.configuration` section of package.json and schemas/obfuscatorrc.schema.json
// from javascript-obfuscator's option list, so both stay in sync with the installed library.
// Run with `npm run generate-config` after upgrading javascript-obfuscator or editing the tables below.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import JavaScriptObfuscator from 'javascript-obfuscator';

const DESCRIPTIONS = {
	advertisement: 'Print the JavaScript Obfuscator Pro advert to the console. Turned off by this extension.',
	compact: 'Write the output on a single line.',
	controlFlowFlattening: 'Restructure the code flow so it is harder to follow. Noticeably slows the code down.',
	controlFlowFlatteningThreshold: 'Fraction (0 to 1) of code affected by control-flow flattening.',
	deadCodeInjection: 'Insert blocks of code that never run. Greatly increases output size.',
	deadCodeInjectionThreshold: 'Fraction (0 to 1) of code affected by dead-code injection.',
	debugProtection: 'Make browser developer tools hard to use on the code.',
	debugProtectionInterval: 'Milliseconds between debug-protection checks; 0 disables the interval. Needs debugProtection.',
	disableConsoleOutput: 'Replace console.log, console.warn and the other console methods with empty functions.',
	domainLock: 'Only let the code run on these domains (a leading dot includes subdomains).',
	domainLockRedirectUrl: 'Where the browser is sent if the code runs on a domain not listed in domainLock.',
	forceTransformStrings: 'Strings (or regular expressions matching strings) that are always transformed, whatever stringArrayThreshold says.',
	identifierNamesCache: 'Name mapping shared between runs so separately obfuscated files agree on global names. null disables it.',
	identifierNamesGenerator: 'Style of new names: hexadecimal (_0xab12cd), mangled (a, b, c), mangled-shuffled, or dictionary (from identifiersDictionary).',
	identifiersPrefix: 'Prefix added to every renamed global identifier.',
	identifiersDictionary: 'Names used by the dictionary identifier names generator.',
	ignoreImports: 'Leave the module paths in require() and import() calls untransformed.',
	inputFileName: 'Name of the source file in source maps. Set by this extension to the original file\'s path.',
	log: 'Log obfuscation details to the console.',
	numbersToExpressions: 'Replace number literals with equivalent arithmetic expressions.',
	renameGlobals: 'Also rename global variables and functions. Breaks code in other files (or around a selection) that uses them by name.',
	renameProperties: 'Rename object property names. Can break code; test the output carefully.',
	renamePropertiesMode: 'safe skips properties that are risky to rename; unsafe renames everything it can.',
	reservedNames: 'Regular expressions; identifiers matching any of them are never renamed.',
	reservedStrings: 'Regular expressions; strings matching any of them are never transformed.',
	seed: 'Random seed. The same seed and input give the same output; 0 picks a random seed each run.',
	selfDefending: 'Make the code stop working if it is reformatted or beautified. Do not modify the output afterwards.',
	simplify: 'Simplify code while obfuscating, giving shorter expressions.',
	sourceMap: 'Generate a source map pointing back at the original file (the .ts file for TypeScript). Not for HTML pages or selections. Keep maps private: they undo the obfuscation.',
	sourceMapBaseUrl: 'URL prepended to the map file name in the sourceMappingURL comment when sourceMapMode is "separate". End it with a slash.',
	sourceMapFileName: 'Ignored by this extension, which names the map after the output file: app.obfuscated.js.map.',
	sourceMapMode: 'separate writes <output>.map next to the output file; inline embeds the map in the output.',
	sourceMapSourcesMode: 'Whether the source map embeds the original sources (sources-content) or only their names (sources).',
	splitStrings: 'Split string literals into chunks of splitStringsChunkLength characters.',
	splitStringsChunkLength: 'Chunk length used by splitStrings.',
	stringArray: 'Move string literals into a shared array and replace them with lookups.',
	stringArrayCallsTransform: 'Also obfuscate the calls that read from the string array.',
	stringArrayCallsTransformThreshold: 'Fraction (0 to 1) of string array calls transformed by stringArrayCallsTransform.',
	stringArrayEncoding: 'How strings in the string array are encoded: none, base64, or rc4 (slower). With several values, each string gets one at random.',
	stringArrayIndexShift: 'Add a random shift to string array indexes.',
	stringArrayIndexesType: 'Number format of the indexes into the string array.',
	stringArrayRotate: 'Rotate the string array by a random amount.',
	stringArrayShuffle: 'Shuffle the items in the string array.',
	stringArrayThreshold: 'Fraction (0 to 1) of string literals moved into the string array.',
	stringArrayWrappersChainedCalls: 'Let string array wrappers call each other.',
	stringArrayWrappersCount: 'Number of string array wrappers per scope.',
	stringArrayWrappersParametersMaxCount: 'Maximum number of parameters of function-type string array wrappers.',
	stringArrayWrappersType: 'Whether string array wrappers are variables or functions.',
	target: 'Where the code runs: browser, browser-no-eval (no eval-based helpers), node, or service-worker.',
	transformObjectKeys: 'Obfuscate the keys of object literals.',
	unicodeEscapeSequence: 'Write strings as unicode escape sequences. Greatly increases output size.',
};

const ENUMS = {
	identifierNamesGenerator: ['dictionary', 'hexadecimal', 'mangled', 'mangled-shuffled'],
	renamePropertiesMode: ['safe', 'unsafe'],
	sourceMapMode: ['inline', 'separate'],
	sourceMapSourcesMode: ['sources', 'sources-content'],
	stringArrayWrappersType: ['variable', 'function'],
	target: ['browser', 'browser-no-eval', 'node', 'service-worker'],
};
const ARRAY_ITEM_ENUMS = {
	stringArrayEncoding: ['none', 'base64', 'rc4'],
	stringArrayIndexesType: ['hexadecimal-number', 'hexadecimal-numeric-string'],
};
const MINIMUMS = { debugProtectionInterval: 0, splitStringsChunkLength: 1, stringArrayWrappersCount: 0, stringArrayWrappersParametersMaxCount: 2 };

/** Options exposed as `jsObfuscator.options.*` settings; everything else is available through .obfuscatorrc.json. */
const SETTINGS = [
	'target',
	'compact',
	'identifierNamesGenerator',
	'renameGlobals',
	'reservedNames',
	'reservedStrings',
	'stringArray',
	'stringArrayEncoding',
	'stringArrayThreshold',
	'splitStrings',
	'controlFlowFlattening',
	'controlFlowFlatteningThreshold',
	'deadCodeInjection',
	'deadCodeInjectionThreshold',
	'numbersToExpressions',
	'transformObjectKeys',
	'unicodeEscapeSequence',
	'selfDefending',
	'disableConsoleOutput',
	'debugProtection',
	'sourceMap',
	'sourceMapMode',
];

// Not API options: the CLI reads them, the API ignores them. Kept in sync with CLI_ONLY_OPTIONS in src/obfuscator.ts.
const CLI_ONLY = new Set(['config', 'exclude']);
// Our "default" preset (PRESETS.default in src/obfuscator.ts), shown as the settings' default values.
const DEFAULTS = { ...JavaScriptObfuscator.getOptionsByPreset('default'), advertisement: false, stringArrayEncoding: ['base64'], stringArrayThreshold: 1 };

function optionSchema(name, value) {
	const schema = { description: DESCRIPTIONS[name] };
	if (name === 'identifierNamesCache') {
		schema.type = ['object', 'null'];
	} else if (name === 'seed') {
		schema.type = ['number', 'string'];
	} else if (Array.isArray(value)) {
		schema.type = 'array';
		schema.items = ARRAY_ITEM_ENUMS[name] ? { type: 'string', enum: ARRAY_ITEM_ENUMS[name] } : { type: 'string' };
	} else {
		schema.type = typeof value;
	}
	if (ENUMS[name]) {
		schema.enum = ENUMS[name];
	}
	if (name.endsWith('Threshold')) {
		Object.assign(schema, { minimum: 0, maximum: 1 });
	} else if (name in MINIMUMS) {
		Object.assign(schema, { type: 'integer', minimum: MINIMUMS[name] });
	}
	return schema;
}

const optionNames = Object.keys(DEFAULTS).filter((name) => !CLI_ONLY.has(name) && name !== 'optionsPreset');
const missing = optionNames.filter((name) => !DESCRIPTIONS[name]);
if (missing.length) {
	throw new Error(`Add descriptions for new javascript-obfuscator options: ${missing.join(', ')}`);
}

// --- .obfuscatorrc.json schema
const schema = {
	$schema: 'http://json-schema.org/draft-07/schema#',
	title: 'JS Obfuscator Pro configuration (.obfuscatorrc.json)',
	description: 'javascript-obfuscator options for this folder and its subfolders. They override the jsObfuscator.* settings.',
	type: 'object',
	additionalProperties: false,
	properties: {
		$schema: { type: 'string' },
		preset: {
			description: 'Base preset; the options in this file are applied on top of it. Overrides the jsObfuscator.preset setting.',
			enum: ['default', 'low', 'medium', 'high'],
		},
		optionsPreset: {
			description: 'javascript-obfuscator preset name, accepted as an alternative to "preset".',
			enum: ['default', 'low-obfuscation', 'medium-obfuscation', 'high-obfuscation'],
		},
		...Object.fromEntries(optionNames.map((name) => [name, optionSchema(name, DEFAULTS[name])])),
	},
};
mkdirSync('schemas', { recursive: true });
writeFileSync('schemas/obfuscatorrc.schema.json', `${JSON.stringify(schema, null, '\t')}\n`);

// --- package.json settings
const general = {
	'jsObfuscator.preset': {
		type: 'string',
		enum: ['default', 'low', 'medium', 'high'],
		default: 'default',
		enumDescriptions: [
			'Renamed identifiers, all strings base64-encoded. Fast, small output.',
			'Adds self-defending code and disables console output.',
			'Adds control-flow flattening, dead code and split strings. Slower, larger output.',
			'Adds rc4 string encoding and debug protection. Much slower and larger. Browser code only: debug protection keeps a timer running, so Node.js processes never exit.',
		],
		markdownDescription:
			'Base obfuscation preset. The `#jsObfuscator.options.*#` settings you change, then `.obfuscatorrc.json`, are applied on top of it.',
		order: 0,
	},
	'jsObfuscator.output.suffix': {
		type: 'string',
		default: '.obfuscated',
		markdownDescription: 'Added before the extension by **Obfuscate File to New File**: `app.js` becomes `app.obfuscated.js`.',
		order: 1,
	},
	'jsObfuscator.output.folder': {
		type: 'string',
		default: 'obfuscated',
		markdownDescription:
			'Folder, relative to the workspace folder, that **Obfuscate All JavaScript in Folder** mirrors its output into.',
		order: 2,
	},
	'jsObfuscator.exclude': {
		type: 'array',
		items: { type: 'string' },
		default: ['**/node_modules/**', '**/.git/**'],
		markdownDescription:
			'Glob patterns skipped by **Obfuscate All JavaScript in Folder**, such as `**/*.html` to leave HTML pages out. With more than one entry, patterns cannot contain `{}` themselves; add separate entries instead.',
		order: 3,
	},
	'jsObfuscator.statusBar.enabled': {
		type: 'boolean',
		default: true,
		markdownDescription: 'Show the preset that applies to the active JavaScript, TypeScript or HTML file in the status bar.',
		order: 4,
	},
};
const options = Object.fromEntries(
	SETTINGS.map((name, index) => {
		const { description, ...rest } = optionSchema(name, DEFAULTS[name]);
		return [
			`jsObfuscator.options.${name}`,
			{ ...rest, default: DEFAULTS[name], markdownDescription: `${description}\n\nOnly overrides the preset when you set it.`, order: index },
		];
	}),
);

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
pkg.contributes.configuration = [
	{ id: 'jsObfuscator', title: 'JS Obfuscator Pro', properties: general },
	{ id: 'jsObfuscator.options', title: 'Obfuscation Options', properties: options },
];
pkg.contributes.jsonValidation = [{ fileMatch: '.obfuscatorrc.json', url: './schemas/obfuscatorrc.schema.json' }];
writeFileSync('package.json', `${JSON.stringify(pkg, null, 2)}\n`);

console.log(`Wrote ${optionNames.length} options to the schema and ${SETTINGS.length} to package.json settings.`);
