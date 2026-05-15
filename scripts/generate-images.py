#!/usr/bin/env python3
"""
プロフィール画像・記事カバー画像生成スクリプト
PILを使ってnote.com用の画像を作成する
"""

from PIL import Image, ImageDraw, ImageFont, ImageFilter
import os
import sys
import math

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASSETS_DIR = os.path.join(BASE_DIR, 'assets')
PROFILE_DIR = os.path.join(ASSETS_DIR, 'profile')
COVERS_DIR = os.path.join(ASSETS_DIR, 'covers')

os.makedirs(PROFILE_DIR, exist_ok=True)
os.makedirs(COVERS_DIR, exist_ok=True)

def get_font(size, bold=False):
    """フォントを取得（システムフォントを探す）"""
    font_paths = [
        # macOS
        '/System/Library/Fonts/ヒラギノ角ゴシック W6.ttc',
        '/System/Library/Fonts/ヒラギノ角ゴシック W3.ttc',
        '/System/Library/Fonts/Hiragino Sans GB.ttc',
        '/Library/Fonts/Arial Unicode MS.ttf',
        '/System/Library/Fonts/Supplemental/Arial Unicode.ttf',
        # フォールバック
        '/System/Library/Fonts/Helvetica.ttc',
    ]
    for fp in font_paths:
        if os.path.exists(fp):
            try:
                return ImageFont.truetype(fp, size)
            except:
                continue
    return ImageFont.load_default()

def draw_rounded_rect(draw, coords, radius, fill, outline=None, outline_width=2):
    """角丸矩形を描画"""
    x1, y1, x2, y2 = coords
    draw.rounded_rectangle([x1, y1, x2, y2], radius=radius, fill=fill, outline=outline, width=outline_width)

def create_gradient(width, height, color1, color2, direction='vertical'):
    """グラデーション画像を作成"""
    img = Image.new('RGB', (width, height))
    draw = ImageDraw.Draw(img)
    for i in range(height if direction == 'vertical' else width):
        ratio = i / (height if direction == 'vertical' else width)
        r = int(color1[0] * (1 - ratio) + color2[0] * ratio)
        g = int(color1[1] * (1 - ratio) + color2[1] * ratio)
        b = int(color1[2] * (1 - ratio) + color2[2] * ratio)
        if direction == 'vertical':
            draw.line([(0, i), (width, i)], fill=(r, g, b))
        else:
            draw.line([(i, 0), (i, height)], fill=(r, g, b))
    return img

def create_profile_image():
    """
    プロフィール画像を生成
    月夜テーマのイニシャルアイコン風デザイン
    サイズ: 400x400px（note.comのプロフィール画像推奨）
    """
    import random
    W, H = 500, 500
    cx, cy = W // 2, 175   # 円の中心（上寄り）

    # ベース：深い夜空グラデーション
    img = create_gradient(W, H, (12, 8, 40), (50, 18, 75))
    draw = ImageDraw.Draw(img)

    # 星
    random.seed(42)
    for _ in range(120):
        x = random.randint(0, W)
        y = random.randint(0, H)
        r = random.choice([1, 1, 2])
        bright = random.randint(160, 255)
        draw.ellipse([x-r, y-r, x+r, y+r], fill=(bright, bright, min(bright+20, 255)))

    # 輝く星（十字形）
    star_pos = [(60, 60), (340, 90), (50, 280), (350, 260), (200, 25), (30, 430), (370, 420)]
    for sx, sy in star_pos:
        for ang in range(4):
            a = ang * math.pi / 2
            ex = sx + int(math.cos(a) * 10)
            ey = sy + int(math.sin(a) * 10)
            draw.line([(sx, sy), (ex, ey)], fill=(220, 200, 255), width=1)
        draw.ellipse([sx-2, sy-2, sx+2, sy+2], fill=(255, 250, 255))

    # 月（右上）
    moon_x, moon_y, moon_r = 310, 65, 38
    draw.ellipse([moon_x-moon_r, moon_y-moon_r, moon_x+moon_r, moon_y+moon_r],
                 fill=(255, 240, 190))
    draw.ellipse([moon_x-moon_r+8, moon_y-moon_r, moon_x+moon_r, moon_y+moon_r],
                 fill=(235, 215, 160))

    # 中央：大きな円（アバター背景）
    ring_r = 130
    # 外側グロー
    for g in range(12, 0, -1):
        draw.ellipse([cx-ring_r-g*2, cy-ring_r-g*2, cx+ring_r+g*2, cy+ring_r+g*2],
                     outline=(150, 80, 220), width=1)

    # メインの円（グラデーション背景）
    inner = create_gradient(ring_r*2, ring_r*2, (40, 15, 80), (80, 30, 120))
    mask = Image.new('L', (ring_r*2, ring_r*2), 0)
    ImageDraw.Draw(mask).ellipse([0, 0, ring_r*2, ring_r*2], fill=255)
    img.paste(inner, (cx-ring_r, cy-ring_r), mask)

    # 円の縁取り
    draw.ellipse([cx-ring_r, cy-ring_r, cx+ring_r, cy+ring_r],
                 outline=(180, 120, 255), width=3)

    # イニシャル「ル」を大きく
    init_font = get_font(110, bold=True)
    draw.text((cx+4, cy+4), 'ル', font=init_font, fill=(20, 5, 50), anchor='mm')
    draw.text((cx, cy-8), 'ル', font=init_font, fill=(235, 210, 255), anchor='mm')

    # 装飾ライン（円の下）
    line_y = cy + ring_r + 20
    for i, offset in enumerate([-15, 0, 15]):
        x1 = cx - ring_r + 30
        x2 = cx + ring_r - 30
        draw.line([(x1, line_y+offset), (x2, line_y+offset)],
                  fill=(150, 100, 200), width=max(1, 3-i))

    # 名前テキスト（円の下 + ゆとりあり）
    name_font = get_font(38, bold=True)
    sub_font = get_font(23)
    tag_font = get_font(18)

    text_start_y = cy + ring_r + 65

    # 背景パネル
    draw.rounded_rectangle([cx-145, text_start_y-10, cx+145, text_start_y+110],
                            radius=18, fill=(18, 8, 48))
    draw.rounded_rectangle([cx-143, text_start_y-8, cx+143, text_start_y+108],
                            radius=16, outline=(120, 75, 185), width=1)

    draw.text((cx, text_start_y+22), 'ルリ', font=name_font, fill=(225, 190, 255), anchor='mm')
    draw.text((cx, text_start_y+60), '副業リアル体験記', font=sub_font, fill=(165, 135, 205), anchor='mm')
    draw.text((cx, text_start_y+92), 'yorushoku_500', font=tag_font, fill=(130, 100, 165), anchor='mm')

    out_path = os.path.join(PROFILE_DIR, 'profile.png')
    img.save(out_path, 'PNG')
    print(f'✅ プロフィール画像: {out_path}')
    return out_path


