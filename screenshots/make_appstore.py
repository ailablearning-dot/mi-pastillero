#!/usr/bin/env python3
"""Compone screenshots de marketing para App Store (1290x2796) para Mi Pastillero.
v2: colores más vivos + glow, titular más grande, teléfono más grande, captura con
más nitidez/contraste. Todo sin recapturar.
"""
import os
from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageEnhance

# Relativas al propio script y no absolutas: estaban apuntando a "Proyectos Personales", que dejó
# de existir cuando el repo se movió a PP/, así que el script no arrancaba.
AQUI = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(AQUI, "originales")
OUT = os.path.join(AQUI, "appstore")
os.makedirs(OUT, exist_ok=True)

W, H = 1320, 2868
ROUNDED = "/System/Library/Fonts/SFNSRounded.ttf"

def font(size, weight):
    f = ImageFont.truetype(ROUNDED, size)
    try:
        f.set_variation_by_axes([weight])
    except Exception:
        pass
    return f

def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))

def gradient(top, bottom):
    g = Image.new("RGB", (1, H))
    px = g.load()
    for y in range(H):
        px[0, y] = lerp(top, bottom, (y / (H - 1)) ** 0.92)
    return g.resize((W, H))

def add_glow(canvas, center, radius, color, alpha):
    """Glow radial suave para dar vida al fondo."""
    glow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(glow)
    d.ellipse([center[0]-radius, center[1]-radius, center[0]+radius, center[1]+radius],
              fill=color + (alpha,))
    glow = glow.filter(ImageFilter.GaussianBlur(radius*0.55))
    return Image.alpha_composite(canvas, glow)

def rounded_mask(size, radius):
    m = Image.new("L", size, 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, size[0]-1, size[1]-1], radius=radius, fill=255)
    return m

def draw_block(draw, lines, cx, top, fnt, fill, line_gap):
    y = top
    for ln in lines:
        bbox = draw.textbbox((0, 0), ln, font=fnt)
        w = bbox[2]-bbox[0]; h = bbox[3]-bbox[1]
        draw.text((cx-w/2, y-bbox[1]), ln, font=fnt, fill=fill)
        y += h + line_gap
    return y

# top / bot = fondo; glow = tinte del brillo radial
PANELS = [
    # Los ocho de la 2.0. Los seis de julio se quedaron obsoletos: retrataban la cabecera vieja
    # (el interruptor Hoy|Mes y los tres iconos), y la guía 2.3.3 de Apple exige que los
    # screenshots reflejen la app real — no es cuestión de estética, es riesgo de rechazo.
    # El primero dice "sin crear cuenta" a propósito: es la objeción número uno de quien acaba de
    # descargar una app de salud, y desde el modelo sin muros por fin es verdad.
    dict(img="p1_hoy.PNG", top=(0xA1,0x5B,0xFF), bot=(0x5B,0x3F,0xF0),
         glow=(0xC6,0xA8,0xFF),
         head=["Nunca olvides","una dosis"],
         sub=["Sin crear cuenta.","Empiezas en un minuto"]),
    dict(img="p2_caja.PNG", top=(0xC2,0x6A,0x2B), bot=(0x7A,0x3C,0xC8),
         glow=(0xF0,0xB0,0x70),
         head=["Se te acaba la caja,","y lo sabes antes"],
         sub=["Cuenta lo que te queda y te avisa","días antes de que se acabe"]),
    dict(img="p3_historial.PNG", top=(0x8B,0x3F,0xF5), bot=(0x4B,0x3A,0xD0),
         glow=(0xB6,0x90,0xFF),
         head=["Tu adherencia,","de un vistazo"],
         sub=["Verde, naranja o rojo:","siempre sabes cómo vas"]),
    dict(img="p4_personas.PNG", top=(0xA1,0x5B,0xFF), bot=(0x5B,0x3F,0xF0),
         glow=(0xC6,0xA8,0xFF),
         head=["Cuida a toda","tu familia"],
         sub=["Una persona por perfil,","con historial propio"]),
    dict(img="p5_emergencia.PNG", top=(0xE0,0x45,0x6B), bot=(0x6D,0x2E,0xC8),
         glow=(0xFF,0x9A,0xB0),
         head=["Tu información,","el día que algo pasa"],
         sub=["Alergias y medicamentos,","listos para compartir"]),
    dict(img="p6_citas.PNG", top=(0x8B,0x3F,0xF5), bot=(0x43,0x38,0xCA),
         glow=(0xB6,0x90,0xFF),
         head=["No olvides","tus citas"],
         sub=["Con recordatorio,","para no llegar tarde"]),
    dict(img="p7_reporte.PNG", top=(0x63,0x4B,0xEA), bot=(0x3A,0x2F,0xB0),
         glow=(0x9A,0x88,0xFF),
         head=["Un reporte listo","para tu médico"],
         sub=["Exporta todo a Excel","y compártelo"]),
    dict(img="p8_oscuro.PNG", top=(0x63,0x4B,0xEA), bot=(0x0D,0x0A,0x24),
         glow=(0x8B,0x6B,0xF0),
         head=["Cuida tu vista,","día y noche"],
         sub=["Modo claro y oscuro,","automático"]),
]

