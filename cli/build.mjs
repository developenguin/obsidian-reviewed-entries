// Bundles the CLI into plain JavaScript for the Claude plugin, so it runs on
// any Node 18+ without TypeScript support or dependencies.
import esbuild from 'esbuild';

await esbuild.build({
	entryPoints: { tracker: 'cli/tracker.ts', import: 'cli/import.ts' },
	bundle: true,
	platform: 'node',
	format: 'esm',
	target: 'node18',
	outdir: 'claude-plugin/scripts',
	outExtension: { '.js': '.mjs' },
	banner: { js: '// Generated from cli/ by `yarn build:cli`. Do not edit.' },
	logLevel: 'info',
});
