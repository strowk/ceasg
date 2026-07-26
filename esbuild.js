const esbuild = require("esbuild");

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

/**
 * @type {import('esbuild').Plugin}
 */
const esbuildProblemMatcherPlugin = {
	name: 'esbuild-problem-matcher',

	setup(build) {
		build.onStart(() => {
			console.log('[watch] build started');
		});
		build.onEnd((result) => {
			result.errors.forEach(({ text, location }) => {
				console.error(`✘ [ERROR] ${text}`);
				console.error(`    ${location.file}:${location.line}:${location.column}:`);
			});
			console.log('[watch] build finished');
		});
	},
};

async function main() {
	const fs = require('fs');

	const shared = { bundle: true, minify: production, sourcemap: !production, sourcesContent: false, logLevel: 'silent', plugins: [esbuildProblemMatcherPlugin] };

	const extensionCtx = await esbuild.context({
		...shared, entryPoints: ['src/extension.ts'], format: 'cjs',
		platform: 'node', outfile: 'dist/extension.js', external: ['vscode'],
	});
	const webviewCtx = await esbuild.context({
		...shared, entryPoints: ['src/webview/main.ts'], format: 'iife',
		platform: 'browser', outfile: 'dist/webview.js',
	});

	fs.mkdirSync('dist', { recursive: true });
	if (fs.existsSync('media/webview.css')) { fs.copyFileSync('media/webview.css', 'dist/webview.css'); }

	if (watch) {
		await Promise.all([extensionCtx.watch(), webviewCtx.watch()]);
	} else {
		await Promise.all([extensionCtx.rebuild(), webviewCtx.rebuild()]);
		await Promise.all([extensionCtx.dispose(), webviewCtx.dispose()]);
	}
}

main().catch(e => {
	console.error(e);
	process.exit(1);
});
