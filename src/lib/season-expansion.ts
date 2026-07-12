export type SeasonInfo = { seasonNumber: number };

/**
 * Picks which season should start expanded on the show page: the chronologically
 * oldest season (numbered seasons ascending, "Specials" always last) that still has
 * a released episode nobody's watched yet. A fully-watched season is never picked --
 * once everything released has been watched, nothing is expanded by default.
 */
export function pickDefaultExpandedSeason(
	seasons: SeasonInfo[],
	releasedEpisodeNumbersBySeason: Record<number, number[]>,
	watchedEpisodeNumbersBySeason: Record<number, number[]>
): number | null {
	const numbered = seasons
		.filter((s) => s.seasonNumber > 0)
		.sort((a, b) => a.seasonNumber - b.seasonNumber);
	const specials = seasons.find((s) => s.seasonNumber === 0);
	const chronological = specials ? [...numbered, specials] : numbered;

	for (const season of chronological) {
		const released = releasedEpisodeNumbersBySeason[season.seasonNumber] ?? [];
		if (released.length === 0) continue;
		const watched = watchedEpisodeNumbersBySeason[season.seasonNumber] ?? [];
		const fullyWatched = released.every((episodeNumber) => watched.includes(episodeNumber));
		if (!fullyWatched) return season.seasonNumber;
	}

	return null;
}
