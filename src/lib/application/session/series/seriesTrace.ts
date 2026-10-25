import {
	TraceBuilder,
	type Segment,
	type SegmentFields,
	type SegmentRole
} from '$lib/domain/session';

/**
 * The trace of a series of rounds (`TraceBuilder`): the series, then one segment at a time inside
 * it (a rest, a counted bar, a round), each ended where the next begins, and the stops (a pause,
 * an instruction) until play resumes. Written as things begin, never ahead.
 */
export class SeriesTrace {
	private readonly builder: TraceBuilder;
	private readonly series: number;
	private leaf: number | null = null;
	private stop: number | null = null;

	constructor(startS: number) {
		this.builder = new TraceBuilder(startS);
		this.series = this.builder.open('series', startS);
	}

	tree(): Segment {
		return this.builder.tree();
	}

	/** Opens a segment of the series at `time`, ending the one before there; returns its id. */
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

	/** A pause or an instruction, until `resume`. */
	openStop(role: 'pause' | 'briefing', time: number): void {
		if (this.stop !== null) return;
		this.end(time);
		this.stop = this.builder.open(role, time);
	}

	closeStop(time: number): void {
		if (this.stop === null) return;
		this.builder.close(this.stop, Math.max(time, this.builder.startOf(this.stop)));
		this.stop = null;
	}

	/** Ends the series, with why. */
	close(time: number, reason: 'time' | 'quit'): void {
		this.builder.set(this.series, { reason });
		this.builder.closeAll(Math.max(time, this.builder.tree().endS), 'done');
	}
}
