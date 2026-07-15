<script lang="ts">
	import { untrack } from 'svelte';
	import { slide } from 'svelte/transition';
	import { resolve } from '$app/paths';
	import { getLocale } from '$lib/paraglide/runtime';
	import { m } from '$lib/paraglide/messages';
	import { showStatusLabel, trackingStatusLabel } from '$lib/labels';
	import { getPendingWatchOverrides, watchIdentity } from '$lib/client/db';
	import { queueWatch } from '$lib/client/outbox';
	import { applyAccentTheme } from '$lib/client/accent-theme';
	import { reducedMotion } from '$lib/motion';
	import { pickDefaultExpandedSeason } from '$lib/season-expansion';
	import DetailHero from '$lib/components/DetailHero.svelte';
	import TrackButton from '$lib/components/TrackButton.svelte';
	import SeasonTabs from '$lib/components/SeasonTabs.svelte';
	import EpisodeRow from '$lib/components/EpisodeRow.svelte';
	import IconCheck from '$lib/components/icons/IconCheck.svelte';
	import IconChevronDown from '$lib/components/icons/IconChevronDown.svelte';
	import AudienceScoreBadge from '$lib/components/AudienceScoreBadge.svelte';

	let { data } = $props();

	// While a show is still in progress, "stopping" should drop it (soft, keeps history)
	// rather than delete the tracking row outright -- see the show page's `drop` action.
	const canDrop = $derived(
		data.trackingStatus === 'watching' || data.trackingStatus === 'plan_to_watch'
	);

	let pendingOverrides = $state<Record<string, boolean>>({});

	function overrideKey(seasonNumber: number, episodeNumber: number): string {
		return `${seasonNumber}-${episodeNumber}`;
	}

	function episodesFor(seasonNumber: number) {
		return data.episodesBySeason[seasonNumber] ?? [];
	}

	// Compared as plain "YYYY-MM-DD" strings (same format TMDB gives us), so no
	// timezone-sensitive Date parsing is needed here.
	const today = new Date().toISOString().slice(0, 10);

	function isReleased(airDate: string | null): boolean {
		return airDate !== null && airDate <= today;
	}

	function releasedEpisodesFor(seasonNumber: number) {
		return episodesFor(seasonNumber).filter((episode) => isReleased(episode.airDate));
	}

	let expandedSeasons = $state<Record<number, boolean>>({});

	function isSeasonExpanded(seasonNumber: number): boolean {
		return expandedSeasons[seasonNumber] ?? false;
	}

	function toggleSeasonExpanded(seasonNumber: number) {
		expandedSeasons = { ...expandedSeasons, [seasonNumber]: !isSeasonExpanded(seasonNumber) };
	}

	// Jumping to a season via its tab should reveal its episodes even if it was
	// collapsed, rather than scrolling to a header with nothing shown underneath it.
	function expandSeason(seasonNumber: number) {
		expandedSeasons = { ...expandedSeasons, [seasonNumber]: true };
	}

	const airDateFormatter = new Intl.DateTimeFormat(getLocale(), {
		day: 'numeric',
		month: 'long',
		year: 'numeric'
	});

	const MS_PER_DAY = 24 * 60 * 60 * 1000;

	// Both sides parsed as UTC midnight, so this is a whole-day count unaffected by the
	// viewer's own timezone.
	function daysUntil(airDate: string): number {
		return Math.round(
			(new Date(`${airDate}T00:00:00Z`).getTime() - new Date(`${today}T00:00:00Z`).getTime()) /
				MS_PER_DAY
		);
	}

	function unreleasedNoteFor(airDate: string | null): string | null {
		if (isReleased(airDate)) return null;
		if (!airDate) return m.episode_release_date_unknown();
		// new Date('YYYY-MM-DD') parses as UTC midnight; format in UTC too so the
		// displayed date doesn't shift a day off in timezones behind UTC.
		const date = airDateFormatter.format(new Date(`${airDate}T00:00:00Z`));
		const days = daysUntil(airDate);
		return days <= 30 ? m.episode_airs_in_days({ date, days }) : m.episode_airs_on({ date });
	}

	$effect(() => {
		const seasonsList = data.seasons;
		const showId = data.show.id;

		(async () => {
			// One outbox read for the whole show instead of one per episode -- the old
			// per-episode helper re-read the entire outbox store on every call, which made
			// mounting a 200-episode show do 200 serialized IndexedDB getAll()s.
			const pending = await getPendingWatchOverrides('tv', showId);
			const overrides: Record<string, boolean> = {};
			for (const season of seasonsList) {
				for (const episode of episodesFor(season.season_number)) {
					const override = pending.get(
						watchIdentity({
							mediaType: 'tv',
							tmdbId: showId,
							seasonNumber: season.season_number,
							episodeNumber: episode.episodeNumber
						})
					);
					if (override !== undefined) {
						overrides[overrideKey(season.season_number, episode.episodeNumber)] = override;
					}
				}
			}
			pendingOverrides = overrides;
		})();
	});

	// Collapses every season except the one that should be open by default -- an
	// explicitly requested `?season=` deep link if present, otherwise the oldest season
	// that still has an unwatched released episode (see pickDefaultExpandedSeason).
	// Keyed only on the show id (via untrack) so toggling episodes/seasons afterwards
	// doesn't fight the user by recomputing and collapsing things back.
	$effect(() => {
		void data.show.id;
		untrack(() => {
			const releasedBySeason: Record<number, number[]> = {};
			for (const season of data.seasons) {
				releasedBySeason[season.season_number] = releasedEpisodesFor(season.season_number).map(
					(episode) => episode.episodeNumber
				);
			}
			const target =
				data.explicitSeason ??
				pickDefaultExpandedSeason(
					data.seasons.map((season) => ({ seasonNumber: season.season_number })),
					releasedBySeason,
					data.watchedEpisodeNumbersBySeason
				);
			expandedSeasons = target === null ? {} : { [target]: true };

			document.getElementById(`season-${target}`)?.scrollIntoView({ block: 'start' });
		});
	});

	// Retints the whole app's brand accent (buttons, checkmarks, nav bar) to match this
	// show's poster for as long as the page is open, reverting on navigation away.
	$effect(() => {
		return applyAccentTheme(data.posterColor);
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
		// If that was the last unwatched episode, collapse the season -- but only as a
		// side effect of *completing* it here, not a standing rule, so the user can still
		// manually reopen an already-watched season (e.g. to review it) without it
		// snapping shut again.
		if (watched && isSeasonFullyWatched(seasonNumber)) {
			expandedSeasons = { ...expandedSeasons, [seasonNumber]: false };
		}
		await queueWatch({
			mediaType: 'tv',
			tmdbId: data.show.id,
			seasonNumber,
			episodeNumber,
			watched
		});
	}

	function isSeasonReleased(seasonNumber: number): boolean {
		return releasedEpisodesFor(seasonNumber).length > 0;
	}

	function isSeasonFullyWatched(seasonNumber: number): boolean {
		const episodeList = releasedEpisodesFor(seasonNumber);
		return (
			episodeList.length > 0 &&
			episodeList.every((episode) => isWatched(seasonNumber, episode.episodeNumber))
		);
	}

	async function toggleSeason(seasonNumber: number, watched: boolean) {
		const episodeList = releasedEpisodesFor(seasonNumber);
		const overrides = { ...pendingOverrides };
		for (const episode of episodeList) {
			overrides[overrideKey(seasonNumber, episode.episodeNumber)] = watched;
		}
		pendingOverrides = overrides;
		if (watched && episodeList.length > 0) {
			expandedSeasons = { ...expandedSeasons, [seasonNumber]: false };
		}
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
	meta={m.show_status_label({ status: showStatusLabel(data.show.status) })}
	backHref={resolve('/search')}
	backLabel={m.back()}
>
	{#snippet actions()}
		<div class="flex flex-wrap items-center gap-2">
			<TrackButton
				trackingStatus={data.trackingStatus}
				trackLabel={m.track_this_show()}
				trackingLabel={m.tracking_status({
					status: trackingStatusLabel(data.trackingStatus ?? '')
				})}
				stopLabel={canDrop ? m.stop_watching() : m.stop_tracking()}
				stopAction={canDrop ? 'drop' : 'untrack'}
			/>
			{#if data.inJellyfinLibrary}
				<span class="rounded-pill bg-surface-2 px-3 py-1.5 text-xs font-medium text-text-muted">
					{m.in_jellyfin_library()}
				</span>
			{/if}
			<AudienceScoreBadge voteAverage={data.show.vote_average} voteCount={data.show.vote_count} />
		</div>
	{/snippet}

	<div
		class="sticky top-0 z-10 mt-6 -mx-4 bg-bg/95 px-4 py-3 backdrop-blur-sm md:top-14 md:-mx-6 md:px-6"
	>
		<SeasonTabs seasons={data.seasons} selected={data.selectedSeason} onSelect={expandSeason} />
	</div>

	{#each data.seasons as season (season.season_number)}
		<section id={`season-${season.season_number}`} class="mt-6 scroll-mt-24 md:scroll-mt-32">
			<div class="mb-3 flex items-center gap-3">
				<button
					type="button"
					class="-mx-1 -my-1 flex flex-1 cursor-pointer items-center gap-2 rounded-lg px-1 py-1 text-left transition-colors hover:bg-surface-2"
					aria-expanded={isSeasonExpanded(season.season_number)}
					aria-controls={`season-${season.season_number}-episodes`}
					onclick={() => toggleSeasonExpanded(season.season_number)}
				>
					<IconChevronDown
						size={18}
						class="flex-none text-text-muted transition-transform duration-200 ease-out {isSeasonExpanded(
							season.season_number
						)
							? ''
							: '-rotate-90'}"
					/>
					<h2 class="text-lg font-semibold text-text">
						{season.season_number === 0
							? m.season_specials()
							: m.season_heading({ number: season.season_number })}
					</h2>
				</button>
				<button
					type="button"
					disabled={!isSeasonReleased(season.season_number)}
					onclick={() =>
						toggleSeason(season.season_number, !isSeasonFullyWatched(season.season_number))}
					aria-label={isSeasonFullyWatched(season.season_number)
						? m.unmark_season_watched()
						: m.mark_season_watched()}
					class="flex h-6 w-6 flex-none items-center justify-center rounded-full border transition-colors disabled:cursor-not-allowed disabled:opacity-40 {isSeasonFullyWatched(
						season.season_number
					)
						? 'bg-gradient-accent border-accent text-accent-fg shadow-glow'
						: 'border-border-strong text-transparent hover:border-border'}"
				>
					{#if isSeasonFullyWatched(season.season_number)}
						<IconCheck size={13} />
					{/if}
				</button>
			</div>

			{#if isSeasonExpanded(season.season_number)}
				<div
					id={`season-${season.season_number}-episodes`}
					class="flex flex-col gap-2"
					transition:slide={{ duration: reducedMotion() ? 0 : 250 }}
				>
					{#each episodesFor(season.season_number) as episode (episode.episodeNumber)}
						<EpisodeRow
							number={episode.episodeNumber}
							title={episode.title}
							watched={isWatched(season.season_number, episode.episodeNumber)}
							unreleasedNote={unreleasedNoteFor(episode.airDate)}
							overview={episode.overview}
							stillPath={episode.stillPath}
							runtime={episode.runtime}
							voteAverage={episode.voteAverage}
							voteCount={episode.voteCount}
							onToggle={(watched) =>
								toggleEpisode(season.season_number, episode.episodeNumber, watched)}
						/>
					{/each}
				</div>
			{/if}
		</section>
	{/each}
</DetailHero>
