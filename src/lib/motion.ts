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

/** Cascade delay stops growing past this many items, so a big grid's tail settles in
 * bounded time instead of the last row lagging seconds behind the first. */
const REVEAL_STAGGER_CAP = 8;

/** Svelte action: fades/slides an element in on mount. Renders in its final state
 * instantly when the user has requested reduced motion. */
export function reveal(node: HTMLElement, options: RevealOptions = {}) {
	if (reducedMotion()) return {};

	const { index = 0, y = 14, stagger = 0.02, delay = 0 } = options;
	gsap.fromTo(
		node,
		{ opacity: 0, y },
		{
			opacity: 1,
			y: 0,
			duration: 0.32,
			delay: delay + Math.min(index, REVEAL_STAGGER_CAP) * stagger,
			ease: 'power2.out'
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

const CONFETTI_COLORS = ['#ff858d', '#ffaeb4', '#f2634a', '#fbbf24'];

/** Scatters a handful of accent-colored flecks out of `node`, e.g. from a check circle
 * when marking an episode watched. `node` must be positioned (relative/absolute) so the
 * particles anchor to it. */
export function confettiBurst(node: HTMLElement): void {
	if (reducedMotion()) return;

	const count = 8;
	for (let i = 0; i < count; i++) {
		const piece = document.createElement('span');
		piece.style.position = 'absolute';
		piece.style.left = '50%';
		piece.style.top = '50%';
		piece.style.width = '5px';
		piece.style.height = '5px';
		piece.style.borderRadius = '1px';
		piece.style.background = CONFETTI_COLORS[i % CONFETTI_COLORS.length];
		piece.style.pointerEvents = 'none';
		node.appendChild(piece);

		const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.6;
		const dist = 18 + Math.random() * 10;
		gsap.set(piece, { xPercent: -50, yPercent: -50 });
		gsap.fromTo(
			piece,
			{ x: 0, y: 0, opacity: 1, scale: 1, rotation: 0 },
			{
				x: Math.cos(angle) * dist,
				y: Math.sin(angle) * dist,
				opacity: 0,
				scale: 0.4,
				rotation: Math.random() * 240 - 120,
				duration: 0.6,
				ease: 'power2.out',
				onComplete: () => piece.remove()
			}
		);
	}
}
