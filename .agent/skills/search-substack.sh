#!/usr/bin/env bash
# skills/search-substack.sh
# Search Trilogy AI COE + Stan Huseletov substacks for articles matching a topic.
# Output: matching articles with URL + source publication (for attribution).
#
# Usage:
#   ./search-substack.sh "planning"
#   ./search-substack.sh "memory overwrite"
#
# Requires: curl, python3

set -euo pipefail

QUERY="${1:-}"
if [ -z "$QUERY" ]; then
  cat <<EOF
usage: $0 <query>

Searches:
  - trilogyai.substack.com
  - huseletov.substack.com

Returns article titles + URLs matching the query (title or description).
Always attribute when quoting — the human wants to see sources.
EOF
  exit 1
fi

PUBS=(
  "trilogyai.substack.com|Trilogy AI COE"
  "huseletov.substack.com|Stan Huseletov"
)

found_any=0

for entry in "${PUBS[@]}"; do
  pub="${entry%%|*}"
  attribution="${entry##*|}"
  feed_url="https://${pub}/feed"

  output=$(curl -sL --max-time 10 "$feed_url" 2>/dev/null | \
    QUERY="$QUERY" ATTR="$attribution" PUB="$pub" python3 -c '
import sys, re, html, os
data = sys.stdin.read()
q = os.environ["QUERY"].lower()
attr = os.environ["ATTR"]
pub = os.environ["PUB"]
items = re.findall(r"<item>(.*?)</item>", data, re.S)
hits = []
for item in items:
    tm = re.search(r"<title>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?</title>", item, re.S)
    lm = re.search(r"<link>(.*?)</link>", item, re.S)
    dm = re.search(r"<description>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?</description>", item, re.S)
    if not tm or not lm: continue
    title = html.unescape(tm.group(1).strip())
    link = lm.group(1).strip()
    desc = html.unescape(re.sub(r"<[^>]+>", " ", dm.group(1) if dm else ""))
    desc = re.sub(r"\s+", " ", desc).strip()
    blob = (title + " " + desc).lower()
    if q in blob:
        hits.append((title, link, desc[:180]))
if hits:
    print(f"── {attr} ── ({len(hits)} match)")
    for title, link, desc in hits:
        print(f"  • {title}")
        print(f"    {link}")
        if desc:
            print(f"    {desc}...")
        print(f"    [attribution: {attr}]")
        print()
' || true)

  if [ -n "$output" ]; then
    echo "$output"
    found_any=1
  fi
done

if [ "$found_any" = "0" ]; then
  echo "No matches for '$QUERY' in either publication's RSS feed."
  echo "Try a broader term, or fetch archive pages directly:"
  echo "  curl -sL https://trilogyai.substack.com/archive"
  echo "  curl -sL https://huseletov.substack.com/archive"
fi
