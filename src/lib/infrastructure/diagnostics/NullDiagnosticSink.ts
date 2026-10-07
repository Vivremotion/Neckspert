import type {
	DiagnosticAudioChunk,
	DiagnosticSink,
	DiagnosticTakeOpening,
	DiagnosticTakes
} from '$lib/application/ports';

/** The journal turned off for good: producers see it disabled and prepare nothing. */
export class NullDiagnosticSink implements DiagnosticSink, DiagnosticTakes {
	readonly enabled = false;

	event(_kind: string, _audioTime: number, _data: unknown): void {}

	audio(_chunk: DiagnosticAudioChunk): void {}

	async openTake(_take: DiagnosticTakeOpening): Promise<void> {}

	async closeTake(_endedAt: number): Promise<void> {}
}
