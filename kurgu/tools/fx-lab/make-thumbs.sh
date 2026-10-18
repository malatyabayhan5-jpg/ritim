#!/usr/bin/env bash
# Katalogdaki her efekt için uygulamaya gömülen 144x144 önizleme görselini üretir
# ve src/model/fxThumbs.js eşlemesini yazar. Gerekli: node, ImageMagick, python3 (numpy, PIL).
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
APP="$HERE/../.."
WORK="$(mktemp -d)"
python3 "$HERE/scenes.py" "$WORK/scenes" > /dev/null
convert "$WORK/scenes/sunset.png" -crop 540x540+300+0 +repage -resize 360x360 "$WORK/a.png"
convert "$WORK/scenes/portrait.png" -crop 540x540+210+0 +repage -resize 360x360 "$WORK/b.png"
convert "$WORK/a.png" \( "$WORK/b.png" -crop 360x180+0+40 +repage \) -gravity south -composite "$WORK/thumbscene.png"
node "$HERE/lab.cjs" thumbs --scene "$WORK/thumbscene.png" --out "$WORK/thumbs"
mkdir -p "$APP/assets/fx"
for f in "$WORK"/thumbs/*.png; do
  convert "$f" -resize 144x144 -quality 82 "$APP/assets/fx/$(basename "$f" .png).jpg"
done
{
  echo "// Otomatik üretildi: tools/fx-lab/make-thumbs.sh. Elle düzenlemeyin."
  echo "export const FX_THUMBS = {"
  for f in "$APP"/assets/fx/*.jpg; do n=$(basename "$f" .jpg); echo "  $n: require('../../assets/fx/$n.jpg'),"; done
  echo "};"
} > "$APP/src/model/fxThumbs.js"
rm -rf "$WORK"
echo "ok: $(ls "$APP/assets/fx" | wc -l) görsel"
