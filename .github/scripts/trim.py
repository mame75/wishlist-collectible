# Rogne les marges transparentes des logos (data/serie/*.png) pour qu'ils aient tous la même largeur affichée
import sys, glob
from PIL import Image
for f in glob.glob('data/serie/*.png'):
    im = Image.open(f).convert('RGBA')
    bb = im.getchannel('A').point(lambda a: 255 if a > 12 else 0).getbbox()
    if bb: im = im.crop(bb)
    im.thumbnail((640, 640))
    im.save(f, optimize=True)
    print(f, im.size)
