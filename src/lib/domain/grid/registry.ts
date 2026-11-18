import type { ChordGrid } from './grid';

/** The live grids, with the origin (file) that defined each; empty until files are read. */
const registered = new Map<string, { grid: ChordGrid; origin: string }>();

/** Null: registered. Else the origin that already holds this id; nothing changes. */
export function registerGrid(grid: ChordGrid, origin: string): string | null {
	const known = registered.get(grid.id);
	if (known) return known.origin;
	registered.set(grid.id, { grid, origin });
	return null;
}

export function allGrids(): readonly ChordGrid[] {
	return [...registered.values()].map((entry) => entry.grid);
}

export function gridById(id: string): ChordGrid {
	const found = registered.get(id);
	if (found) return found.grid;
	throw new Error(
		`Unknown grid: ${id}${registered.size === 0 ? ' (no definition is loaded)' : ''}`
	);
}

export function clearGrids(): void {
	registered.clear();
}
