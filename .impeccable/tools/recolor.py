"""Snap a generated comp to an exact palette.

Usage: python3 recolor.py <in.bmp> <out.bmp> <k> <hex-dark-to-light...>
Clusters the image into k tones (k-means on a subsample), sorts clusters from
dark to light, and maps them one-to-one to the given hex colours.
"""
import random
import struct
import sys

src, dst, k = sys.argv[1], sys.argv[2], int(sys.argv[3])
targets = [tuple(int(h.lstrip('#')[i:i + 2], 16) for i in (0, 2, 4)) for h in sys.argv[4:]]
assert len(targets) == k

data = open(src, 'rb').read()
offset = struct.unpack_from('<I', data, 10)[0]
w, h = struct.unpack_from('<ii', data, 18)
bpp = struct.unpack_from('<H', data, 28)[0] // 8
H = abs(h)
row = (w * bpp + 3) // 4 * 4


def pixel(x, y):
    i = offset + y * row + x * bpp
    return data[i + 2], data[i + 1], data[i]


def luminance(c):
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]


def dist(a, b):
    return (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2


random.seed(1)
sample = [pixel(random.randrange(w), random.randrange(H)) for _ in range(20000)]
sample.sort(key=luminance)
init = [s for s in __import__('os').environ.get('INIT', '').split(',') if s]
if init:
    centres = [tuple(int(s.lstrip('#')[i:i + 2], 16) for i in (0, 2, 4)) for s in init]
else:
    centres = [sample[int((i + 0.5) * len(sample) / k)] for i in range(k)]
for _ in range(25):
    groups = [[] for _ in range(k)]
    for p in sample:
        groups[min(range(k), key=lambda j: dist(p, centres[j]))].append(p)
    centres = [tuple(sum(c[i] for c in g) / len(g) for i in range(3)) if g else centres[j]
               for j, g in enumerate(groups)]
order = sorted(range(k), key=lambda j: luminance(centres[j]))
if k == 5:
    # Letterbox black and oxblood ink have near-equal luminance; the less red one is the black.
    order[:2] = sorted(order[:2], key=lambda j: centres[j][0] - centres[j][1])
mapping = {order[rank]: targets[rank] for rank in range(k)}

out_row = (w * 3 + 3) // 4 * 4
pixels = bytearray(out_row * H)
cache = {}
for y in range(H):
    src_y = H - 1 - y if h > 0 else y
    for x in range(w):
        p = pixel(x, src_y)
        if p not in cache:
            cache[p] = mapping[min(range(k), key=lambda j: dist(p, centres[j]))]
        r, g, b = cache[p]
        i = (H - 1 - y) * out_row + x * 3
        pixels[i:i + 3] = bytes((b, g, r))

header = struct.pack('<2sIHHI', b'BM', 54 + len(pixels), 0, 0, 54)
info = struct.pack('<IiiHHIIiiII', 40, w, H, 1, 24, 0, len(pixels), 2835, 2835, 0, 0)
open(dst, 'wb').write(header + info + pixels)
print('centres dark->light:', ['#%02X%02X%02X' % tuple(int(v) for v in centres[j]) for j in order])
