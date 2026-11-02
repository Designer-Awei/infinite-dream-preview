#!/bin/sh
# Bundle the game into dist/ (static site: GitHub Pages / artifact / any static host)
set -e
ROOT=$(cd "$(dirname "$0")/.." && pwd)
ESB="$ROOT/node_modules/esbuild/bin/esbuild"
if [ ! -x "$ESB" ]; then
  echo "Missing esbuild. Run npm install first." >&2
  exit 1
fi
rm -rf "$ROOT/dist" && mkdir -p "$ROOT/dist/css" "$ROOT/dist/assets"
"$ESB" "$ROOT/web/js/main.js" --bundle --minify --format=esm --target=es2020 --outfile="$ROOT/dist/game.js" --log-level=warning
sed 's#<script type="module" src="js/main.js"></script>#<script type="module" src="game.js"></script>#' "$ROOT/web/index.html" > "$ROOT/dist/index.html"
cp "$ROOT/web/css/style.css" "$ROOT/dist/css/"
cp "$ROOT/web/manifest.webmanifest" "$ROOT/dist/"
mkdir -p "$ROOT/dist/vendor" && cp "$ROOT/web/vendor/"* "$ROOT/dist/vendor/"
cp -r "$ROOT/web/assets/"* "$ROOT/dist/assets/"
cp "$ROOT/web/pixelfx/LICENSE" "$ROOT/dist/assets/PIXELFX-LICENSE.txt"
cp "$ROOT/web/pixelfx/NOTICE.md" "$ROOT/dist/assets/PIXELFX-NOTICE.md"
touch "$ROOT/dist/.nojekyll"
# hot-update manifest: every file with a short content hash (the APK downloads only files whose hash changed)
python3 -I "$ROOT/tools/manifest.py" "$ROOT/dist"
echo "built: $(du -sh "$ROOT/dist" | cut -f1), $(find "$ROOT/dist" -type f | wc -l) files"
# GitHub Pages serves /docs from the main branch
rm -rf "$ROOT/docs" && cp -r "$ROOT/dist" "$ROOT/docs"
