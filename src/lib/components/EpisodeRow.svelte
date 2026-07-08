<script lang="ts">
	import { checkPop, confettiBurst } from '$lib/motion';
	import { m } from '$lib/paraglide/messages';
	import { tmdbStillUrl } from '$lib/tmdb-client';
	import IconCheck from './icons/IconCheck.svelte';
	import IconClock from './icons/IconClock.svelte';
	import AudienceScoreBadge from './AudienceScoreBadge.svelte';

	let {
		number,
		title,
		watched,
		unreleasedNote = null,
		stillPath = null,
		runtime = null,
		voteAverage = null,
		voteCount = null,
		onToggle
	}: {
		number: number;
		title: string;
		watched: boolean;
		// Set (to e.g. "Airs Mar 4, 2026") when the episode hasn't aired yet -- disables
		// the row instead of letting someone mark an episode watched before it exists.
		unreleasedNote?: string | null;
		stillPath?: string | null;
		runtime?: number | null;
		voteAverage?: number | null;
		voteCount?: number | null;
		onToggle: (watched: boolean) => void;
	} = $props();

	let checkEl = $state<HTMLElement>();
	let circleEl = $state<HTMLElement>();

	$effect(() => {
		if (watched && checkEl) checkPop(checkEl);
		if (watched && circleEl) confettiBurst(circleEl);
	});

	const still = $derived(tmdbStillUrl(stillPath));
</script>

<button
	type="button"
	disabled={!!unreleasedNote}
	onclick={() => onToggle(!watched)}
	class="flex w-full items-center gap-3 rounded-card border border-border bg-surface px-4 py-3 text-left transition-colors hover:border-border-strong disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:border-border"
>
	<span
		class="h-12 w-20 flex-none overflow-hidden rounded-md bg-surface-2 {watched
			? 'opacity-60'
			: ''}"
	>
		{#if still}
			<img src={still} alt="" loading="lazy" class="h-full w-full object-cover" />
		{/if}
	</span>
	<span class="min-w-0 flex-1 text-sm {watched ? 'text-text-muted line-through' : 'text-text'}">
		<span class="font-medium">E{number}</span> — {title}
		{#if unreleasedNote}
			<span class="mt-0.5 block text-xs text-text-faint no-underline">{unreleasedNote}</span>
		{/if}
		{#if !unreleasedNote && (runtime || voteAverage)}
			<span class="mt-1 flex flex-wrap items-center gap-2 no-underline">
				{#if runtime}
					<span class="flex items-center gap-1 text-xs text-text-muted">
						<IconClock size={12} />
						{m.episode_runtime_minutes({ minutes: runtime })}
					</span>
				{/if}
				{#if voteAverage}
					<AudienceScoreBadge {voteAverage} voteCount={voteCount ?? 0} />
				{/if}
			</span>
		{/if}
	</span>
	<span
		bind:this={circleEl}
		class="relative flex h-6 w-6 flex-none items-center justify-center rounded-full border transition-colors {watched
			? 'bg-gradient-accent border-accent text-accent-fg shadow-glow'
			: 'border-border-strong text-transparent'}"
	>
		{#if watched}
			<span bind:this={checkEl} class="flex items-center justify-center">
				<IconCheck size={13} />
			</span>
		{/if}
	</span>
</button>
