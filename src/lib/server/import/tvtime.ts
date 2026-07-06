import { strFromU8, unzipSync } from 'fflate';
import Papa from 'papaparse';

/**
 * TV Time's data export has no single stable schema: depending on when an account was
 * created, its watch history is spread across several overlapping/legacy CSVs
 * (seen_episode.csv, watched_on_episode.csv, seen_episode_source.csv,
 * rewatched_episode.csv, tracking-prod-records-v2.csv, ...), each with different column
 * names and none of them complete on their own. Rather than hardcode one filename, this
 * scans every CSV in the export for a column shape that looks like an episode-watch
 * record (a show name + season number + episode number, optionally a date) and unions
 * the results -- which is also naturally resilient to TV Time changing the format again.
 */

interface CandidateEpisodeWatch {
	showName: string;
	seasonNumber: number;
	episodeNumber: number;
	watchedAt: Date;
}

const SHOW_NAME_COLUMNS = ['tv_show_name', 'series_name'];
const SEASON_COLUMNS = ['episode_season_number', 'season_number'];
const EPISODE_COLUMNS = ['episode_number', 'ep_no'];
const DATE_COLUMNS = ['created_at', 'updated_at', 'watch_date'];

function findColumn(headers: string[], candidates: string[]): string | null {
	return candidates.find((c) => headers.includes(c)) ?? null;
}

function parseCsvForCandidates(csvText: string): CandidateEpisodeWatch[] {
	const parsed = Papa.parse<Record<string, string>>(csvText, {
		header: true,
		skipEmptyLines: true
	});
	const headers = parsed.meta.fields ?? [];

	const showCol = findColumn(headers, SHOW_NAME_COLUMNS);
	const seasonCol = findColumn(headers, SEASON_COLUMNS);
	const episodeCol = findColumn(headers, EPISODE_COLUMNS);
	const dateCol = findColumn(headers, DATE_COLUMNS);
	if (!showCol || !seasonCol || !episodeCol) return [];

	const candidates: CandidateEpisodeWatch[] = [];
	for (const row of parsed.data) {
		const showName = row[showCol]?.trim();
		const seasonNumber = Number(row[seasonCol]);
		const episodeNumber = Number(row[episodeCol]);
		if (!showName || !Number.isInteger(seasonNumber) || seasonNumber < 0) continue;
		if (!Number.isInteger(episodeNumber) || episodeNumber < 1) continue;

		const rawDate = dateCol ? row[dateCol] : undefined;
		const watchedAt = rawDate ? new Date(rawDate.replace(' ', 'T')) : new Date();

		candidates.push({
			showName,
			seasonNumber,
			episodeNumber,
			watchedAt: Number.isNaN(watchedAt.getTime()) ? new Date() : watchedAt
		});
	}
	return candidates;
}

export interface ParsedShowWatches {
	showName: string;
	episodes: Array<{ seasonNumber: number; episodeNumber: number; watchedAt: Date }>;
}

/** Accepts either the raw export zip or a single CSV file. */
export function parseTvTimeExport(fileData: Uint8Array): ParsedShowWatches[] {
	const isZip = fileData[0] === 0x50 && fileData[1] === 0x4b; // "PK" zip magic

	const csvTexts: string[] = [];
	if (isZip) {
		const entries = unzipSync(fileData);
		for (const [name, data] of Object.entries(entries)) {
			if (name.toLowerCase().endsWith('.csv')) csvTexts.push(strFromU8(data));
		}
	} else {
		csvTexts.push(strFromU8(fileData));
	}

	// Dedupe by (show, season, episode) across every source file, keeping the earliest
	// watched-at date seen for that episode.
	const byIdentity = new Map<string, CandidateEpisodeWatch>();
	for (const csvText of csvTexts) {
		for (const candidate of parseCsvForCandidates(csvText)) {
			const identity = `${candidate.showName.toLowerCase()}|${candidate.seasonNumber}|${candidate.episodeNumber}`;
			const existing = byIdentity.get(identity);
			if (!existing || candidate.watchedAt < existing.watchedAt) {
				byIdentity.set(identity, candidate);
			}
		}
	}

	const byShow = new Map<string, ParsedShowWatches>();
	for (const candidate of byIdentity.values()) {
		const key = candidate.showName.toLowerCase();
		let entry = byShow.get(key);
		if (!entry) {
			entry = { showName: candidate.showName, episodes: [] };
			byShow.set(key, entry);
		}
		entry.episodes.push({
			seasonNumber: candidate.seasonNumber,
			episodeNumber: candidate.episodeNumber,
			watchedAt: candidate.watchedAt
		});
	}

	return [...byShow.values()];
}
