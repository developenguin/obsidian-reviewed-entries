// Bundles the Claude plugin's scripts into plain JavaScript, so they run on
// any Node 18+ without TypeScript support or dependencies. Maintainers only:
// users never build anything.
import esbuild from 'esbuild';

await esbuild.build({
	entryPoints: { tracker: 'claude-plugin/src/tracker.ts', 'import-matrix': 'claude-plugin/src/import-matrix.ts' },
	bundle: true,
	platform: 'node',
	format: 'esm',
	target: 'node18',
	outdir: 'claude-plugin/scripts',
	outExtension: { '.js': '.mjs' },
	banner: { js: '// Generated from claude-plugin/src by `yarn build:plugin`. Do not edit.' },
	logLevel: 'info',
});
