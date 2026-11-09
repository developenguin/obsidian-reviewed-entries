// Builds main.js. With OBSIDIAN_VAULT set (in the environment or .env), also
// copies the plugin into <vault>/.obsidian/plugins/<id>/ for each vault.
// Pass --watch to rebuild on change.
import { existsSync } from 'node:fs';
import { copyFile, mkdir, readFile } from 'node:fs/promises';
import { delimiter, join } from 'node:path';
import esbuild from 'esbuild';

// Variables already in the environment win over .env.
if (existsSync('.env')) {
	process.loadEnvFile('.env');
}

const watch = process.argv.includes('--watch');
const { id } = JSON.parse(await readFile('manifest.json', 'utf8'));
const vaults = (process.env.OBSIDIAN_VAULT ?? '').split(delimiter).filter(Boolean);

const install = {
	name: 'install',
	setup(build) {
		build.onEnd(async (result) => {
			if (result.errors.length) return;

			for (const vault of vaults) {
				const target = join(vault, '.obsidian', 'plugins', id);
				await mkdir(target, { recursive: true });

				for (const file of ['main.js', 'manifest.json', 'styles.css']) {
					await copyFile(file, join(target, file));
				}

				console.log(`Installed in ${target}`);
			}
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
