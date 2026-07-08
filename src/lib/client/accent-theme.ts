import { hexToRgb, hslToHex, rgbToHsl } from '$lib/color';

/** Derives the same accent/accent-strong/accent-fg/shadow-glow set the static brand
 * palette in layout.css defines by hand, but from an arbitrary base color -- so a
 * poster-derived accent gets a readable foreground and matching glow instead of just
 * swapping one variable and leaving the rest mismatched. */
function deriveAccentPalette(hex: string) {
	const [r, g, b] = hexToRgb(hex);
	const [h, s, l] = rgbToHsl(r, g, b);

	const accentStrong = hslToHex(h, s, Math.min(l + 0.1, 0.92));
	const accentFg =
		l > 0.5 ? hslToHex(h, Math.min(s, 0.55), 0.12) : hslToHex(h, Math.min(s, 0.3), 0.95);
	const shadowGlow = `0 0 0 1px rgb(${r} ${g} ${b} / 25%), 0 8px 24px -8px rgb(${r} ${g} ${b} / 35%)`;
	const shadowGlowLg = `0 0 0 1px rgb(${r} ${g} ${b} / 20%), 0 16px 40px -12px rgb(${r} ${g} ${b} / 45%)`;

	return { accent: hex, accentStrong, accentFg, shadowGlow, shadowGlowLg };
}

const THEME_PROPERTIES = [
	'--color-accent',
	'--color-accent-strong',
	'--color-accent-fg',
	'--shadow-glow',
	'--shadow-glow-lg'
] as const;

/** Overrides the app's brand accent variables on the document root with a poster-
 * derived palette for as long as a show page showing that poster is mounted. Returns a
 * cleanup that reverts to the default brand accent -- callers should run it from an
 * `$effect` so navigating to another show (or away entirely) always restores/replaces
 * the override rather than leaking it onto unrelated pages. */
export function applyAccentTheme(hex: string | null): () => void {
	if (!hex) return () => {};

	const root = document.documentElement.style;
	const palette = deriveAccentPalette(hex);
	root.setProperty('--color-accent', palette.accent);
	root.setProperty('--color-accent-strong', palette.accentStrong);
	root.setProperty('--color-accent-fg', palette.accentFg);
	root.setProperty('--shadow-glow', palette.shadowGlow);
	root.setProperty('--shadow-glow-lg', palette.shadowGlowLg);

	return () => {
		for (const property of THEME_PROPERTIES) root.removeProperty(property);
	};
}
