import type { DiagnosticAudioChunk } from '$lib/application/ports';
import type { DexieDiagnosticSink } from './DexieDiagnosticSink';
import { encodeWav } from './wav';
import { zipStore } from './zip';

/** A hole in the sound of a take, from the start of its WAV. */
export interface DiagnosticGap {
	atS: number;
	durationS: number;
}

/** Below this many samples, a shift between blocks is rounding, not a hole. */
const GAP_TOLERANCE_SAMPLES = 1;

/**
 * The blocks laid end to end from the first one's audio time; a hole between two blocks is
 * filled with silence and listed.
 */
export function joinChunks(chunks: readonly DiagnosticAudioChunk[]): {
	sampleRate: number;
	audioStartTime: number;
	samples: Int16Array;
	gaps: DiagnosticGap[];
} | null {
	if (chunks.length === 0) return null;
	const sorted = [...chunks].sort((a, b) => a.audioTime - b.audioTime);
	const { sampleRate, audioTime: audioStartTime } = sorted[0];
	const gaps: DiagnosticGap[] = [];
	const placed: { at: number; samples: Int16Array }[] = [];
	let length = 0;
	for (const chunk of sorted) {
		const offset = Math.round((chunk.audioTime - audioStartTime) * sampleRate);
		if (offset - length > GAP_TOLERANCE_SAMPLES) {
			gaps.push({ atS: length / sampleRate, durationS: (offset - length) / sampleRate });
			length = offset;
		}
		placed.push({ at: length, samples: chunk.samples });
		length += chunk.samples.length;
	}
	const samples = new Int16Array(length);
	for (const { at, samples: part } of placed) samples.set(part, at);
	return { sampleRate, audioStartTime, samples, gaps };
}

/** `2026-10-07T10:15:30.250Z` → `2026-10-07T10-15-30.250Z`: a folder name every system accepts. */
function folderOf(startedAt: number): string {
	return `prises/${new Date(startedAt).toISOString().replace(/:/g, '-')}`;
}

/**
 * The diagnostic export: the usual learning backup, then for each take its row (with the holes
 * of its sound), its sound as a 16-bit WAV when it has any, and its events, one JSON per line.
 */
export async function buildDiagnosticArchive(
	journal: Pick<DexieDiagnosticSink, 'takes' | 'eventsOf' | 'audioOf'>,
	learning: unknown,
	modified: Date = new Date()
): Promise<Uint8Array> {
	const encoder = new TextEncoder();
	const files: { path: string; bytes: Uint8Array }[] = [
		{ path: 'apprentissage.json', bytes: encoder.encode(JSON.stringify(learning)) }
	];
	for (const take of await journal.takes()) {
		const folder = folderOf(take.startedAt);
		const sound = joinChunks(await journal.audioOf(take.id));
		const row = { ...take, audioStartTime: sound?.audioStartTime ?? null, gaps: sound?.gaps ?? [] };
		files.push({
			path: `${folder}/prise.json`,
			bytes: encoder.encode(JSON.stringify(row, null, 2))
		});
		if (sound) {
			files.push({
				path: `${folder}/audio.wav`,
				bytes: encodeWav(sound.sampleRate, sound.samples)
			});
		}
		const events = await journal.eventsOf(take.id);
		const lines = events.map((event) => `${JSON.stringify(event)}\n`).join('');
		files.push({ path: `${folder}/evenements.jsonl`, bytes: encoder.encode(lines) });
	}
	return zipStore(files, modified);
}
