<script lang="ts">
	import type { Snippet } from 'svelte';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { m } from '$lib/paraglide/messages';
	import { animateTabIndicator } from '$lib/motion';
	import IconHome from './icons/IconHome.svelte';
	import IconSearch from './icons/IconSearch.svelte';
	import IconCalendar from './icons/IconCalendar.svelte';
	import IconSettings from './icons/IconSettings.svelte';
	import IconLogOut from './icons/IconLogOut.svelte';

	let {
		user,
		children
	}: {
		user: { name: string; email: string } | null;
		children: Snippet;
	} = $props();

	const navItems = [
		{ href: resolve('/'), label: m.nav_home, Icon: IconHome, isActive: (p: string) => p === '/' },
		{
			href: resolve('/search'),
			label: m.nav_search,
			Icon: IconSearch,
			isActive: (p: string) =>
				p.startsWith('/search') || p.startsWith('/show/') || p.startsWith('/movie/')
		},
		{
			href: resolve('/calendar'),
			label: m.nav_calendar,
			Icon: IconCalendar,
			isActive: (p: string) => p.startsWith('/calendar')
		},
		{
			href: resolve('/settings'),
			label: m.nav_settings,
			Icon: IconSettings,
			isActive: (p: string) => p.startsWith('/settings')
		}
	];

	let navEl = $state<HTMLElement>();
	let indicatorEl = $state<HTMLElement>();

	function syncIndicator() {
		if (!navEl || !indicatorEl) return;
		const active = navEl.querySelector<HTMLElement>('[data-active="true"]');
		if (active) animateTabIndicator(indicatorEl, active);
	}

	$effect(() => {
		void page.url.pathname;
		// Wait a tick so the DOM reflects the new active link before measuring it.
		queueMicrotask(syncIndicator);
	});
</script>

<svelte:window onresize={syncIndicator} />

<div class="flex min-h-dvh flex-col">
	<header class="glass sticky top-0 z-20 hidden border-b border-border md:block">
		<div class="mx-auto flex max-w-6xl items-center justify-between gap-6 px-6 py-3">
			<a href={resolve('/')} class="text-lg font-semibold tracking-tight text-text">
				{m.app_name()}
			</a>

			<nav bind:this={navEl} class="relative flex items-center gap-1">
				<span
					bind:this={indicatorEl}
					class="pointer-events-none absolute top-0 left-0 rounded-pill bg-surface-2"
					style="height: 0; width: 0;"
				></span>
				{#each navItems as item (item.href)}
					{@const active = item.isActive(page.url.pathname)}
					<a
						href={item.href}
						data-active={active}
						class="relative z-10 flex items-center gap-2 rounded-pill px-4 py-2 text-sm font-medium transition-colors {active
							? 'text-text'
							: 'text-text-muted'}"
					>
						<item.Icon size={16} />
						{item.label()}
					</a>
				{/each}
			</nav>

			<div class="flex items-center gap-3">
				{#if user}
					<span class="max-w-[14ch] truncate text-sm text-text-muted" title={user.name}>
						{user.name}
					</span>
				{/if}
				<form method="POST" action="/logout">
					<button
						type="submit"
						aria-label={m.log_out()}
						title={m.log_out()}
						class="flex items-center justify-center rounded-pill p-2 text-text-muted transition-colors hover:bg-surface-2 hover:text-text"
					>
						<IconLogOut size={18} />
					</button>
				</form>
			</div>
		</div>
	</header>

	<main class="mx-auto w-full max-w-6xl flex-1 px-4 pt-6 pb-24 md:px-6 md:pt-10 md:pb-12">
		{@render children()}
	</main>

	<nav
		class="glass fixed inset-x-0 bottom-0 z-20 flex items-stretch justify-around border-t border-border md:hidden"
		style="padding-bottom: env(safe-area-inset-bottom);"
	>
		{#each navItems as item (item.href)}
			{@const active = item.isActive(page.url.pathname)}
			<a
				href={item.href}
				class="flex flex-1 flex-col items-center gap-1 px-2 py-2.5 text-[11px] font-medium transition-colors {active
					? 'text-accent'
					: 'text-text-muted'}"
			>
				<item.Icon size={21} />
				{item.label()}
			</a>
		{/each}
	</nav>
</div>
