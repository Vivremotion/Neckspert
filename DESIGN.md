# Neckspert Play

Game Boy cartridge in the guitar's four measured tones. The play screen is the first surface of that world.

## Palette

- Ground `#E99568`
- Mid `#BE6754`
- Shade `#813B2A`
- Ink `#451218`

A fifth tone is a checkerboard of two adjacent tones. No other hues.

## Type

Pixel capitals. The ranked face is Oxanium 700. The prompt letter is drawn as block pixels from the current note, not a baked F.

## Space

8 px tile. Frames are ink borders, doubled on the verdict box. The lane runs under the prompt on a phone, and the verdict box sits over the right side.

## Motion

The lane follows the audio beat index each frame. A verdict imprints with a 120 ms scale. `prefers-reduced-motion` drops that pop.
