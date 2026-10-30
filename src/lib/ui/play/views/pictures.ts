import type { Component } from 'svelte';
import type { Picture } from '$lib/application/presentation/pictures';
import type { ChordDiagramStyle } from '$lib/domain/types';
import NeckPicture from './NeckPicture.svelte';
import ShapePicture from './ShapePicture.svelte';
import StringPicture from './StringPicture.svelte';

/** What a view draws a picture with: the picture, the style of chord diagrams, its size. */
export interface PictureProps {
	picture: Picture;
	chordDiagram: ChordDiagramStyle;
	/** 'aid' under a prompt; 'small' side by side in a miss. */
	size?: 'aid' | 'small';
}

/** The only place that maps a kind of picture to what draws it. */
export const PICTURE_VIEWS: Record<Picture['kind'], Component<PictureProps>> = {
	string: StringPicture,
	shape: ShapePicture,
	neck: NeckPicture
};
