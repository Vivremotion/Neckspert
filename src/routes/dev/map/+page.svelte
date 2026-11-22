<script lang="ts">
	import type { NeckMapCell } from '$lib/domain/types';
	import { MAX_PROMPT_FRET, STRING_NUMBERS } from '$lib/domain/music/types';
	import { pitchOnString } from '$lib/domain/music';
	import NeckMapScreen from '$lib/ui/screens/map/NeckMapScreen.svelte';

	/** Frets 1 to 11, as the catalog's neck exercises list them. */
	const FRETS = Array.from({ length: MAX_PROMPT_FRET }, (_, index) => index + 1);

	const cells: NeckMapCell[] = STRING_NUMBERS.flatMap((string) =>
		FRETS.map((fret) => {
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
				locateRecallMs: locate === 'unseen' ? null : locate === 'learning' ? 6000 : 1500,
				identifyMedianReactionMs: locate === 'mastered' ? 640 : null,
				coldAccuracy: null
			} satisfies NeckMapCell;
		})
	);
</script>

<NeckMapScreen {cells} onhome={() => {}} />