def create_cover_image(title, subtitle='', genre='G1', filename=None):
    """
    記事カバー画像を生成
    note.com推奨サイズ: 1280x670px
    """
    W, H = 1280, 670

    # ジャンル別カラー
    if genre == 'G1':
        color1 = (25, 10, 60)   # 深い紫
        color2 = (70, 15, 90)   # 濃い紫
        accent = (220, 160, 255) # ラベンダー
        badge_color = (150, 80, 200)
    else:
        color1 = (10, 25, 60)
        color2 = (15, 60, 100)
        accent = (160, 210, 255)
        badge_color = (60, 130, 200)

    img = create_gradient(W, H, color1, color2, direction='horizontal')
    draw = ImageDraw.Draw(img)

    # 背景パターン（六角形グリッド風）
    import random
    random.seed(hash(title) % 1000)
    for _ in range(30):
        x = random.randint(-50, W+50)
        y = random.randint(-50, H+50)
        r = random.randint(20, 80)
        a = random.randint(5, 20)
        draw.ellipse([x-r, y-r, x+r, y+r],
                     outline=(*accent[:3], a), width=1)

    # 星（小さめ）
    for _ in range(60):
        x = random.randint(0, W)
        y = random.randint(0, H)
        r = 1
        draw.ellipse([x-r, y-r, x+r, y+r], fill=(200, 180, 255))

    # 左サイドのアクセントライン
    for i, x in enumerate([8, 14, 20]):
        h = H - 80 - i * 30
        draw.rectangle([x, H//2-h//2, x+3, H//2+h//2],
                       fill=(*accent[:3],))

    # バッジ（ジャンルラベル）
    badge_font = get_font(24)
    badge_text = '★ 副業体験レポート' if genre == 'G1' else '★ Amazon商品レビュー'
    draw.rounded_rectangle([50, 50, 350, 95], radius=20, fill=badge_color)
    draw.text((200, 72), badge_text, font=badge_font, fill=(255, 255, 255), anchor='mm')

    # メインタイトル
    title_font = get_font(58, bold=True)
    sub_font = get_font(32)

    # タイトルの折り返し処理
    max_chars = 18
    lines = []
    current = ''
    for char in title:
        current += char
        if len(current) >= max_chars or char in '｜|':
            lines.append(current.rstrip('｜|'))
            current = ''
    if current:
        lines.append(current)

    # タイトル描画（中央寄せ）
    title_y = H // 2 - (len(lines) * 70) // 2
    for i, line in enumerate(lines):
        y = title_y + i * 75
        # テキストシャドウ
        draw.text((W//2+3, y+3), line, font=title_font, fill=(0, 0, 0, 100), anchor='mm')
        draw.text((W//2, y), line, font=title_font, fill=(255, 255, 255), anchor='mm')

    # サブタイトル
    if subtitle:
        draw.text((W//2, title_y + len(lines)*75 + 20), subtitle,
                  font=sub_font, fill=accent, anchor='mm')

    # 下部バー
    draw.rectangle([0, H-60, W, H], fill=(10, 5, 30))
    footer_font = get_font(22)
    draw.text((W//2, H-30), 'ルリの副業リアル体験記 | yorushoku_500',
              font=footer_font, fill=(180, 150, 220), anchor='mm')

    # 右下に装飾
    for i in range(5):
        x = W - 80 + i*5
        draw.line([(x, H-80), (x, H-60)], fill=accent, width=2)

    if filename is None:
        filename = title[:20].replace('/', '_').replace(' ', '_') + '.png'

    out_path = os.path.join(COVERS_DIR, filename)
    img.save(out_path, 'PNG')
    print(f'✅ カバー画像: {out_path}')
    return out_path


def create_header_image():
    """
    note.comヘッダー/バナー画像を生成
    推奨サイズ: 1920×1006px
    """
    W, H = 1920, 1006
    img = create_gradient(W, H, (10, 5, 35), (55, 15, 85), direction='horizontal')
    draw = ImageDraw.Draw(img)

    import random
    random.seed(99)

    # 星
    for _ in range(200):
        x = random.randint(0, W)
        y = random.randint(0, H)
        r = random.choice([1, 1, 2])
        bright = random.randint(140, 255)
        draw.ellipse([x-r, y-r, x+r, y+r], fill=(bright, bright, min(bright+30, 255)))

    # 輝く星
    for sx, sy in [(200, 150), (1700, 200), (400, 700), (1500, 750), (960, 80), (100, 900), (1820, 850)]:
        for ang in range(4):
            a = ang * math.pi / 2
            draw.line([(sx, sy), (sx+int(math.cos(a)*18), sy+int(math.sin(a)*18))],
                      fill=(220, 200, 255), width=2)
        draw.ellipse([sx-4, sy-4, sx+4, sy+4], fill=(255, 250, 255))

    # 大きな月（右上）
    mx, my, mr = 1650, 200, 100
    draw.ellipse([mx-mr, my-mr, mx+mr, my+mr], fill=(255, 242, 195))
    draw.ellipse([mx-mr+18, my-mr, mx+mr, my+mr], fill=(238, 218, 162))

    # 装飾円（背景）
    for (cx2, cy2, cr2) in [(300, 500, 350), (1600, 500, 280), (960, 503, 500)]:
        draw.ellipse([cx2-cr2, cy2-cr2, cx2+cr2, cy2+cr2], outline=(120, 60, 180, 30), width=2)

    # 左サイドアクセント
    for i, x in enumerate([15, 25, 35]):
        h_line = H - 200 - i * 50
        draw.rectangle([x, H//2-h_line//2, x+4, H//2+h_line//2], fill=(160, 100, 220))

    # メインテキスト（中央）
    cx3 = W // 2
    cy3 = H // 2

    title_font = get_font(110, bold=True)
    sub_font = get_font(52)
    tag_font = get_font(38)

    # タイトル
    for dy, dx in [(5, 5), (0, 0)]:
        col = (20, 5, 50) if dy else (255, 255, 255)
        draw.text((cx3+dx, cy3-60+dy), 'ルリの副業リアル体験記', font=title_font, fill=col, anchor='mm')

    # サブタイトル
    draw.text((cx3, cy3+60), '顔出しなし・スマホ1台・在宅OK　チャットレディ体験を正直レポート', font=sub_font, fill=(200, 170, 240), anchor='mm')

    # タグライン
    draw.text((cx3, cy3+130), 'yorushoku_500', font=tag_font, fill=(150, 110, 190), anchor='mm')

    # 下部バー
    draw.rectangle([0, H-70, W, H], fill=(8, 4, 25))
    footer_font = get_font(32)
    draw.text((cx3, H-35), '在宅・副業・チャットレディ | 初心者が安全に稼ぐ方法を実体験から解説', font=footer_font, fill=(160, 130, 200), anchor='mm')

    out_path = os.path.join(PROFILE_DIR, 'header.png')
    img.save(out_path, 'PNG')
    print(f'✅ ヘッダー画像: {out_path}')
    return out_path


if __name__ == '__main__':
    print('🎨 画像生成中...')

    # プロフィール画像（アイコン）
    create_profile_image()

    # ヘッダー/バナー画像
    create_header_image()

    # 記事カバー画像（既存記事用）
    create_cover_image(
        title='チャットレディ始め方｜初心者が安全に稼ぐ5ステップ',
        subtitle='顔出しなし・スマホだけでOK',
        genre='G1',
        filename='G1-001-cover.png'
    )

    print('\n✨ 全画像の生成完了！')
    print(f'  プロフィールアイコン: assets/profile/profile.png')
    print(f'  ヘッダー画像:        assets/profile/header.png')
    print(f'  カバー画像:          assets/covers/G1-001-cover.png')
