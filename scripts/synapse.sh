#!/usr/bin/env bash
# synapse.sh — Synapse API helper for OGP repo agents
#
# Direct use:
#   source .env && ./scripts/synapse.sh ack-all
#   ./scripts/synapse.sh start-run coder "Ship federation fix"
#   ./scripts/synapse.sh checkin synapse-abc progress "writing tests"
#   ./scripts/synapse.sh upload synapse-abc ./output.txt
#   ./scripts/synapse.sh complete synapse-abc
#
# Sourced use (for scripting):
#   source scripts/synapse.sh
#   bd_id=$(synapse_start_run "coder" "my task" | synapse_extract bd_id)
#   artifact_id=$(synapse_upload synapse-abc ./evidence.txt | synapse_extract artifact_id)

set -euo pipefail

# Load .env if token is not already exported.
if [[ -z "${OGP_SYNAPSE_TOKEN:-}" ]]; then
  _env_file="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/.env"
  if [[ -f "$_env_file" ]]; then
    # shellcheck disable=SC1090
    set -a; source "$_env_file"; set +a
  fi
fi

SYNAPSE_URL="${SYNAPSE_URL:-https://synapse-ec2.taild2066.ts.net}"
SYNAPSE_PROJECT="${SYNAPSE_PROJECT:-project.ogp}"

_syn_post() {
  local intent="$1" body="$2"
  curl -sS -X POST "${SYNAPSE_URL}/v1/intent/${intent}" \
    -H "Authorization: Bearer ${OGP_SYNAPSE_TOKEN}" \
    -H "Content-Type: application/json" \
    -d "$body"
}

synapse_extract() {
  local key="$1"
  python3 -c "import sys,json; d=json.load(sys.stdin); print(d['data'].get('$key') or d['data'].get('id',''))"
}

synapse_fetch_briefs() {
  _syn_post "synapse.brief.fetch" "{\"project_id\":\"${SYNAPSE_PROJECT}\"}"
}

synapse_ack_brief() {
  local brief_id="$1"
  _syn_post "synapse.brief.ack" "{\"brief_id\":\"${brief_id}\"}"
}

synapse_ack_all() {
  local response
  response=$(synapse_fetch_briefs)
  local ids titles
  ids=$(python3 -c "import sys,json; [print(b['id']) for b in json.load(sys.stdin)['data']['briefs']]" <<< "$response" 2>/dev/null || true)
  titles=$(python3 -c "import sys,json; [print(b['title']) for b in json.load(sys.stdin)['data']['briefs']]" <<< "$response" 2>/dev/null || true)

  if [[ -z "$ids" ]]; then
    echo "No unacked briefs." >&2
    return 0
  fi

  echo "Applying and acking briefs:" >&2
  paste <(echo "$ids") <(echo "$titles") | while IFS=$'\t' read -r id title; do
    echo "  ✓ $title" >&2
    synapse_ack_brief "$id" > /dev/null
  done
  echo "Done." >&2
}

synapse_start_run() {
  local wf_class="${1:-coder}" title="${2:-Unnamed run}"
  python3 -c "
import json, subprocess, sys
body = json.dumps({'project_id': '${SYNAPSE_PROJECT}', 'workflow_class': '$wf_class', 'title': sys.argv[1]})
result = subprocess.run(['curl','-sS','-X','POST','${SYNAPSE_URL}/v1/intent/synapse.workflow.create',
  '-H','Authorization: Bearer ${OGP_SYNAPSE_TOKEN}','-H','Content-Type: application/json','-d',body],
  capture_output=True, text=True)
sys.stdout.write(result.stdout)
" "$title"
}

synapse_checkin() {
  local bd_id="$1" status="$2" task="${3:-}"
  python3 -c "
import json, subprocess, sys
body = {'project_id': '${SYNAPSE_PROJECT}', 'bd_id': '$bd_id', 'status': '$status'}
if '$task':
    body['current_task'] = sys.argv[1]
result = subprocess.run(['curl','-sS','-X','POST','${SYNAPSE_URL}/v1/intent/synapse.checkin',
  '-H','Authorization: Bearer ${OGP_SYNAPSE_TOKEN}','-H','Content-Type: application/json',
  '-d', json.dumps(body)], capture_output=True, text=True)
sys.stdout.write(result.stdout)
" "$task"
}

synapse_complete() {
  local bd_id="$1" task="${2:-run complete}"
  synapse_checkin "$bd_id" "complete" "$task"
}

