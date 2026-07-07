<script lang="ts">
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import { m } from '$lib/paraglide/messages';
	import { NO_EPISODE, getPendingWatchOverride } from '$lib/client/db';
	import { queueWatch } from '$lib/client/outbox';
	import DetailHero from '$lib/components/DetailHero.svelte';
	import TrackButton from '$lib/components/TrackButton.svelte';
	import IconCheck from '$lib/components/icons/IconCheck.svelte';

	let { data } = $props();

	let pendingOverride = $state<boolean | null>(null);

	onMount(async () => {
		pendingOverride = await getPendingWatchOverride('movie', data.movie.id, NO_EPISODE, NO_EPISODE);
	});

	const isWatched = $derived(pendingOverride ?? data.watched);

	async function toggleWatched(watched: boolean) {
		pendingOverride = watched;
		await queueWatch({ mediaType: 'movie', tmdbId: data.movie.id, watched });
	}
</script>

<svelte:head><title>{data.movie.title} · {m.app_name()}</title></svelte:head>

<DetailHero
	backdropPath={data.movie.backdrop_path}
	posterPath={data.movie.poster_path}
	title={data.movie.title}
	overview={data.movie.overview}
	backHref={resolve('/search')}
	backLabel={m.back_to_search()}
>
	{#snippet actions()}
		<div class="flex flex-wrap items-center gap-2">
			<TrackButton
				trackingStatus={data.trackingStatus}
				trackLabel={m.track_this_movie()}
				trackingLabel={m.tracking_status({ status: data.trackingStatus ?? '' })}
				stopLabel={m.stop_tracking()}
			/>
			{#if data.inJellyfinLibrary}
				<span class="rounded-pill bg-surface-2 px-3 py-1.5 text-xs font-medium text-text-muted">
					{m.in_jellyfin_library()}
				</span>
			{/if}
			<button
				type="button"
				onclick={() => toggleWatched(!isWatched)}
				class="flex items-center gap-2 rounded-pill border px-4 py-2 text-sm font-medium transition-colors {isWatched
					? 'border-accent bg-accent/10 text-accent'
					: 'border-border text-text-muted hover:border-border-strong hover:text-text'}"
			>
				<span
					class="flex h-5 w-5 items-center justify-center rounded-full border transition-colors {isWatched
						? 'bg-gradient-accent border-accent text-accent-fg'
						: 'border-border-strong text-transparent'}"
				>
					<IconCheck size={12} />
				</span>
				{m.watched_label()}
			</button>
		</div>
	{/snippet}
</DetailHero>
