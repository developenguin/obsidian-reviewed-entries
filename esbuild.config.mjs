// Builds main.js. With OBSIDIAN_VAULT set, also copies the plugin into
// $OBSIDIAN_VAULT/.obsidian/plugins/<id>/. Pass --watch to rebuild on change.
import { copyFile, mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import esbuild from 'esbuild';

const watch = process.argv.includes('--watch');
const { id } = JSON.parse(await readFile('manifest.json', 'utf8'));
const vault = process.env.OBSIDIAN_VAULT;

const install = {
	name: 'install',
	setup(build) {
		build.onEnd(async (result) => {
			if (!vault || result.errors.length) return;

			const target = join(vault, '.obsidian', 'plugins', id);
			await mkdir(target, { recursive: true });

			for (const file of ['main.js', 'manifest.json', 'styles.css']) {
				await copyFile(file, join(target, file));
			}

			console.log(`Installed in ${target}`);
		});
	},
};

const context = await esbuild.context({
	entryPoints: ['src/main.ts'],
	bundle: true,
	format: 'cjs',
	platform: 'browser',
	target: 'es2022',
	external: ['obsidian', 'electron', '@codemirror/*', '@lezer/*'],
	outfile: 'main.js',
	sourcemap: watch ? 'inline' : false,
	logLevel: 'info',
	plugins: [install],
});

if (watch) {
	await context.watch();
} else {
	await context.rebuild();
	await context.dispose();
}
