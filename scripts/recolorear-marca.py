"""Genera las variantes de color del logo e íconos YAVI para profesional (verde azulado) y admin (violeta).
Mueve solo los tonos naranja/amarillo/rojo-naranja; el azul y los blancos quedan igual. NO toca los originales:
lee public/brand/*.jpg|png (naranja) y escribe public/brand/<app>/ con los mismos nombres.
Uso: python scripts/recolorear-marca.py   (requiere Pillow y numpy)"""
import colorsys, os
import numpy as np
from PIL import Image

BASE = {'profesional': 200, 'admin': 255}  # tono destino (grados) para el naranja
ARCHIVOS = ['yavi-logo.jpg', 'yavi-icono.jpg', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png', 'favicon-64.png']
RAIZ = os.path.join(os.path.dirname(__file__), '..', 'public', 'brand')

def rgb_a_hsv(a):
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    mx, mn = a.max(-1), a.min(-1)
    d = mx - mn
    h = np.zeros_like(mx)
    m = d > 1e-9
    rc = m & (mx == r); gc = m & (mx == g) & ~rc; bc = m & ~rc & ~gc
    h[rc] = ((g - b)[rc] / d[rc]) % 6
    h[gc] = (b - r)[gc] / d[gc] + 2
    h[bc] = (r - g)[bc] / d[bc] + 4
    s = np.where(mx > 0, d / np.where(mx > 0, mx, 1), 0)
    return h * 60, s, mx

def hsv_a_rgb(h, s, v):
    h6 = (h % 360) / 60
    i = np.floor(h6).astype(int) % 6
    f = h6 - np.floor(h6)
    p, q, t = v * (1 - s), v * (1 - s * f), v * (1 - s * (1 - f))
    out = np.zeros(h.shape + (3,))
    for k, (r, g, b) in enumerate([(v, t, p), (q, v, p), (p, v, t), (p, q, v), (t, p, v), (v, p, q)]):
        m = i == k
        out[m] = np.stack([r[m], g[m], b[m]], -1)
    return out

def recolorear(img, base):
    a = np.asarray(img.convert('RGB'), dtype=np.float64) / 255
    h, s, v = rgb_a_hsv(a)
    hn = np.where(h > 340, h - 360, h)
    m = (hn < 65) & (s > 0.15)
    h2 = np.where(m, base + 0.5 * np.clip(hn, -20, 65), h)
    return Image.fromarray((hsv_a_rgb(h2, s, v) * 255).round().astype(np.uint8))

for app, base in BASE.items():
    os.makedirs(os.path.join(RAIZ, app), exist_ok=True)
    for f in ARCHIVOS:
        im = recolorear(Image.open(os.path.join(RAIZ, f)), base)
        destino = os.path.join(RAIZ, app, f)
        im.save(destino, quality=92) if f.endswith('.jpg') else im.save(destino)
        print('ok', app, f)
