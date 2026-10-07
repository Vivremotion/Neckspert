import type { DiagnosticAudioChunk } from '$lib/application/ports';
import type { DexieDiagnosticSink } from './DexieDiagnosticSink';
import { pcmBytes, wavHeader } from './wav';
import { ZipWriter } from './zip';

/** A hole in the sound of a take, from the start of its WAV. */
export interface DiagnosticGap {
	atS: number;
	durationS: number;
}

/** Below this many samples, a shift between blocks is rounding, not a hole. */
const GAP_TOLERANCE_SAMPLES = 1;

/**
 * The blocks laid end to end from the first one's audio time, as WAV parts that point at the
 * blocks without copying them; a hole between two blocks is filled with silence and listed.
 */
export function layoutChunks(chunks: readonly DiagnosticAudioChunk[]): {
	sampleRate: number;
	audioStartTime: number;
	sampleCount: number;
	parts: Uint8Array[];
	gaps: DiagnosticGap[];
} | null {
	if (chunks.length === 0) return null;
	const sorted = [...chunks].sort((a, b) => a.audioTime - b.audioTime);
	const { sampleRate, audioTime: audioStartTime } = sorted[0];
	const gaps: DiagnosticGap[] = [];
	const parts: Uint8Array[] = [];
	let length = 0;
	for (const chunk of sorted) {
		const offset = Math.round((chunk.audioTime - audioStartTime) * sampleRate);
		if (offset - length > GAP_TOLERANCE_SAMPLES) {
			gaps.push({ atS: length / sampleRate, durationS: (offset - length) / sampleRate });
			parts.push(new Uint8Array((offset - length) * 2));
			length = offset;
		}
		parts.push(pcmBytes(chunk.samples));
		length += chunk.samples.length;
	}
	return { sampleRate, audioStartTime, sampleCount: length, parts, gaps };
}

/** `2026-10-07T10:15:30.250Z` → `2026-10-07T10-15-30.250Z`: a folder name every system accepts. */
function folderOf(startedAt: number): string {
	return `prises/${new Date(startedAt).toISOString().replace(/:/g, '-')}`;
}

/**
 * The diagnostic export: the usual learning backup, then for each take its row (with the holes
 * of its sound), its sound as a 16-bit WAV when it has any, and its events, one JSON per line.
 * Built take by take into a Blob, so only one take's sound is held in memory at a time.
 */
export async function buildDiagnosticArchive(
	journal: Pick<DexieDiagnosticSink, 'takes' | 'eventsOf' | 'audioOf'>,
	learning: unknown,
	modified: Date = new Date()
): Promise<Blob> {
	const encoder = new TextEncoder();
	const zip = new ZipWriter(modified);
	zip.add('apprentissage.json', [encoder.encode(JSON.stringify(learning))]);
	for (const take of await journal.takes()) {
		const folder = folderOf(take.startedAt);
		const sound = layoutChunks(await journal.audioOf(take.id));
		const row = { ...take, audioStartTime: sound?.audioStartTime ?? null, gaps: sound?.gaps ?? [] };
		zip.add(`${folder}/prise.json`, [encoder.encode(JSON.stringify(row, null, 2))]);
		if (sound) {
			zip.add(`${folder}/audio.wav`, [
				wavHeader(sound.sampleRate, sound.sampleCount),
				...sound.parts
			]);
		}
		const events = await journal.eventsOf(take.id);
		const lines = events.map((event) => `${JSON.stringify(event)}\n`).join('');
		zip.add(`${folder}/evenements.jsonl`, [encoder.encode(lines)]);
	}
	return zip.finish();
}
