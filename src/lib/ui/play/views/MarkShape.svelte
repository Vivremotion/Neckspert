<script lang="ts">
	import type { MarkKind } from './figure';

	/** The shape of a mark, centred on its parent's left edge: each kind its own, never colour alone. */
	let { kind }: { kind: MarkKind } = $props();
</script>

<span class="shape {kind}" aria-hidden="true"></span>

<style>
	.shape {
		--centred: translateX(-50%) scale(var(--mark-scale, 1));
		position: absolute;
		top: 2px;
		left: 0;
		display: block;
		box-sizing: border-box;
		transform: var(--centred);
		transform-origin: top center;
	}

	.on-time {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: var(--np-shade);
	}

	.early,
	.late {
		width: 0;
		height: 0;
		border-block: 8px solid transparent;
	}

	.early {
		border-inline-end: 12px solid var(--np-ink);
	}

	.late {
		border-inline-start: 12px solid var(--np-ink);
	}

	.missed {
		top: 0;
		width: 16px;
		height: 16px;
		border: 3px solid var(--np-ink);
		border-radius: 50%;
	}

	/* A wrong note in place: a cross on its note, neither a hole (missed) nor a diamond (extra). */
	.wrong-pitch {
		width: 16px;
		height: 16px;
		background:
			linear-gradient(
				45deg,
				transparent calc(50% - 2px),
				var(--np-ink) calc(50% - 2px),
				var(--np-ink) calc(50% + 2px),
				transparent calc(50% + 2px)
			),
			linear-gradient(
				-45deg,
				transparent calc(50% - 2px),
				var(--np-ink) calc(50% - 2px),
				var(--np-ink) calc(50% + 2px),
				transparent calc(50% + 2px)
			);
	}

	.extra {
		width: 12px;
		height: 12px;
		margin-block: 2px;
		border: 3px solid var(--np-ink);
		transform: var(--centred) rotate(45deg);
		transform-origin: center;
	}
</style>
