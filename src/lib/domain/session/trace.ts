import type { Aid, CycleFailure } from '$lib/domain/time';

/** What a stretch of a session was, with the word the screen uses for it (spec amendment 2026-10-17). */
export const SEGMENT_ROLES = [
	'session',
	'series',
	'run',
	'listen-in',
	'rest',
	'count-in',
	'round',
	'listen',
	'breath',
	'briefing',
	'pause'
] as const;
export type SegmentRole = (typeof SEGMENT_ROLES)[number];

/** Why a series ended on its own: its time was spent, or « On change d’air ». */
export type SeriesEnd = 'time' | 'change-of-air';

export interface SegmentFields {
	exerciseId?: string;
	item?: string;
	level?: number;
	attemptId?: number;
	aids?: Aid[];
	/** On a series: why it ended. */
	reason?: SeriesEnd | 'quit';
	/** On a series ended by « On change d’air »: the measure that breaks. */
	breaking?: CycleFailure;
}

/**
 * A stretch of what happened in a session. Segments nest: two of them are disjoint or one holds
 * the other. Times are seconds of the audio clock, the one clock of the whole session.
 */
export interface Segment extends SegmentFields {
	id: number;
	role: SegmentRole;
	startS: number;
	/** The real end, a cut included. */
	endS: number;
	ended: 'done' | 'interrupted';
	children: Segment[];
}

interface Node extends SegmentFields {
	id: number;
	role: SegmentRole;
	startS: number;
	endS: number | null;
	ended: 'done' | 'interrupted';
	children: Node[];
}

/**
 * Builds the trace of a session as it is played: a segment opens when it starts and closes when
 * it ends, so nothing planned but never played enters it.
 */
export class TraceBuilder {
	private readonly root: Node;
	private readonly byId = new Map<number, Node>();
	/** Open segments, outermost first. */
	private readonly opened: Node[] = [];
	private nextId = 1;
	private latest: number;

	constructor(startS: number) {
		this.root = this.node(0, 'session', startS, {});
		this.byId.set(0, this.root);
		this.opened.push(this.root);
		this.latest = startS;
	}

	/** Opens a segment inside the innermost open one; returns its id. */
	open(role: SegmentRole, startS: number, fields: SegmentFields = {}): number {
		const parent = this.opened[this.opened.length - 1];
		if (!parent) throw new RangeError('the trace is closed');
		if (startS < parent.startS) {
			throw new RangeError(
				`a ${role} cannot start before its ${parent.role} (${startS} < ${parent.startS})`
			);
		}
		const node = this.node(this.nextId++, role, startS, fields);
		parent.children.push(node);
		this.byId.set(node.id, node);
		this.opened.push(node);
		this.see(startS);
		return node.id;
	}

	/** When segment `id` started. */
	startOf(id: number): number {
		const node = this.byId.get(id);
		if (!node) throw new RangeError(`no segment ${id}`);
		return node.startS;
	}

	set(id: number, fields: SegmentFields): void {
		const node = this.byId.get(id);
		if (!node) throw new RangeError(`no segment ${id}`);
		Object.assign(node, fields);
	}

	/** Closes segment `id` and, first, its open children, cut as interrupted. */
	close(id: number, endS: number, ended: 'done' | 'interrupted' = 'done'): void {
		const at = this.opened.findIndex((node) => node.id === id);
		if (at < 0) return;
		const node = this.opened[at];
		if (endS < node.startS) {
			throw new RangeError(`a ${node.role} cannot end before it starts (${endS} < ${node.startS})`);
		}
		while (this.opened.length > at + 1) {
			const child = this.opened.pop() as Node;
			child.endS = endS;
			child.ended = 'interrupted';
		}
		this.opened.pop();
		node.endS = endS;
		node.ended = ended;
		this.see(endS);
	}

	closeAll(endS: number, ended: 'done' | 'interrupted'): void {
		const inner = this.opened[1];
		if (inner) this.close(inner.id, endS, ended);
		if (this.opened[0] === this.root) this.close(0, endS, ended);
	}

	/** A copy; open segments end at the latest instant seen. */
	tree(): Segment {
		const copy = (node: Node): Segment => ({
			...node,
			endS: node.endS ?? this.latest,
			children: node.children.map(copy)
		});
		return copy(this.root);
	}

	private node(id: number, role: SegmentRole, startS: number, fields: SegmentFields): Node {
		return { ...fields, id, role, startS, endS: null, ended: 'done', children: [] };
	}

	private see(time: number): void {
		if (time > this.latest) this.latest = time;
	}
}
