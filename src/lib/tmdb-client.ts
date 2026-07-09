export function tmdbPosterUrl(
	path: string | null,
	size: 'w185' | 'w200' | 'w342' | 'w500' = 'w342'
): string | null {
	return path ? `https://image.tmdb.org/t/p/${size}${path}` : null;
}

export function tmdbBackdropUrl(
	path: string | null,
	size: 'w780' | 'w1280' = 'w1280'
): string | null {
	return path ? `https://image.tmdb.org/t/p/${size}${path}` : null;
}

export function tmdbStillUrl(path: string | null, size: 'w185' | 'w300' = 'w300'): string | null {
	return path ? `https://image.tmdb.org/t/p/${size}${path}` : null;
}