synapse_upload() {
  local bd_id="$1" file_path="$2" mime="${3:-text/plain}"
  python3 -c "
import base64, json, subprocess, sys, os
with open(sys.argv[1], 'rb') as f:
    b64 = base64.b64encode(f.read()).decode()
body = json.dumps({
    'project_id': '${SYNAPSE_PROJECT}',
    'bd_id':      '$bd_id',
    'name':       os.path.basename(sys.argv[1]),
    'mime_type':  '$mime',
    'content_base64': b64
})
result = subprocess.run(['curl','-sS','-X','POST','${SYNAPSE_URL}/v1/intent/synapse.artifact.upload',
  '-H','Authorization: Bearer ${OGP_SYNAPSE_TOKEN}','-H','Content-Type: application/json','-d',body],
  capture_output=True, text=True)
sys.stdout.write(result.stdout)
" "$file_path"
}

synapse_upload_text() {
  local bd_id="$1" text="$2" name="${3:-evidence.txt}" mime="${4:-text/plain}"
  python3 -c "
import base64, json, subprocess, sys
b64 = base64.b64encode(sys.argv[1].encode()).decode()
body = json.dumps({
    'project_id': '${SYNAPSE_PROJECT}',
    'bd_id':      '$bd_id',
    'name':       '$name',
    'mime_type':  '$mime',
    'content_base64': b64
})
result = subprocess.run(['curl','-sS','-X','POST','${SYNAPSE_URL}/v1/intent/synapse.artifact.upload',
  '-H','Authorization: Bearer ${OGP_SYNAPSE_TOKEN}','-H','Content-Type: application/json','-d',body],
  capture_output=True, text=True)
sys.stdout.write(result.stdout)
" "$text"
}

synapse_query_learnings() {
  local tags_csv="$1" cross_silo="${2:-true}"
  python3 -c "
import json, subprocess, sys
tags = sys.argv[1].split(',')
xs = sys.argv[2].lower() == 'true'
body = json.dumps({'project_id': '${SYNAPSE_PROJECT}', 'applies_to': tags,
                   'cross_silo': xs, 'limit': 25})
result = subprocess.run(['curl','-sS','-X','POST','${SYNAPSE_URL}/v1/intent/synapse.learning.query',
  '-H','Authorization: Bearer ${OGP_SYNAPSE_TOKEN}','-H','Content-Type: application/json','-d',body],
  capture_output=True, text=True)
sys.stdout.write(result.stdout)
" "$tags_csv" "$cross_silo"
}

synapse_record_learning() {
  local bd_id="$1" claim="$2" tags_csv="$3" confidence="${4:-low}"
  local artifact_id="${5:-}" non_obvious="${6:-}"
  python3 -c "
import json, subprocess, sys
learning = {
    'claim':       sys.argv[1],
    'applies_to':  sys.argv[2].split(','),
    'confidence':  '$confidence',
}
if '$artifact_id':
    learning['evidence_artifact_id'] = '$artifact_id'
if '$non_obvious':
    learning['non_obvious_marker'] = '$non_obvious'
body = json.dumps({'project_id': '${SYNAPSE_PROJECT}', 'bd_id': '$bd_id', 'learnings': [learning]})
result = subprocess.run(['curl','-sS','-X','POST','${SYNAPSE_URL}/v1/intent/synapse.learning.record',
  '-H','Authorization: Bearer ${OGP_SYNAPSE_TOKEN}','-H','Content-Type: application/json','-d',body],
  capture_output=True, text=True)
sys.stdout.write(result.stdout)
" "$claim" "$tags_csv"
}

synapse_record_choice() {
  local bd_id="$1" situation="$2" chose="$3" rationale="$4" alt="${5:-alternative path}"
  python3 -c "
import json, subprocess, sys
body = json.dumps({
    'project_id': '${SYNAPSE_PROJECT}',
    'bd_id':      '$bd_id',
    'situation':  sys.argv[1],
    'options':    [{'label': '$chose', 'brief': 'chosen'}, {'label': sys.argv[3], 'brief': 'not chosen'}],
    'chose':      '$chose',
    'rationale':  sys.argv[2],
})
result = subprocess.run(['curl','-sS','-X','POST','${SYNAPSE_URL}/v1/intent/synapse.choice.record',
  '-H','Authorization: Bearer ${OGP_SYNAPSE_TOKEN}','-H','Content-Type: application/json','-d',body],
  capture_output=True, text=True)
sys.stdout.write(result.stdout)
" "$situation" "$rationale" "$alt"
}

synapse_choice_outcome() {
  local choice_id="$1" outcome="$2" note="${3:-}"
  python3 -c "
import json, subprocess, sys
body = {'id': '$choice_id', 'outcome': '$outcome'}
if '$note':
    body['outcome_note'] = sys.argv[1]
result = subprocess.run(['curl','-sS','-X','POST','${SYNAPSE_URL}/v1/intent/synapse.choice.update_outcome',
  '-H','Authorization: Bearer ${OGP_SYNAPSE_TOKEN}','-H','Content-Type: application/json',
  '-d', json.dumps(body)], capture_output=True, text=True)
sys.stdout.write(result.stdout)
" "$note"
}

