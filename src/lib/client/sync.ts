import { drainOutbox } from './outbox';

const RETRY_INTERVAL_MS = 30_000;

let initialized = false;

/** Wires up the outbox drain triggers. The 'online' event is the real sync mechanism
 * (Background Sync API isn't supported in Safari); foreground/interval checks are a
 * backstop in case a previous drain attempt stalled partway through. */
export function initSync(): void {
	if (initialized) return;
	initialized = true;

	window.addEventListener('online', () => void drainOutbox());
	document.addEventListener('visibilitychange', () => {
		if (document.visibilityState === 'visible') void drainOutbox();
	});
	setInterval(() => void drainOutbox(), RETRY_INTERVAL_MS);
	void drainOutbox();
}
