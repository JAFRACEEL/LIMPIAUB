"""Íconos de instalación YAVI Profesional / YAVI Admin sobre fondo azul marino (estilo aprobado por el dueño).
Entrada: captura del ícono Profesional (naranja sobre azul). Salida (reemplaza solo los íconos de instalación): public/brand/<app>/icon-*.png, apple-touch-icon.png,
Uso: python scripts/icono-navy.py <captura.png>   (requiere Pillow y numpy)"""
import os, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ORIGEN = sys.argv[1]
RAIZ = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'public', 'brand')
FONDO = (14, 29, 78)
S = 2732 / 2000  # la captura es 2732 px de ancho y se midió en un lienzo de 2000
def d(x, y): return int(x * S), int(y * S)

src = Image.open(ORIGEN).convert('RGB')
caja = (*d(250, 100), *d(1750, 1330))
cont = src.crop(caja)                      # contenido limpio (sin botones de la captura)
L = 1500
base = Image.new('RGB', (L, L), FONDO)
base.paste(cont.resize((1500, int(1500 * cont.height / cont.width))), (0, 120))

def a_variante(img, desplaza):
    a = np.asarray(img.convert('RGB'), dtype=np.float64) / 255
    mx, mn = a.max(-1), a.min(-1); dd = mx - mn
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    h = np.zeros_like(mx); m = dd > 1e-9
    rc = m & (mx == r); gc = m & (mx == g) & ~rc; bc = m & ~rc & ~gc
    h[rc] = ((g - b)[rc] / dd[rc]) % 6; h[gc] = (b - r)[gc] / dd[gc] + 2; h[bc] = (r - g)[bc] / dd[bc] + 4
    h *= 60; s = np.where(mx > 0, dd / np.where(mx > 0, mx, 1), 0)
    hn = np.where(h > 340, h - 360, h)
    mk = (hn < 65) & (s > 0.15)
    h2 = np.where(mk, desplaza + 0.5 * np.clip(hn, -20, 65), h)
    h6 = (h2 % 360) / 60; i = np.floor(h6).astype(int) % 6; f = h6 - np.floor(h6)
    p, q, t = mx * (1 - s), mx * (1 - s * f), mx * (1 - s * (1 - f))
    out = np.zeros(a.shape)
    for k, (rr, gg, bb) in enumerate([(mx, t, p), (q, mx, p), (p, mx, t), (p, q, mx), (t, p, mx), (mx, p, q)]):
        w = i == k; out[w] = np.stack([rr[w], gg[w], bb[w]], -1)
    return Image.fromarray((out * 255).round().astype(np.uint8))

def pastilla(img, texto, c1, c2):
    # Pinta de nuevo la zona de la píldora con el fondo y dibuja una nueva con el texto.
    dr = ImageDraw.Draw(img)
    x0, y0, x1, y1 = 565 - 250, 1050 - 100, 1435 - 250, 1250 - 100  # coordenadas dentro del contenido (lienzo 1500)
    y0 += 120; y1 += 120
    dr.rectangle((x0 - 40, y0 - 40, x1 + 40, y1 + 60), fill=FONDO)
    w, h = x1 - x0, y1 - y0
    sombra = Image.new('L', (L, L), 0)
    ImageDraw.Draw(sombra).rounded_rectangle((x0, y0 + 14, x1, y1 + 14), h // 2, fill=120)
    sombra = sombra.filter(ImageFilter.GaussianBlur(14))
    img.paste(Image.new('RGB', (L, L), (4, 10, 40)), (0, 0), sombra)
    grad = Image.new('RGB', (w, h))
    gd = ImageDraw.Draw(grad)
    for yy in range(h):
        t = yy / (h - 1)
        gd.line((0, yy, w, yy), fill=tuple(int(c1[k] + (c2[k] - c1[k]) * t) for k in range(3)))
    m = Image.new('L', (w, h), 0); ImageDraw.Draw(m).rounded_rectangle((0, 0, w - 1, h - 1), h // 2, fill=255)
    img.paste(grad, (x0, y0), m)
    fuente = ImageFont.truetype('C:/Windows/Fonts/impact.ttf', 150)
    tw = dr.textlength(texto, font=fuente) + 6 * (len(texto) - 1)
    x = x0 + (w - tw) / 2
    for ch in texto:
        dr.text((x, y0 + h / 2), ch, font=fuente, fill=FONDO, anchor='lm'); x += dr.textlength(ch, font=fuente) + 6

def guardar(img, app):
    os.makedirs(os.path.join(RAIZ, app), exist_ok=True)
    for nombre, px in [('icon-512.png', 512), ('icon-192.png', 192), ('apple-touch-icon.png', 180), ('favicon-64.png', 64)]:
        img.resize((px, px), Image.LANCZOS).save(os.path.join(RAIZ, app, nombre))

guardar(a_variante(base, 165), 'profesional')  # verde azulado (el naranja es del cliente)
Image.fromarray(np.asarray(base)).resize((1024, 1024), Image.LANCZOS).save(os.path.join(RAIZ, 'profesional', 'yavi-icono-naranja-original.png'))
adm = a_variante(base, 255)
pastilla(adm, 'ADMIN', (205, 188, 255), (139, 92, 246))
guardar(adm, 'admin')
print('ok')