synapse_publish_objective() {
  local bd_id="$1" title="$2"
  shift 2
  python3 -c "
import json, subprocess, sys
milestones = [{'title': m} for m in sys.argv[2:]]
body = json.dumps({
    'project_id': '${SYNAPSE_PROJECT}',
    'bd_id':      '$bd_id',
    'title':      sys.argv[1],
    'milestones': milestones,
})
result = subprocess.run(['curl','-sS','-X','POST','${SYNAPSE_URL}/v1/intent/synapse.objective.publish',
  '-H','Authorization: Bearer ${OGP_SYNAPSE_TOKEN}','-H','Content-Type: application/json','-d',body],
  capture_output=True, text=True)
sys.stdout.write(result.stdout)
" "$title" "$@"
}

synapse_feedback() {
  local category="$1" severity="$2" title="$3" body_text="$4"
  python3 -c "
import json, subprocess, sys
body = json.dumps({
    'project_id': '${SYNAPSE_PROJECT}',
    'category':   '$category',
    'severity':   '$severity',
    'title':      sys.argv[1],
    'body':       sys.argv[2],
})
result = subprocess.run(['curl','-sS','-X','POST','${SYNAPSE_URL}/v1/intent/synapse.feedback.submit',
  '-H','Authorization: Bearer ${OGP_SYNAPSE_TOKEN}','-H','Content-Type: application/json','-d',body],
  capture_output=True, text=True)
sys.stdout.write(result.stdout)
" "$title" "$body_text"
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  cmd="${1:-help}"
  shift || true
  case "$cmd" in
    fetch-briefs)       synapse_fetch_briefs ;;
    ack-brief)          synapse_ack_brief "$1" ;;
    ack-all)            synapse_ack_all ;;
    start-run)          synapse_start_run "${1:-coder}" "${2:-Unnamed run}" ;;
    checkin)            synapse_checkin "$1" "$2" "${3:-}" ;;
    upload)             synapse_upload "$1" "$2" "${3:-text/plain}" ;;
    upload-text)        synapse_upload_text "$1" "$2" "${3:-evidence.txt}" "${4:-text/plain}" ;;
    query-learnings)    synapse_query_learnings "$1" "${2:-true}" ;;
    record-learning)    synapse_record_learning "$1" "$2" "$3" "${4:-low}" "${5:-}" "${6:-}" ;;
    record-choice)      synapse_record_choice "$1" "$2" "$3" "$4" "${5:-}" ;;
    choice-outcome)     synapse_choice_outcome "$1" "$2" "${3:-}" ;;
    publish-objective)  synapse_publish_objective "$@" ;;
    complete)           synapse_complete "$1" "${2:-run complete}" ;;
    feedback)           synapse_feedback "$1" "$2" "$3" "$4" ;;
    extract)            synapse_extract "$1" ;;
    help|*)
      cat >&2 <<'EOF'
synapse.sh — Synapse API helper

Usage: ./scripts/synapse.sh <command> [args]
       source scripts/synapse.sh  # for function access

Session start (do this every non-trivial run):
  ack-all                                        fetch and ack all unacked briefs
  query-learnings <tags_csv> [cross_silo]        pull cross-silo learnings before work

Workflow lifecycle:
  start-run <class> <title>                      create a run, returns JSON with bd_id
  checkin <bd_id> <status> [task]                status: start|progress|blocked|complete|failed
  complete <bd_id> [task]                        shorthand for checkin with status=complete

Evidence (required before medium/high facts/learnings):
  upload <bd_id> <file_path> [mime]              upload file, returns JSON with artifact_id
  upload-text <bd_id> <text> [name] [mime]       upload inline text as artifact

Knowledge:
  record-learning <bd_id> <claim> <tags_csv> [confidence] [artifact_id] [non_obvious]
  record-choice <bd_id> <situation> <chose> <rationale> [alt_option]
  choice-outcome <choice_id> <outcome> [note]    outcome: succeeded|had_to_undo|still_uncertain
  publish-objective <bd_id> <title> <m1> [m2..]  declare goal + milestones before work

Platform:
  fetch-briefs                                   fetch unacked briefs (raw JSON)
  ack-brief <brief_id>                           ack a specific brief
  feedback <category> <severity> <title> <body>  report Synapse friction to operator

Parsing:
  extract <key>                                  extract a key from piped JSON response
                                                 e.g. start-run coder "my task" | ./synapse.sh extract bd_id
EOF
      ;;
  esac
fi
