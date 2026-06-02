from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "screenshot" / "linkedin-icon-states.png"

W, H = 1080, 1350
PAD_X = 76

FONT_REGULAR = Path("C:/Windows/Fonts/segoeui.ttf")
FONT_BOLD = Path("C:/Windows/Fonts/segoeuib.ttf")
FONT_SEMIBOLD = Path("C:/Windows/Fonts/segoeuisb.ttf")


def font(path, size):
    if path.exists():
        return ImageFont.truetype(str(path), size)
    return ImageFont.truetype(str(FONT_BOLD if path == FONT_SEMIBOLD else FONT_REGULAR), size)


def rounded(draw, xy, radius, fill, outline=None, width=1):
    draw.rounded_rectangle(xy, radius=radius, fill=fill, outline=outline, width=width)


def shadowed_box(base, xy, radius, fill, shadow=(29, 43, 68, 30), offset=(0, 7), blur=14):
    layer = Image.new("RGBA", base.size, (0, 0, 0, 0))
    layer_draw = ImageDraw.Draw(layer)
    sx1, sy1, sx2, sy2 = xy
    ox, oy = offset
    layer_draw.rounded_rectangle((sx1 + ox, sy1 + oy, sx2 + ox, sy2 + oy), radius=radius, fill=shadow)
    layer = layer.filter(ImageFilter.GaussianBlur(blur))
    base.alpha_composite(layer)
    ImageDraw.Draw(base).rounded_rectangle(xy, radius=radius, fill=fill)


def text_width(draw, text, fnt):
    box = draw.textbbox((0, 0), text, font=fnt)
    return box[2] - box[0]


def fit_text(draw, text, fnt, max_width):
    if text_width(draw, text, fnt) <= max_width:
        return text
    ellipsis = "..."
    low, high = 0, len(text)
    while low < high:
        mid = (low + high + 1) // 2
        if text_width(draw, text[:mid] + ellipsis, fnt) <= max_width:
            low = mid
        else:
            high = mid - 1
    return text[:low].rstrip() + ellipsis


def draw_address_bar(base, x, y, w, h, icon_path, url, tint):
    draw = ImageDraw.Draw(base)

    # Browser shell
    shadowed_box(base, (x, y, x + w, y + h), 18, (255, 255, 255, 255), shadow=(24, 38, 61, 28), blur=10)
    top_h = 0
    rounded(draw, (x, y, x + w, y + h), 18, (255, 255, 255, 255), outline=(219, 226, 238), width=1)

    # URL pill
    url_x = x + 20
    url_y = y + 11
    url_w = w - 76
    url_h = h - 22
    rounded(draw, (url_x, url_y, url_x + url_w, url_y + url_h), 13, (246, 248, 251), outline=(224, 230, 239), width=1)

    lock_x = url_x + 18
    lock_y = url_y + 10
    draw.rounded_rectangle((lock_x, lock_y + 7, lock_x + 13, lock_y + 20), radius=3, fill=(114, 126, 145))
    draw.arc((lock_x + 2, lock_y, lock_x + 11, lock_y + 13), 180, 360, fill=(114, 126, 145), width=2)

    url_font = font(FONT_REGULAR, 20)
    url_text = fit_text(draw, url, url_font, url_w - 74)
    draw.text((url_x + 42, url_y + 9), url_text, font=url_font, fill=(65, 77, 96))

    # Toolbar icon slot
    icon_slot = 34
    ix = x + w - 49
    iy = y + 14
    rounded(draw, (ix - 6, iy - 6, ix + icon_slot + 6, iy + icon_slot + 6), 13, tint, outline=(221, 227, 237), width=1)
    icon = Image.open(icon_path).convert("RGBA").resize((icon_slot, icon_slot), Image.Resampling.LANCZOS)
    base.alpha_composite(icon, (ix, iy))


def draw_status_row(base, idx, row, x, y, w, h):
    draw = ImageDraw.Draw(base)
    label_font = font(FONT_SEMIBOLD, 24)
    note_font = font(FONT_REGULAR, 16)
    badge_font = font(FONT_SEMIBOLD, 15)

    bg = row["bg"]
    rounded(draw, (x, y, x + w, y + h), 22, bg, outline=row["outline"], width=1)

    badge = f"{idx:02d}"
    badge_w = 48
    badge_h = 28
    rounded(draw, (x + 18, y + 14, x + 18 + badge_w, y + 14 + badge_h), 14, row["badge"], None)
    draw.text((x + 18 + (badge_w - text_width(draw, badge, badge_font)) / 2, y + 17), badge, font=badge_font, fill=(255, 255, 255))

    label_x = x + 82
    label = fit_text(draw, row["label"], label_font, w - 108)
    note = fit_text(draw, row["note"], note_font, w - 108)
    draw.text((label_x, y + 10), label, font=label_font, fill=(26, 38, 57))
    draw.text((label_x, y + 40), note, font=note_font, fill=(86, 101, 121))

    draw_address_bar(base, x + 18, y + 66, w - 36, 56, row["icon"], row["url"], row["tint"])


