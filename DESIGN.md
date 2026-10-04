# Neckspert Play

Game Boy cartridge in the guitar's four measured tones. The play screen is the first surface of that world.

## Palette

- Ground `#E99568`
- Mid `#BE6754`
- Shade `#813B2A`
- Ink `#451218`

A fifth tone is a checkerboard of two adjacent tones. No other hues.

## Type

One face: VT323, self-hosted, weight 700. Pixel capitals. The prompt letter is drawn as block pixels from the current note, not a baked F.

Roles live in `src/lib/ui/tokens.css`. The 8 px tile is spacing, not a font size. `PixelText` `scale` maps onto these roles:

- `1` meta, 24 px — labels, trend, beat numbers
- `2` body, 32 px — instructions and buttons
- `3` title, 48 px — screen titles and the huge button
- `4` display, 64 px — the one figure
- prompt 56 px — the string under the fret in mode 2. In mode 1 the string reads at body size (32 px): the note is the only big letter, and the string shows one beat before it.
- hero 96 px — a mode-2 prompt such as « case 8 »

Reading text sits on ground (`#E99568`) with ink (`#451218`). A disabled button keeps that pairing; it does not fade.

## Space

8 px tile. Frames are ink borders, doubled on the verdict box. The lane runs under the prompt on a phone, and the verdict box sits over the right side.

While a note is learned, a drawn string sits under the mode 1 prompt: six lines in mid, the prompted one thick in ink, its letter at meta size. It is a removable aid (`STRING_DIAGRAM_AID`), never a neck to answer on.

After a miss the verdict box reads the right answer under the banner, at body size.

## Motion

The lane follows the audio beat index each frame. A verdict imprints with a 120 ms scale. `prefers-reduced-motion` drops that pop.
