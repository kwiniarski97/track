<script lang="ts">
	import { untrack } from 'svelte';
	import { m } from '$lib/paraglide/messages';
	import { animateTabIndicator } from '$lib/motion';

	let {
		seasons,
		selected,
		onSelect
	}: {
		seasons: Array<{ season_number: number }>;
		selected: number;
		onSelect?: (seasonNumber: number) => void;
	} = $props();

	let containerEl = $state<HTMLElement>();
	let indicatorEl = $state<HTMLElement>();
	let activeSeason = $state(untrack(() => selected));

	function syncIndicator() {
		if (!containerEl || !indicatorEl) return;
		const active = containerEl.querySelector<HTMLElement>('[data-active="true"]');
		if (active) animateTabIndicator(indicatorEl, active);
	}

	$effect(() => {
		void activeSeason;
		queueMicrotask(syncIndicator);
	});

	function scrollToSeason(event: MouseEvent, seasonNumber: number) {
		event.preventDefault();
		onSelect?.(seasonNumber);
		document.getElementById(`season-${seasonNumber}`)?.scrollIntoView({
			behavior: 'smooth',
			block: 'start'
		});
	}

	// Highlights whichever season section is currently under the sticky tab bar.
	$effect(() => {
		const observer = new IntersectionObserver(
			(entries) => {
				for (const entry of entries) {
					if (entry.isIntersecting) {
						activeSeason = Number(entry.target.id.slice('season-'.length));
						break;
					}
				}
			},
			{ rootMargin: '-120px 0px -70% 0px', threshold: 0 }
		);
		for (const season of seasons) {
			const el = document.getElementById(`season-${season.season_number}`);
			if (el) observer.observe(el);
		}
		return () => observer.disconnect();
	});
</script>

<svelte:window onresize={syncIndicator} />

<div
	bind:this={containerEl}
	class="relative flex gap-1 overflow-x-auto rounded-pill bg-surface p-1"
>
	<span
		bind:this={indicatorEl}
		class="bg-gradient-accent pointer-events-none absolute top-1 left-0 rounded-pill shadow-glow"
		style="height: 0; width: 0;"
	></span>
	{#each seasons as season (season.season_number)}
		{@const active = season.season_number === activeSeason}
		<a
			href={`#season-${season.season_number}`}
			data-active={active}
			onclick={(event) => scrollToSeason(event, season.season_number)}
			class="relative z-10 flex-none inline-flex items-center justify-center rounded-pill px-4 py-1.5 text-sm font-medium whitespace-nowrap transition-colors {active
				? 'text-accent-fg'
				: 'text-text-muted hover:text-text'}"
		>
			{season.season_number === 0 ? m.season_specials() : `S${season.season_number}`}
		</a>
	{/each}
</div>
