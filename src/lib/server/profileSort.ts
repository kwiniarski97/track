import { getLocale } from '$lib/paraglide/runtime';

export const PROFILE_SORTS = ['added_desc', 'added_asc', 'title', 'released'] as const;
export type ProfileSort = (typeof PROFILE_SORTS)[number];

export interface SortableItem<T> {
	item: T;
	title: string;
	addedAt: number;
	releaseDate: string | null;
}

export function sortProfileItems<T>(items: SortableItem<T>[], sort: ProfileSort): T[] {
	const sorted = [...items];
	switch (sort) {
		case 'added_asc':
			sorted.sort((a, b) => a.addedAt - b.addedAt);
			break;
		case 'title':
			sorted.sort((a, b) => a.title.localeCompare(b.title, getLocale()));
			break;
		case 'released':
			sorted.sort((a, b) => (b.releaseDate ?? '').localeCompare(a.releaseDate ?? ''));
			break;
		case 'added_desc':
			sorted.sort((a, b) => b.addedAt - a.addedAt);
			break;
	}
	return sorted.map((s) => s.item);
}
