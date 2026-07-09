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

	onMount(() => {
		// Registered with an absolute path -- a relative "sw.js" would resolve against
		// whatever page happens to mount this layout first (e.g. /show/1396/sw.js).
		if ('serviceWorker' in navigator) {
			navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {});
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
