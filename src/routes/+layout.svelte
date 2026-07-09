<script lang="ts">
	import { onMount } from 'svelte';
	import { fade } from 'svelte/transition';
	import { page } from '$app/state';
	import { initSync } from '$lib/client/sync';
	import { reducedMotion } from '$lib/motion';
	import AppShell from '$lib/components/AppShell.svelte';
	import InstallPrompt from '$lib/components/InstallPrompt.svelte';
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';

	let { data, children } = $props();

	const transitionDuration = reducedMotion() ? 0 : 160;

	// The service worker's `pages` runtime cache (vite.config.ts) stores full HTML per
	// URL, not per session. AppShell's logout button already clears it proactively, but
	// that only covers an explicit log-out -- a session can also just be replaced by a
	// different Pocket ID login on the same device without ever hitting /logout (e.g. the
	// previous session expired, or the browser was simply handed to someone else). This
	// catches that case too: whenever the authenticated user differs from the last one
	// this device rendered a page for, drop the cache before it can serve their stale,
	// already-authenticated markup to the new user.
	const LAST_USER_ID_KEY = 'watched:last-user-id';

	onMount(() => {
		// Registered with an absolute path -- a relative "sw.js" would resolve against
		// whatever page happens to mount this layout first (e.g. /show/1396/sw.js).
		if ('serviceWorker' in navigator) {
			navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {});
		}
		if (data.user) {
			const lastUserId = localStorage.getItem(LAST_USER_ID_KEY);
			// Only a *change* from a previously-recorded user is a switch worth guarding
			// against -- treating the very first-ever load the same way would race the
			// cache we're about to legitimately populate for this same, first user.
			if (lastUserId && lastUserId !== data.user.id) {
				if ('caches' in window) caches.delete('pages').catch(() => {});
			}
			localStorage.setItem(LAST_USER_ID_KEY, data.user.id);
		}
		initSync();
	});
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>

{#if page.url.pathname === '/login'}
	{@render children()}
{:else}
	<AppShell user={data.user}>
		{#key page.url.pathname}
			<div in:fade={{ duration: transitionDuration, delay: transitionDuration ? 80 : 0 }}>
				{@render children()}
			</div>
		{/key}
	</AppShell>
	<InstallPrompt />
{/if}
