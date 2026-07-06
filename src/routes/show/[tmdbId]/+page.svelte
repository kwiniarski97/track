<script lang="ts">
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import { m } from '$lib/paraglide/messages';
	import { getPendingWatchOverride } from '$lib/client/db';
	import { queueWatch } from '$lib/client/outbox';
	import DetailHero from '$lib/components/DetailHero.svelte';
	import TrackButton from '$lib/components/TrackButton.svelte';
	import SeasonTabs from '$lib/components/SeasonTabs.svelte';
	import EpisodeRow from '$lib/components/EpisodeRow.svelte';

	let { data } = $props();

	let pendingOverrides = $state<Record<string, boolean>>({});

	function overrideKey(seasonNumber: number, episodeNumber: number): string {
		return `${seasonNumber}-${episodeNumber}`;
	}

	function episodesFor(seasonNumber: number) {
		return data.episodesBySeason[seasonNumber] ?? [];
	}

	$effect(() => {
		const seasonsList = data.seasons;
		const showId = data.show.id;

		(async () => {
			const overrides: Record<string, boolean> = {};
			for (const season of seasonsList) {
				for (const episode of episodesFor(season.season_number)) {
					const override = await getPendingWatchOverride(
						'tv',
						showId,
						season.season_number,
						episode.episodeNumber
					);
					if (override !== null) {
						overrides[overrideKey(season.season_number, episode.episodeNumber)] = override;
					}
				}
			}
			pendingOverrides = overrides;
		})();
	});

	onMount(() => {
		document.getElementById(`season-${data.selectedSeason}`)?.scrollIntoView({ block: 'start' });
	});

	function isWatched(seasonNumber: number, episodeNumber: number): boolean {
		return (
			pendingOverrides[overrideKey(seasonNumber, episodeNumber)] ??
			data.watchedEpisodeNumbersBySeason[seasonNumber]?.includes(episodeNumber) ??
			false
		);
	}

	async function toggleEpisode(seasonNumber: number, episodeNumber: number, watched: boolean) {
		pendingOverrides = { ...pendingOverrides, [overrideKey(seasonNumber, episodeNumber)]: watched };
		await queueWatch({
			mediaType: 'tv',
			tmdbId: data.show.id,
			seasonNumber,
			episodeNumber,
			watched
		});
	}

	function isSeasonFullyWatched(seasonNumber: number): boolean {
		const episodeList = episodesFor(seasonNumber);
		return (
			episodeList.length > 0 &&
			episodeList.every((episode) => isWatched(seasonNumber, episode.episodeNumber))
		);
	}

	async function toggleSeason(seasonNumber: number, watched: boolean) {
		const episodeList = episodesFor(seasonNumber);
		const overrides = { ...pendingOverrides };
		for (const episode of episodeList) {
			overrides[overrideKey(seasonNumber, episode.episodeNumber)] = watched;
		}
		pendingOverrides = overrides;
		await Promise.all(
			episodeList.map((episode) =>
				queueWatch({
					mediaType: 'tv',
					tmdbId: data.show.id,
					seasonNumber,
					episodeNumber: episode.episodeNumber,
					watched
				})
			)
		);
	}
</script>

<svelte:head><title>{data.show.name} · {m.app_name()}</title></svelte:head>

<DetailHero
	backdropPath={data.show.backdrop_path}
	posterPath={data.show.poster_path}
	title={data.show.name}
	overview={data.show.overview}
	meta={m.show_status_label({ status: data.show.status })}
	backHref={resolve('/search')}
	backLabel={m.back_to_search()}
>
	<div class="flex flex-wrap items-center gap-2">
		<TrackButton
			trackingStatus={data.trackingStatus}
			trackLabel={m.track_this_show()}
			trackingLabel={m.tracking_status({ status: data.trackingStatus ?? '' })}
			stopLabel={m.stop_tracking()}
		/>
		{#if data.inJellyfinLibrary}
			<span class="rounded-pill bg-surface-2 px-3 py-1.5 text-xs font-medium text-text-muted">
				{m.in_jellyfin_library()}
			</span>
		{/if}
	</div>

	<div
		class="sticky top-0 z-10 mt-6 -mx-4 bg-bg/95 px-4 py-3 backdrop-blur-sm md:top-14 md:-mx-6 md:px-6"
	>
		<SeasonTabs seasons={data.seasons} selected={data.selectedSeason} />
	</div>

	{#each data.seasons as season (season.season_number)}
		<section id={`season-${season.season_number}`} class="mt-6 scroll-mt-24 md:scroll-mt-32">
			<div class="mb-3 flex flex-wrap items-center justify-between gap-2">
				<h2 class="text-lg font-semibold text-text">
					{season.season_number === 0
						? m.season_specials()
						: m.season_heading({ number: season.season_number })}
				</h2>
				<button
					type="button"
					onclick={() =>
						toggleSeason(season.season_number, !isSeasonFullyWatched(season.season_number))}
					class="text-sm font-medium text-accent hover:underline"
				>
					{isSeasonFullyWatched(season.season_number)
						? m.unmark_season_watched()
						: m.mark_season_watched()}
				</button>
			</div>

			<div class="flex flex-col gap-2">
				{#each episodesFor(season.season_number) as episode (episode.episodeNumber)}
					<EpisodeRow
						number={episode.episodeNumber}
						title={episode.title}
						watched={isWatched(season.season_number, episode.episodeNumber)}
						onToggle={(watched) =>
							toggleEpisode(season.season_number, episode.episodeNumber, watched)}
					/>
				{/each}
			</div>
		</section>
	{/each}
</DetailHero>
