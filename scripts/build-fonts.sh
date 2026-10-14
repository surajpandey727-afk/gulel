#!/usr/bin/env bash
# Rebuilds web fonts from the licensed OTF source folder. The subsetter re-encodes the CFF
# tables, which fixes "Invalid font data" rejections of the CE cuts in Chrome's sanitiser.
# Requires: pip install fonttools brotli
set -euo pipefail
S="ITC Avant Garde Gothic"
for pair in "CE Book:book" "CE Book Oblique:book-oblique" "Medium:medium" "CE Demi:demi" "Bold:bold"; do
  src="${pair%%:*}"; dst="${pair##*:}"
  python -m fontTools.subset "$S/ITC Avant Garde Gothic $src/ITC Avant Garde Gothic $src.otf" \
    --unicodes='*' --layout-features='*' --name-IDs='*' --flavor=woff2 --output-file="public/fonts/avantgarde-$dst.woff2"
done
