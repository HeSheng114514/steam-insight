"""生成扩展图标与商店宣传图（原创图形，不使用 Valve 商标）。

输出：
  steam-insight/icons/icon-{16,32,48,128}.png     扩展内图标
  store-assets/icon-128.png                        商店图标
  store-assets/logo-300x300.png                    Edge 商店 logo
  store-assets/promo-440x280.png                   小宣传图
"""

import os
import sys
from PIL import Image, ImageDraw, ImageFont

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # 工作区根目录
ICON_DIR = os.path.join(ROOT, "steam-insight", "icons")
STORE_DIR = os.path.join(ROOT, "store-assets")

ACCENT = (102, 192, 244, 255)
ACCENT_SOFT = (102, 192, 244, 110)
INK = (227, 238, 247, 255)
MUTED = (139, 166, 186, 255)
TOP = (44, 74, 98)
BOTTOM = (23, 35, 48)


def gradient(width, height, top=TOP, bottom=BOTTOM):
    img = Image.new("RGB", (1, height))
    for y in range(height):
        t = y / max(1, height - 1)
        img.putpixel(
            (0, y),
            tuple(int(top[i] + (bottom[i] - top[i]) * t) for i in range(3)),
        )
    return img.resize((width, height))


def rounded_mask(size, radius_ratio=0.22):
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        [0, 0, size - 1, size - 1], radius=int(size * radius_ratio), fill=255
    )
    return mask


def draw_mark(size):
    """在透明画布上画放大镜标记（含镜内三条信息条）。"""
    S = size
    layer = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)

    cx, cy = S * 0.455, S * 0.435
    R = S * 0.235
    stroke = max(2, int(S * 0.075))

    # 镜内信息条（宽度递减），代表"把信息摊开看"
    bar_h = max(1, int(S * 0.052))
    for i, frac in enumerate((0.62, 0.46, 0.30)):
        w = S * frac * 0.5
        y = cy + (i - 1) * S * 0.105
        x0 = cx - w / 2
        d.rounded_rectangle(
            [x0, y - bar_h / 2, x0 + w, y + bar_h / 2],
            radius=bar_h / 2,
            fill=ACCENT,
        )

    # 镜圈
    d.ellipse([cx - R, cy - R, cx + R, cy + R], outline=ACCENT, width=stroke)

    # 手柄
    hx, hy = cx + R * 0.70, cy + R * 0.70
    tx, ty = S * 0.80, S * 0.80
    d.line([hx, hy, tx, ty], fill=ACCENT, width=int(stroke * 1.15))
    cap = int(stroke * 1.15 / 2)
    d.ellipse([tx - cap, ty - cap, tx + cap, ty + cap], fill=ACCENT)
    d.ellipse([hx - cap, hy - cap, hx + cap, hy + cap], fill=ACCENT)
    return layer


def render_icon(size):
    S = size * 8  # 8x 超采样后再缩小，保证小尺寸不糊
    base = gradient(S, S).convert("RGBA")
    icon = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    icon.paste(base, (0, 0), rounded_mask(S))
    d = ImageDraw.Draw(icon)
    inset = int(S * 0.014)
    d.rounded_rectangle(
        [inset, inset, S - 1 - inset, S - 1 - inset],
        radius=int(S * 0.207),
        outline=ACCENT_SOFT,
        width=max(1, int(S * 0.012)),
    )
    icon.alpha_composite(draw_mark(S))
    return icon.resize((size, size), Image.LANCZOS)


def load_font(size, bold=False):
    candidates = [
        r"C:\Windows\Fonts\msyhbd.ttc" if bold else r"C:\Windows\Fonts\msyh.ttc",
        r"C:\Windows\Fonts\msyh.ttc",
        r"C:\Windows\Fonts\simhei.ttf",
        r"C:\Windows\Fonts\arialbd.ttf" if bold else r"C:\Windows\Fonts\arial.ttf",
    ]
    for path in candidates:
        if os.path.exists(path):
            try:
                return ImageFont.truetype(path, size)
            except OSError:
                continue
    return ImageFont.load_default()


def render_promo(width=440, height=280):
    img = gradient(width, height, (36, 60, 82), (20, 31, 43)).convert("RGBA")
    d = ImageDraw.Draw(img)

    icon = render_icon(112)
    img.alpha_composite(icon, (32, 38))

    title_font = load_font(33, bold=True)
    sub_font = load_font(18)
    tag_font = load_font(14)

    d.text((164, 56), "Steam 洞察", font=title_font, fill=INK)
    d.text((166, 102), "买前一眼看清", font=sub_font, fill=ACCENT)

    # 标签整行铺开，按实际文字宽度排布，避免溢出画布
    tags = ["XGP", "D 加密", "家庭库", "DLC", "Steam Deck"]
    x, y, gap = 32, 164, 8
    for t in tags:
        tw = d.textlength(t, font=tag_font)
        w = tw + 18
        if x + w > width - 32:
            break
        d.rounded_rectangle(
            [x, y, x + w, y + 28], radius=6,
            fill=(13, 22, 32, 200), outline=(102, 192, 244, 170), width=1,
        )
        d.text((x + 9, y + 6), t, font=tag_font, fill=INK)
        x += w + gap

    d.text((32, 212), "商店页右侧完整面板 · 列表页逐行徽章", font=tag_font, fill=MUTED)
    d.text((32, 238), "9 个数据源 · 结果本地缓存 · 不收集个人信息", font=tag_font, fill=MUTED)
    return img


def render_logo(size=300):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    img.alpha_composite(render_icon(size))
    return img


def main():
    os.makedirs(ICON_DIR, exist_ok=True)
    os.makedirs(STORE_DIR, exist_ok=True)

    for s in (16, 32, 48, 128):
        render_icon(s).save(os.path.join(ICON_DIR, f"icon-{s}.png"))

    render_icon(128).save(os.path.join(STORE_DIR, "icon-128.png"))
    render_logo(300).save(os.path.join(STORE_DIR, "logo-300x300.png"))
    render_promo().save(os.path.join(STORE_DIR, "promo-440x280.png"))

    print("生成完成：")
    for folder in (ICON_DIR, STORE_DIR):
        for name in sorted(os.listdir(folder)):
            p = os.path.join(folder, name)
            print(f"  {os.path.relpath(p, ROOT)}  {os.path.getsize(p)} bytes")


if __name__ == "__main__":
    main()
