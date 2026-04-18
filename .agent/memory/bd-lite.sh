#!/usr/bin/env bash
# bd-lite.sh — minimal markdown-file-based bead tracker.
# Append-only (except close/block which update a row in place).
# Ledger: BEADS.md (markdown table).

set -euo pipefail

LEDGER="${BD_LEDGER:-$(dirname "$0")/BEADS.md}"

usage() {
  cat <<EOF
bd-lite — minimal bead tracker

Commands:
  create <subject> [--priority P0|P1|P2] [--blocked-by ID]
  ready
  claim <id>
  close <id> --reason "<evidence>"
  block <id> --reason "<specific blocker>"
  list [--status STATUS]

Ledger: $LEDGER
EOF
}

next_id() {
  local last
  last=$(grep -Eo '^\| B[0-9]{4}' "$LEDGER" 2>/dev/null | sort -u | tail -1 | tr -d '| ' || echo "B0000")
  if [ -z "$last" ] || [ "$last" = "B0000" ]; then
    echo "B0001"
  else
    printf "B%04d" $((10#${last#B} + 1))
  fi
}

cmd_create() {
  local subject="$1"; shift
  local priority="P1"
  local blocked_by="—"
  while [ $# -gt 0 ]; do
    case "$1" in
      --priority) priority="$2"; shift 2 ;;
      --blocked-by) blocked_by="$2"; shift 2 ;;
      *) shift ;;
    esac
  done
  local id
  id=$(next_id)
  local status="pending"
  [ "$blocked_by" != "—" ] && status="blocked"
  printf "| %s | %s | %s | %s | %s | — | — |\n" "$id" "$priority" "$status" "$blocked_by" "$subject" >> "$LEDGER"
  echo "Created $id ($priority, $status): $subject"
}

cmd_ready() {
  python3 - "$LEDGER" <<'PY'
import sys, re
path = sys.argv[1]
hits = 0
with open(path) as f:
    for line in f:
        if not re.match(r'^\| B[0-9]{4}', line): continue
        parts = [p.strip() for p in line.strip().strip('|').split('|')]
        if len(parts) < 7: continue
        bid, prio, status, blocked, subj = parts[0], parts[1], parts[2], parts[3], parts[4]
        if status == "pending" and blocked in ("—", "-", ""):
            print(f"| {bid} | {prio} | {status} | {blocked} | {subj} |")
            hits += 1
if hits == 0:
    print("(no ready beads)")
PY
}

cmd_list() {
  local status_filter=""
  while [ $# -gt 0 ]; do
    case "$1" in
      --status) status_filter="$2"; shift 2 ;;
      *) shift ;;
    esac
  done
  STATUS_FILTER="$status_filter" python3 - "$LEDGER" <<'PY'
import sys, os, re
path = sys.argv[1]
sf = os.environ.get("STATUS_FILTER", "")
hits = 0
with open(path) as f:
    for line in f:
        if not re.match(r'^\| B[0-9]{4}', line): continue
        parts = [p.strip() for p in line.strip().strip('|').split('|')]
        if len(parts) < 7: continue
        if sf and parts[2] != sf: continue
        print(line.rstrip())
        hits += 1
if hits == 0:
    print("(no beads)" if not sf else f"(no beads with status={sf})")
PY
}

cmd_claim() {
  local id="$1"
  local claimant="${USER:-agent}"
  python3 - "$LEDGER" "$id" "$claimant" <<'PY'
import sys, re
path, target, claimant = sys.argv[1], sys.argv[2], sys.argv[3]
with open(path) as f: lines = f.readlines()
out=[]
for line in lines:
    m = re.match(r'^\| (' + re.escape(target) + r') \| (\S+) \| (\S+) \|', line)
    if m:
        parts = [p.strip() for p in line.strip().strip('|').split('|')]
        parts[2] = "in_progress"
        parts[5] = claimant
        line = "| " + " | ".join(parts) + " |\n"
    out.append(line)
with open(path, "w") as f: f.writelines(out)
print(f"Claimed {target} as {claimant}")
PY
}

cmd_close() {
  local id="$1"; shift
  local reason=""
  while [ $# -gt 0 ]; do
    case "$1" in
      --reason) reason="$2"; shift 2 ;;
      *) shift ;;
    esac
  done
  if [ -z "$reason" ]; then
    echo "ERROR: close requires --reason '<specifics>'. Bad reasons like 'done' are rejected." >&2
    exit 1
  fi
  # Reject vague reasons — per anti-shortcut article, evidence must be specific.
  local lc
  lc=$(echo "$reason" | tr '[:upper:]' '[:lower:]' | tr -d '[:punct:]' | xargs)
  case "$lc" in
    done|completed|complete|finished|fixed|ok|yes|good|resolved)
      echo "ERROR: reason '$reason' is too vague. Include specifics: filenames, ports, counts, test names, commit hashes." >&2
      echo "Example: 'Dev server on :3000, test_login.py passes, commit abc1234'" >&2
      exit 1
      ;;
  esac
  # Enforce minimum length — 15 chars rules out most lazy closes.
  if [ ${#reason} -lt 15 ]; then
    echo "ERROR: reason too short (${#reason} chars < 15). Include specifics." >&2
    exit 1
  fi
  python3 - "$LEDGER" "$id" "$reason" <<'PY'
import sys, re
path, target, reason = sys.argv[1], sys.argv[2], sys.argv[3]
with open(path) as f: lines = f.readlines()
out=[]
for line in lines:
    m = re.match(r'^\| (' + re.escape(target) + r') \|', line)
    if m:
        parts = [p.strip() for p in line.strip().strip('|').split('|')]
        parts[2] = "done"
        parts[6] = reason.replace("|", "/")
        line = "| " + " | ".join(parts) + " |\n"
    out.append(line)
with open(path, "w") as f: f.writelines(out)
print(f"Closed {target}: {reason}")
PY
}

cmd_block() {
  local id="$1"; shift
  local reason=""
  while [ $# -gt 0 ]; do
    case "$1" in
      --reason) reason="$2"; shift 2 ;;
      *) shift ;;
    esac
  done
  if [ -z "$reason" ]; then
    echo "ERROR: block requires --reason '<specific blocker>'" >&2
    exit 1
  fi
  python3 - "$LEDGER" "$id" "$reason" <<'PY'
import sys, re
path, target, reason = sys.argv[1], sys.argv[2], sys.argv[3]
with open(path) as f: lines = f.readlines()
out=[]
for line in lines:
    m = re.match(r'^\| (' + re.escape(target) + r') \|', line)
    if m:
        parts = [p.strip() for p in line.strip().strip('|').split('|')]
        parts[2] = "blocked"
        parts[6] = "BLOCKED: " + reason.replace("|", "/")
        line = "| " + " | ".join(parts) + " |\n"
    out.append(line)
with open(path, "w") as f: f.writelines(out)
print(f"Blocked {target}: {reason}")
PY
}

cmd="${1:-help}"; shift || true
case "$cmd" in
  create) cmd_create "$@" ;;
  ready) cmd_ready ;;
  list) cmd_list "$@" ;;
  claim) cmd_claim "$@" ;;
  close) cmd_close "$@" ;;
  block) cmd_block "$@" ;;
  help|-h|--help) usage ;;
  *) echo "Unknown command: $cmd"; usage; exit 1 ;;
esac