CONTENT_W = 1004
BEZEL = 16
RADIUS = 100
BOTTOM_MARGIN = 40

f_head = font(130, 850)
f_sub = font(50, 580)

for i, p in enumerate(PANELS, 1):
    canvas = gradient(p["top"], p["bot"]).convert("RGBA")
    # glow detrás del teléfono para dar vida/profundidad
    canvas = add_glow(canvas, (W//2, int(H*0.46)), 720, p["glow"], 90)
    draw = ImageDraw.Draw(canvas)

    cx = W/2
    y = draw_block(draw, p["head"], cx, 138, f_head, (255,255,255,255), line_gap=8)
    y += 26
    draw_block(draw, p["sub"], cx, y, f_sub, (255,255,255,220), line_gap=10)

    # --- Screenshot con un toque de vida (color/contraste/nitidez) ---
    shot = Image.open(os.path.join(SRC, p["img"])).convert("RGB")
    shot = ImageEnhance.Color(shot).enhance(1.08)
    shot = ImageEnhance.Contrast(shot).enhance(1.03)
    shot = ImageEnhance.Sharpness(shot).enhance(1.18)
    shot = shot.convert("RGBA")
    cw = CONTENT_W
    ch = int(cw * shot.height / shot.width)
    shot = shot.resize((cw, ch), Image.LANCZOS)
    shot.putalpha(rounded_mask((cw, ch), RADIUS))

    ow, oh = cw+BEZEL*2, ch+BEZEL*2
    bezel = Image.new("RGBA", (ow, oh), (0,0,0,0))
    ImageDraw.Draw(bezel).rounded_rectangle([0,0,ow-1,oh-1], radius=RADIUS+BEZEL, fill=(15,16,22,255))
    bezel.paste(shot, (BEZEL, BEZEL), shot)

    px = (W-ow)//2
    py = H-oh-BOTTOM_MARGIN

    shadow = Image.new("RGBA", (W, H), (0,0,0,0))
    ImageDraw.Draw(shadow).rounded_rectangle([px, py+30, px+ow, py+oh+30],
                                             radius=RADIUS+BEZEL, fill=(8,6,26,165))
    shadow = shadow.filter(ImageFilter.GaussianBlur(52))
    canvas = Image.alpha_composite(canvas, shadow)
    canvas.alpha_composite(bezel, (px, py))

    out = os.path.join(OUT, f"{i:02d}_{p['img'].split('.')[0]}.png")
    canvas.convert("RGB").save(out, "PNG")
    print(f"[{i}] {out}  ({canvas.width}x{canvas.height})")

print("\nListo v2:", OUT)
