/** Gauss–Jordan solve of a small dense system; null when singular. */
function solve(a: number[][], b: number[]): number[] | null {
	const n = b.length;
	const m = a.map((row, i) => [...row, b[i]]);
	for (let c = 0; c < n; c++) {
		let pivot = c;
		for (let r = c + 1; r < n; r++) if (Math.abs(m[r][c]) > Math.abs(m[pivot][c])) pivot = r;
		if (Math.abs(m[pivot][c]) < 1e-12) return null;
		[m[c], m[pivot]] = [m[pivot], m[c]];
		for (let r = 0; r < n; r++) {
			if (r === c) continue;
			const f = m[r][c] / m[c][c];
			for (let k = c; k <= n; k++) m[r][k] -= f * m[c][k];
		}
	}
	return m.map((row, i) => row[n] / row[i]);
}

/**
 * Lawson–Hanson non-negative least squares on the normal equations: minimises ½xᵀGx − bᵀx with
 * x ≥ 0, where G is the Gram matrix of the atoms and b their projections on the target.
 */
export function nnls(gram: number[][], projections: number[]): number[] {
	const p = projections.length;
	const x = new Array<number>(p).fill(0);
	const passive = new Array<boolean>(p).fill(false);
	for (let outer = 0; outer < 4 * p; outer++) {
		const w = projections.map((bi, i) => bi - gram[i].reduce((s, g, j) => s + g * x[j], 0));
		let j = -1;
		let best = 1e-10;
		for (let i = 0; i < p; i++) {
			if (!passive[i] && w[i] > best) {
				best = w[i];
				j = i;
			}
		}
		if (j < 0) break;
		passive[j] = true;
		for (let inner = 0; inner < 4 * p; inner++) {
			const idx = passive.flatMap((on, i) => (on ? [i] : []));
			const z = solve(
				idx.map((r) => idx.map((c) => gram[r][c])),
				idx.map((r) => projections[r])
			);
			if (!z) {
				passive[j] = false;
				break;
			}
			if (z.every((v) => v > 0)) {
				x.fill(0);
				idx.forEach((r, k) => (x[r] = z[k]));
				break;
			}
			let alpha = Infinity;
			idx.forEach((r, k) => {
				if (z[k] <= 0) alpha = Math.min(alpha, x[r] / (x[r] - z[k]));
			});
			idx.forEach((r, k) => (x[r] += alpha * (z[k] - x[r])));
			idx.forEach((r) => {
				if (x[r] <= 1e-12) {
					x[r] = 0;
					passive[r] = false;
				}
			});
		}
	}
	return x;
}
