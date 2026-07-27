from PIL import Image, ImageDraw

FELT = (18, 59, 46)
FELT_DEEP = (12, 42, 32)
IVORY = (237, 230, 211)
SUIT = (168, 53, 44)
BRASS = (201, 162, 39)
INK = (20, 17, 13)

SS = 4  # supersample


def heart(d, cx, cy, w, color):
    r = w * 0.27
    d.ellipse([cx - w / 2, cy - w * 0.42, cx - w / 2 + 2 * r, cy - w * 0.42 + 2 * r], fill=color)
    d.ellipse([cx + w / 2 - 2 * r, cy - w * 0.42, cx + w / 2, cy - w * 0.42 + 2 * r], fill=color)
    d.polygon(
        [
            (cx - w / 2 + 0.02 * w, cy - w * 0.10),
            (cx + w / 2 - 0.02 * w, cy - w * 0.10),
            (cx, cy + w * 0.52),
        ],
        fill=color,
    )


def render(size, maskable=False):
    """maskable=True keeps all artwork inside the center 80% safe zone and
    fills the whole canvas with felt, so Android's circular crop never
    clips content or falls back to a white plate."""
    S = size * SS
    img = Image.new("RGB", (S, S), FELT)
    d = ImageDraw.Draw(img)

    # Subtle radial-ish vignette so the icon has depth at small sizes
    d.ellipse([-S * 0.1, -S * 0.1, S * 1.1, S * 1.1], fill=FELT)
    d.ellipse([S * 0.06, S * 0.06, S * 0.94, S * 0.94], fill=(20, 64, 50))

    cx, cy = S / 2, S / 2

    if maskable:
        # Safe zone is the center 80%. Keep the card comfortably inside it:
        # a squarer, smaller card so the circular mask can't clip it.
        cw = S * 0.34
        ch = cw * 1.30
    else:
        cw = S * 0.50
        ch = cw * 1.36

    box = [cx - cw / 2, cy - ch / 2, cx + cw / 2, cy + ch / 2]

    # drop shadow
    sh = S * 0.012
    d.rounded_rectangle(
        [box[0] + sh, box[1] + sh, box[2] + sh, box[3] + sh],
        radius=cw * 0.14,
        fill=FELT_DEEP,
    )

    d.rounded_rectangle(box, radius=cw * 0.14, fill=IVORY)

    inset = cw * 0.06
    d.rounded_rectangle(
        [box[0] + inset, box[1] + inset, box[2] - inset, box[3] - inset],
        radius=cw * 0.09,
        outline=(150, 143, 126),
        width=max(1, int(S * 0.004)),
    )

    heart(d, cx, cy - ch * 0.02, cw * 0.50, SUIT)

    # Brass nickel on the card's lower-right corner
    nr = cw * 0.22
    nx = box[2] - cw * 0.04
    ny = box[3] - ch * 0.05
    d.ellipse([nx - nr, ny - nr, nx + nr, ny + nr], fill=BRASS)
    d.ellipse([nx - nr, ny - nr, nx + nr, ny + nr], outline=INK, width=max(1, int(S * 0.007)))

    return img.resize((size, size), Image.LANCZOS)


render(192).save("src/icons/icon-192.png")
render(512).save("src/icons/icon-512.png")
render(512, maskable=True).save("src/icons/icon-maskable-512.png")
render(192, maskable=True).save("src/icons/icon-maskable-192.png")

# Apple touch icon: iOS applies its own rounded-rect mask and does NOT
# like transparency, so reuse the standard (non-maskable) art.
render(180).save("src/icons/apple-touch-icon.png")

print("icons written")
