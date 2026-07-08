import gsap from 'gsap';

export function reducedMotion(): boolean {
	return (
		typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
	);
}

interface RevealOptions {
	/** Position in a list -- staggers the delay so grids/lists cascade in. */
	index?: number;
	y?: number;
	stagger?: number;
	delay?: number;
}

/** Svelte action: fades/slides an element in on mount. Renders in its final state
 * instantly when the user has requested reduced motion. */
export function reveal(node: HTMLElement, options: RevealOptions = {}) {
	if (reducedMotion()) return {};

	const { index = 0, y = 14, stagger = 0.04, delay = 0 } = options;
	gsap.fromTo(
		node,
		{ opacity: 0, y },
		{
			opacity: 1,
			y: 0,
			duration: 0.5,
			delay: delay + index * stagger,
			ease: 'power3.out'
		}
	);
	return {};
}

/** Slides a shared indicator element behind the active tab/nav-link. */
export function animateTabIndicator(indicator: HTMLElement, target: HTMLElement): void {
	if (!target.offsetParent) return;

	// offsetLeft is relative to the offsetParent's padding edge -- the same origin
	// `position: absolute; left` uses. Diffing getBoundingClientRect()s here instead
	// would double-count the container's own padding and drift the indicator off target.
	const x = target.offsetLeft;
	const { width, height } = target.getBoundingClientRect();

	if (reducedMotion()) {
		gsap.set(indicator, { x, width, height });
		return;
	}
	gsap.to(indicator, { x, width, height, duration: 0.35, ease: 'power3.out' });
}

/** Small confirmation bounce, e.g. after a track/untrack action succeeds. */
export function pulse(node: HTMLElement): void {
	if (reducedMotion()) return;
	gsap.fromTo(
		node,
		{ scale: 1 },
		{ scale: 1.08, duration: 0.15, yoyo: true, repeat: 1, ease: 'power2.out' }
	);
}

/** Pop-in for a checkmark/check-state icon, e.g. toggling an episode watched. */
export function checkPop(node: HTMLElement): void {
	if (reducedMotion()) return;
	gsap.fromTo(
		node,
		{ scale: 0.4, opacity: 0 },
		{ scale: 1, opacity: 1, duration: 0.3, ease: 'back.out(2.5)' }
	);
}
