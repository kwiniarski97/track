/** Not in lib.dom.d.ts yet -- Chromium-only event fired instead of the default mini-
 * infobar when the page calls preventDefault(), letting us show our own install UI and
 * trigger the native prompt later from a user gesture. */
export interface BeforeInstallPromptEvent extends Event {
	readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
	prompt(): Promise<void>;
}

const DISMISSED_KEY = 'pwa-install-dismissed';

/** True once installed (standalone display mode), including iOS's non-standard
 * `navigator.standalone` -- installed apps should never see the install banner again. */
export function isStandalone(): boolean {
	return (
		window.matchMedia('(display-mode: standalone)').matches ||
		(navigator as Navigator & { standalone?: boolean }).standalone === true
	);
}

/** iOS only exposes "Add to Home Screen" through Safari's own share sheet -- Chrome/
 * Firefox on iOS all embed Safari's WebKit but can't trigger it, so they're excluded. */
export function isIosSafari(): boolean {
	const ua = navigator.userAgent;
	return /iphone|ipad|ipod/i.test(ua) && /safari/i.test(ua) && !/crios|fxios|edgios/i.test(ua);
}

/** Matches the breakpoint the bottom tab bar (AppShell) itself uses -- the prompt is
 * mobile-only, desktop already has the browser's own install affordance. */
export function isMobile(): boolean {
	return window.matchMedia('(max-width: 767px)').matches;
}

export function isDismissed(): boolean {
	return localStorage.getItem(DISMISSED_KEY) === '1';
}

export function dismissInstallPrompt(): void {
	localStorage.setItem(DISMISSED_KEY, '1');
}
