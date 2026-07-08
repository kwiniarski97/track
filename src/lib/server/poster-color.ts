import sharp from 'sharp';
import { tmdbPosterUrl } from '$lib/tmdb-client';
import { hslToHex, rgbToHsl } from '$lib/color';

// Downscaling with sharp's default kernel to a single pixel averages every source
// pixel into one RGB value -- a cheap, well-known stand-in for "dominant color" that
// avoids pulling in a full palette-extraction library.
async function averagePosterRgb(posterPath: string): Promise<[number, number, number] | null> {
	const url = tmdbPosterUrl(posterPath, 'w200');
	if (!url) return null;

	const response = await fetch(url);
	if (!response.ok) return null;

	const buffer = Buffer.from(await response.arrayBuffer());
	const { data } = await sharp(buffer)
		.resize(1, 1, { fit: 'cover' })
		.raw()
		.toBuffer({ resolveWithObject: true });
	return [data[0], data[1], data[2]];
}

// A raw poster average is often too muddy or too dark/light to read well as a UI glow,
// so we keep its hue but clamp saturation and lightness into a range that stays vivid
// and visible against the app's dark background.
const MIN_SATURATION = 0.35;
const MIN_LIGHTNESS = 0.35;
const MAX_LIGHTNESS = 0.62;

/** Extracts a UI-friendly accent color from a show's poster, or null if the poster is
 * missing or the image couldn't be fetched/decoded. Never throws. */
export async function extractPosterColor(posterPath: string | null): Promise<string | null> {
	if (!posterPath) return null;
	try {
		const rgb = await averagePosterRgb(posterPath);
		if (!rgb) return null;
		const [h, s, l] = rgbToHsl(...rgb);
		const clampedS = Math.max(s, MIN_SATURATION);
		const clampedL = Math.min(Math.max(l, MIN_LIGHTNESS), MAX_LIGHTNESS);
		return hslToHex(h, clampedS, clampedL);
	} catch {
		return null;
	}
}
