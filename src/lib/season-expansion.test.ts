import { describe, expect, it } from 'vitest';
import { pickDefaultExpandedSeason } from './season-expansion';

describe('pickDefaultExpandedSeason', () => {
	it('picks the oldest season that still has an unwatched released episode', () => {
		const seasons = [{ seasonNumber: 1 }, { seasonNumber: 2 }, { seasonNumber: 3 }];
		const released = { 1: [1, 2], 2: [1, 2], 3: [1, 2] };
		// Fully caught up through season 1, partway through season 2.
		const watched = { 1: [1, 2], 2: [1], 3: [] };

		expect(pickDefaultExpandedSeason(seasons, released, watched)).toBe(2);
	});

	it('skips seasons with no released episodes yet, even if nothing in them is watched', () => {
		const seasons = [{ seasonNumber: 1 }, { seasonNumber: 2 }];
		// Season 2 hasn't aired at all yet, so it shouldn't be picked over season 1.
		const released = { 1: [1, 2], 2: [] };
		const watched = { 1: [1], 2: [] };

		expect(pickDefaultExpandedSeason(seasons, released, watched)).toBe(1);
	});

	it('expands nothing once everything released has been watched', () => {
		const seasons = [{ seasonNumber: 1 }, { seasonNumber: 2 }, { seasonNumber: 3 }];
		const released = { 1: [1, 2], 2: [1, 2], 3: [] };
		const watched = { 1: [1, 2], 2: [1, 2], 3: [] };

		expect(pickDefaultExpandedSeason(seasons, released, watched)).toBeNull();
	});

	it('treats specials (season 0) as chronologically last, not first', () => {
		const seasons = [{ seasonNumber: 0 }, { seasonNumber: 1 }, { seasonNumber: 2 }];
		const released = { 0: [1], 1: [1, 2], 2: [1, 2] };
		// Only specials has an unwatched episode -- numbered seasons are fully watched.
		const watched = { 0: [], 1: [1, 2], 2: [1, 2] };

		expect(pickDefaultExpandedSeason(seasons, released, watched)).toBe(0);
	});

	it('prefers an unwatched numbered season over unwatched specials', () => {
		const seasons = [{ seasonNumber: 0 }, { seasonNumber: 1 }, { seasonNumber: 2 }];
		const released = { 0: [1], 1: [1, 2], 2: [1, 2] };
		const watched = { 0: [], 1: [1], 2: [] };

		expect(pickDefaultExpandedSeason(seasons, released, watched)).toBe(1);
	});

	it('expands nothing when the only season (specials) is fully watched', () => {
		const seasons = [{ seasonNumber: 0 }];
		const released = { 0: [1] };
		const watched = { 0: [1] };

		expect(pickDefaultExpandedSeason(seasons, released, watched)).toBeNull();
	});

	it('returns null when there are no seasons at all', () => {
		expect(pickDefaultExpandedSeason([], {}, {})).toBeNull();
	});

	it('expands nothing for a single fully-watched season', () => {
		const seasons = [{ seasonNumber: 1 }];
		const released = { 1: [1, 2, 3] };
		const watched = { 1: [1, 2, 3] };

		expect(pickDefaultExpandedSeason(seasons, released, watched)).toBeNull();
	});

	it('expands nothing when the only released season is fully watched and the rest is unreleased', () => {
		const seasons = [{ seasonNumber: 1 }, { seasonNumber: 2 }];
		const released = { 1: [1], 2: [] };
		const watched = { 1: [1], 2: [] };

		expect(pickDefaultExpandedSeason(seasons, released, watched)).toBeNull();
	});
});
