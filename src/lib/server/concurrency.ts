// Each task is dominated by a network round-trip, so overlapping a few keeps a job from
// scaling linearly with catalog size while staying polite to TMDB's rate limits.
// The DB writes inside each task are synchronous (better-sqlite3), so they never truly
// run concurrently -- only the network waits overlap.
export async function forEachConcurrent<T>(
	items: Iterable<T>,
	limit: number,
	task: (item: T) => Promise<void>
): Promise<void> {
	const queue = [...items];
	const workers = Array.from({ length: Math.min(limit, queue.length) }, async () => {
		for (let item = queue.shift(); item !== undefined; item = queue.shift()) {
			await task(item);
		}
	});
	await Promise.all(workers);
}
