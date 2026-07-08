import { paraglideVitePlugin } from '@inlang/paraglide-js';
import tailwindcss from '@tailwindcss/vite';
import adapter from '@sveltejs/adapter-node';
import { sveltekit } from '@sveltejs/kit/vite';
import { SvelteKitPWA } from '@vite-pwa/sveltekit';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	plugins: [
		tailwindcss(),
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			adapter: adapter(),
			typescript: {
				config: (config) => {
					config.include.push('../drizzle.config.ts');
				}
			}
		}),
		paraglideVitePlugin({ project: './project.inlang', outdir: './src/lib/paraglide' }),
		SvelteKitPWA({
			injectRegister: false,
			manifest: {
				name: 'Watched',
				short_name: 'Watched',
				description: 'Track watched TV episodes and movies',
				start_url: '/',
				display: 'standalone',
				background_color: '#0b0b0f',
				theme_color: '#0b0b0f',
				icons: [
					{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' },
					{ src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
					{ src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
					{
						src: '/icon-512-maskable.png',
						sizes: '512x512',
						type: 'image/png',
						purpose: 'maskable'
					}
				]
			},
			workbox: {
				skipWaiting: true,
				clientsClaim: true,
				// Must be explicitly null, not just omitted: @vite-pwa/sveltekit injects its
				// own navigateFallback default (to the site root) whenever the key is absent
				// from this object at all, which assumes an SPA shell precached as static
				// HTML -- that doesn't exist here since pages are server-rendered. Previously
				// -visited pages are served from the "pages" runtime cache below instead; a
				// page never visited online has no cached response, and offline access to it
				// correctly fails (falls through to the browser's native offline page).
				navigateFallback: null,
				globPatterns: ['**/*.{js,css,svg,png,ico,woff2}'],
				runtimeCaching: [
					{
						// Excludes /auth/callback: its one-time OAuth code/state query params
						// are never reusable, so caching that exact URL is pure clutter.
						urlPattern: ({ request, url }) =>
							request.mode === 'navigate' && url.pathname !== '/auth/callback',
						handler: 'NetworkFirst',
						options: { cacheName: 'pages', networkTimeoutSeconds: 3 }
					},
					{
						urlPattern: ({ url }) => url.pathname.startsWith('/api/'),
						handler: 'NetworkOnly'
					}
				]
			}
		})
	],
	test: {
		environment: 'node',
		include: ['src/**/*.{test,spec}.ts'],
		// Tests share one real sqlite file (see tests/global-setup.ts) rather than an
		// isolated db per file, so run them sequentially to avoid concurrent writers
		// hitting SQLITE_BUSY.
		fileParallelism: false,
		globalSetup: ['./tests/global-setup.ts']
	}
});
