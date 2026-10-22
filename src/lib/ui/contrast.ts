/** WCAG 2.x contrast ratio between two `#RRGGBB` colors. */

function channel(value: number): number {
	const c = value / 255;
	return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
	const match = /^#([0-9a-f]{6})$/i.exec(hex);
	if (!match) throw new Error(`Expected #RRGGBB, got ${hex}`);
	const n = parseInt(match[1], 16);
	return (
		0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255)
	);
}

export function contrastRatio(foreground: string, background: string): number {
	const a = luminance(foreground);
	const b = luminance(background);
	return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}
