import type { CycleFailure } from '$lib/domain/time';
import {
	TraceBuilder,
	type Segment,
	type SegmentFields,
	type SegmentRole,
	type SeriesEnd
} from '$lib/domain/session';

/**
 * The trace of a series (`TraceBuilder`), shared by every controller: the series, its runs, and
 * one segment at a time inside the run under way or, between runs, inside the series (a listen-in,
 * a rest, a counted bar, a breath, a round, a listen), each ended where the next begins; then the
 * stops (a pause, an instruction) until play resumes. Written as things begin, never ahead; times
 * are seconds of the audio clock.
 */
export class SeriesTrace {
	private readonly builder: TraceBuilder;
	private readonly series: number;
	private leaf: number | null = null;
	private run: number | null = null;
	private stop: number | null = null;

	constructor(startS: number, fields: SegmentFields = {}) {
		this.builder = new TraceBuilder(startS);
		this.series = this.builder.open('series', startS, fields);
	}

	tree(): Segment {
		return this.builder.tree();
	}

	/** A run is under way: a segment opened now goes into it. */
	get running(): boolean {
		return this.run !== null;
	}

	/** Opens a run at `time`, ending the segment and the run before there; returns its id. */
	openRun(time: number, fields: SegmentFields = {}): number {
		this.endRun(time);
		this.run = this.builder.open('run', time, fields);
		return this.run;
	}

	/** Ends the run under way and its segment, if any; `'interrupted'` when cut (a pause, a quit). */
	endRun(time: number, ended: 'done' | 'interrupted' = 'done'): void {
		this.end(time, ended);
		if (this.run === null) return;
		this.builder.close(this.run, Math.max(time, this.builder.startOf(this.run)), ended);
		this.run = null;
	}

	/**
	 * Opens a segment at `time`, in the run under way or else in the series, ending the one before
	 * there; returns its id.
	 */
	open(role: SegmentRole, time: number, fields: SegmentFields = {}): number {
		this.end(time);
		this.leaf = this.builder.open(role, time, fields);
		return this.leaf;
	}

	/** Ends the segment under way, if any; `'interrupted'` when cut (a pause). */
	end(time: number, ended: 'done' | 'interrupted' = 'done'): void {
		if (this.leaf === null) return;
		this.builder.close(this.leaf, Math.max(time, this.builder.startOf(this.leaf)), ended);
		this.leaf = null;
	}

	set(id: number, fields: SegmentFields): void {
		this.builder.set(id, fields);
	}

	/** A pause or an instruction, in the series, until `closeStop`. */
	openStop(role: 'pause' | 'briefing', time: number): void {
		if (this.stop !== null) return;
		this.endRun(time);
		this.stop = this.builder.open(role, time);
	}

	closeStop(time: number): void {
		if (this.stop === null) return;
		this.builder.close(this.stop, Math.max(time, this.builder.startOf(this.stop)));
		this.stop = null;
	}

	/** Ends the series, with why, and the measure that breaks when the air changed. */
	close(time: number, reason: SeriesEnd | 'quit', breaking: CycleFailure | null = null): void {
		this.builder.set(this.series, { reason, ...(breaking && { breaking }) });
		this.builder.closeAll(Math.max(time, this.builder.tree().endS), 'done');
	}
}