def main():
    base = Image.new("RGBA", (W, H), (244, 247, 251, 255))
    draw = ImageDraw.Draw(base)

    # Subtle LinkedIn-friendly canvas without plugin branding.
    draw.rectangle((0, 0, W, H), fill=(244, 247, 251))

    title_font = font(FONT_BOLD, 50)
    subtitle_font = font(FONT_REGULAR, 24)
    eyebrow_font = font(FONT_SEMIBOLD, 18)

    draw.text((PAD_X, 48), "Was zeigt das AddOn Icon?", font=title_font, fill=(20, 32, 50))
    draw.text((PAD_X, 108), "Indexierbarkeit und JavaScript-Änderungen auf einen Blick", font=subtitle_font, fill=(75, 89, 109))

    legend_y = 154
    legend = [
        ((28, 166, 80), "indexierbar"),
        ((224, 55, 64), "nicht indexierbar"),
        ((255, 198, 37), "Content geändert"),
    ]
    lx = PAD_X
    for color, txt in legend:
        draw.rounded_rectangle((lx, legend_y, lx + 18, legend_y + 18), radius=5, fill=color)
        draw.text((lx + 28, legend_y - 5), txt, font=eyebrow_font, fill=(88, 101, 120))
        lx += text_width(draw, txt, eyebrow_font) + 68

    icon_dir = ROOT / "icons" / "status"
    rows = [
        {
            "label": "Indexierbar, keine Änderung durch JavaScript",
            "note": "Quelltext und gerenderter DOM bleiben SEO-seitig gleich.",
            "icon": icon_dir / "indexable-no-js-diff-128.png",
            "url": "https://www.beispiel.de/",
            "bg": (255, 255, 255, 255),
            "outline": (219, 230, 243),
            "badge": (25, 143, 74),
            "tint": (236, 248, 241),
        },
        {
            "label": "Nicht indexierbar, keine Änderung durch JavaScript",
            "note": "Der nicht indexierbare Status bleibt auch nach dem Rendern bestehen.",
            "icon": icon_dir / "not-indexable-no-js-diff-128.png",
            "url": "https://www.beispiel.de/noindex",
            "bg": (255, 255, 255, 255),
            "outline": (238, 223, 225),
            "badge": (199, 45, 55),
            "tint": (253, 239, 240),
        },
        {
            "label": "Indexierbar, Content durch JavaScript geändert",
            "note": "SEO-Inhalte wie Title, Description, H1 oder Hreflang weichen ab.",
            "icon": icon_dir / "indexable-content-diff-128.png",
            "url": "https://www.beispiel.de/content",
            "bg": (255, 255, 255, 255),
            "outline": (232, 225, 199),
            "badge": (25, 143, 74),
            "tint": (255, 249, 225),
        },
        {
            "label": "Nicht indexierbar, Content durch JavaScript geändert",
            "note": "Content ändert sich, die Seite bleibt dennoch nicht indexierbar.",
            "icon": icon_dir / "not-indexable-content-diff-128.png",
            "url": "https://www.beispiel.de/noindex-content",
            "bg": (255, 255, 255, 255),
            "outline": (239, 224, 204),
            "badge": (199, 45, 55),
            "tint": (255, 248, 226),
        },
        {
            "label": "Indexierbar im Quelltext, per JavaScript nicht indexierbar",
            "note": "Nach dem Rendern kippt ein Indexierungssignal auf noindex/off-site.",
            "icon": icon_dir / "indexable-index-diff-128.png",
            "url": "https://www.beispiel.de/js-noindex",
            "bg": (255, 255, 255, 255),
            "outline": (230, 220, 224),
            "badge": (25, 143, 74),
            "tint": (249, 238, 240),
        },
        {
            "label": "Nicht indexierbar im Quelltext, per JavaScript indexierbar",
            "note": "JavaScript macht die Seite erst im gerenderten DOM indexierbar.",
            "icon": icon_dir / "not-indexable-index-diff-128.png",
            "url": "https://www.beispiel.de/js-indexierbar",
            "bg": (255, 255, 255, 255),
            "outline": (218, 232, 224),
            "badge": (199, 45, 55),
            "tint": (235, 248, 240),
        },
        {
            "label": "Indexierbar, Content und Indexierung ändern sich",
            "note": "Inhalte ändern sich und die Indexierbarkeit kippt durch JavaScript.",
            "icon": icon_dir / "indexable-content-index-diff-128.png",
            "url": "https://www.beispiel.de/js-content-noindex",
            "bg": (255, 255, 255, 255),
            "outline": (232, 222, 202),
            "badge": (25, 143, 74),
            "tint": (255, 248, 224),
        },
        {
            "label": "Nicht indexierbar, Content und Indexierung ändern sich",
            "note": "Content ändert sich und JavaScript verändert den Indexierungsstatus.",
            "icon": icon_dir / "not-indexable-content-index-diff-128.png",
            "url": "https://www.beispiel.de/js-content-index",
            "bg": (255, 255, 255, 255),
            "outline": (232, 222, 202),
            "badge": (199, 45, 55),
            "tint": (255, 248, 224),
        },
    ]

    row_h = 136
    gap = 9
    y0 = 194
    for i, row in enumerate(rows, start=1):
        draw_status_row(base, i, row, PAD_X, y0 + (i - 1) * (row_h + gap), W - PAD_X * 2, row_h)

    base.convert("RGB").save(OUT, quality=96, optimize=True)
    print(OUT)


if __name__ == "__main__":
    main()
