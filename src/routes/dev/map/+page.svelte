<script lang="ts">
	import type { NeckMapCell } from '$lib/domain/types';
	import { STRING_NUMBERS } from '$lib/domain/music/types';
	import { LEARNABLE_FRETS, pitchOnString } from '$lib/domain/music';
	import NeckMapScreen from '$lib/ui/screens/map/NeckMapScreen.svelte';

	const cells: NeckMapCell[] = STRING_NUMBERS.flatMap((string) =>
		LEARNABLE_FRETS.map((fret) => {
			const locate =
				string === 6 && fret === 3
					? 'mastered'
					: string === 6 && fret <= 7
						? 'acquired'
						: string === 5 && fret <= 3
							? 'learning'
							: 'unseen';
			return {
				string,
				fret,
				pitch: pitchOnString(string, fret),
				locate,
				identify: locate === 'mastered' ? 'acquired' : 'unseen',
				locateLeadBeats: locate === 'unseen' ? null : locate === 'learning' ? 8 : 2,
				locateLeadMs: locate === 'unseen' ? null : locate === 'learning' ? 6000 : 1500,
				identifyMedianReactionMs: locate === 'mastered' ? 640 : null,
				coldAccuracy: null
			} satisfies NeckMapCell;
		})
	);
</script>

<NeckMapScreen {cells} onhome={() => {}} />

<style>
	:global(html),
	:global(body) {
		width: auto;
		height: auto;
		min-height: 100dvh;
		overflow: auto;
	}
</style>
