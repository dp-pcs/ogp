# OGP RC.1 Federation Test Checklist

This is the real-world validation plan for `@dp-pcs/ogp@0.7.0-rc.1` across three gateways:

- `OpenClaw` on `https://ogp.sarcastek.com`
- `Hermes` on `https://hermes.sarcastek.com`
- `Cosmo` on the AWS machine as the hub
- `Aleph` on `https://ogp-aleph.aicoe.fit` operated by Stephen Barr

The goal is not just "can they federate once?" The goal is to prove the full `rc.1` surface area behaves correctly under normal operation, restart/recovery, and obvious failure modes.

## Success Criteria

`rc.1` is in decent shape if all of these are true:

- all three gateways answer `/.well-known/ogp` and `/federation/ping`
- all three pairings can request, approve, exchange traffic, and remove cleanly
- peer health transitions make sense when a daemon goes down and comes back
- scoped access is enforced
- agent-comms works, including reply-wait paths
- project-intent flows work across real gateways, not just the local harness
- multi-agent/persona routing works where advertised
- rendezvous/invite flow works if you intend to rely on it
- restart behavior is acceptable, including daemon and tunnel recovery

## Participants

Set these once in your shell while testing:

```bash
export OC_URL="https://ogp.sarcastek.com"
export HERMES_URL="https://hermes.sarcastek.com"
export COSMO_URL="https://david-proctor.gw.clawporate.elelem.expert"
export ALEPH_URL="https://ogp-aleph.aicoe.fit"
```

Useful topology:

| Pair | Why it matters |
| --- | --- |
| OpenClaw <-> Hermes | Cross-framework, same operator, easiest first smoke |
| OpenClaw <-> Cosmo | David local gateway to AWS hub |
| Hermes <-> Cosmo | David second local gateway to AWS hub |
| Aleph <-> Cosmo | Stephen gateway to AWS hub |

Primary `rc.1` goal for this round:

- prove both David and Stephen can federate with Cosmo cleanly
- prove Cosmo stays healthy as the shared external hub
- prove project-intent and agent-comms traffic survives the hub topology

Direct `OpenClaw/Hermes <-> Aleph` federation is optional for this round unless you specifically want a full mesh test.

## 0. Preflight On Every Machine

Run this before any pairwise testing:

```bash
ogp --version
ogp --for all status
ogp whoami
ogp config health-check show
curl -sS "$OC_URL/.well-known/ogp" | jq .
curl -sS "$HERMES_URL/.well-known/ogp" | jq .
curl -sS "$COSMO_URL/.well-known/ogp" | jq .
curl -sS "$ALEPH_URL/.well-known/ogp" | jq .
```

Check:

- version is `0.7.0-rc.1` everywhere
- each daemon is actually listening on its configured port
- each public URL matches the gateway's configured `gatewayUrl`
- each gateway advertises `multi-agent-personas` in `capabilities.features`
- each gateway advertises the expected `agents[]`

### Optional: speed up health-check testing

For testing, lower the heartbeat interval so you do not wait forever for state changes:

```bash
ogp config health-check interval 30000
ogp config health-check timeout 5000
ogp config health-check max-failures 2
ogp stop --for all
ogp start --for all --background
```

Expected result:

- health config shows `30s / 5s / 2 failures`
- after restart, `ogp --for all status` shows both daemons up

## 1. Local Harness First

Before you spend time on the three-machine test, run the existing local project-intent harness in this repo:

```bash
npm run build
npm test -- --run
npm run test:project-intents
```

Optional stateful run:

```bash
npm run test:project-intents -- --keep-state
```

This catches obvious regressions in:

- federation request / approve
- project create / join / contribute / query / status-peer
- local state persistence

## 2. Discovery And Liveness

Run these against every public gateway:

```bash
ogp federation ping "$OC_URL"
ogp federation ping "$HERMES_URL"
ogp federation ping "$COSMO_URL"
ogp federation ping "$ALEPH_URL"

curl -sS "$OC_URL/.well-known/ogp" | jq '{version,displayName,gatewayUrl,features:.capabilities.features,agents}'
curl -sS "$HERMES_URL/.well-known/ogp" | jq '{version,displayName,gatewayUrl,features:.capabilities.features,agents}'
curl -sS "$COSMO_URL/.well-known/ogp" | jq '{version,displayName,gatewayUrl,features:.capabilities.features,agents}'
curl -sS "$ALEPH_URL/.well-known/ogp" | jq '{version,displayName,gatewayUrl,features:.capabilities.features,agents}'
```

Expected result:

- ping succeeds for all three URLs
- each card shows `version: 0.7.0-rc.1`
- `gatewayUrl` in the card matches the public URL you hit
- `agents[]` looks correct for that gateway

## 3. Federation Lifecycle

Run this for each required hub/spoke pair.

Example commands from OpenClaw -> Hermes:

```bash
ogp --for openclaw federation request "$HERMES_URL" --alias hermes-local
ogp --for hermes federation list --status pending
ogp --for hermes federation approve hermes-local --intents message,agent-comms,project.join,project.contribute,project.query,project.status
ogp --for openclaw federation list
ogp --for hermes federation list
ogp --for openclaw federation status
ogp --for hermes federation status
```

Repeat the same flow for:

- OpenClaw -> Cosmo
- Hermes -> Cosmo
- Aleph -> Cosmo

Expected result:

- requester sees the peer move to `approved`
- approver sees the requester move to `approved`
- status output shows the correct alias and gateway
- no peer lands in a weird half-approved state

## 4. Health Checks And Heartbeat State

After all pairs are approved, inspect the health view:

```bash
ogp --for openclaw federation status
ogp --for hermes federation status
```

Look for:

- `healthy` peers
- a sensible `healthState` such as `established`
- recent inbound and outbound timestamps

### Failure and recovery test

For one pair at a time, stop one side and watch the other side detect it:

```bash
ogp --for hermes stop
ogp --for openclaw federation status
sleep 70
ogp --for openclaw federation status
ogp --for hermes start --background
sleep 70
ogp --for openclaw federation status
ogp --for hermes federation status
```

Expected result:

- after enough failed heartbeats, the surviving peer marks the stopped peer degraded or down
- after restart, health recovers back to `established`
- `/.well-known/ogp` becomes reachable again after restart

Run the same stop/restart test with Cosmo, because that is the critical shared dependency.

## 5. Identity And Persona Advertisement

Check that each peer advertises the expected identity and agents:

```bash
curl -sS "$OC_URL/.well-known/ogp" | jq '.agents'
curl -sS "$HERMES_URL/.well-known/ogp" | jq '.agents'
curl -sS "$COSMO_URL/.well-known/ogp" | jq '.agents'
curl -sS "$ALEPH_URL/.well-known/ogp" | jq '.agents'
```

Then change local identity on one gateway and push it to an approved peer:

```bash
ogp config show-identity
ogp federation update-identity <peer-id>
ogp federation status
```

Expected result:

- approved peers see the updated identity snapshot
- no federation relationship breaks just because identity fields changed

## 6. Basic Message Traffic

Test raw message intent first:

```bash
ogp federation send <peer-id> message '{"text":"hello from rc1"}'
ogp federation send <peer-id> task-request '{"task":"echo test","priority":"normal"}'
ogp federation send <peer-id> status-update '{"status":"completed","source":"rc1-manual-test"}'
```

Expected result:

- receiver gets the message
- sender gets a successful transport result
- daemon log records the request cleanly

## 7. Agent-Comms

First inspect policies:

```bash
ogp agent-comms policies
ogp agent-comms activity --last 20
```

Then test real agent-comms:

```bash
ogp federation agent <peer-id> memory-management "Store this test marker"
ogp federation agent <peer-id> queries "What gateway are you on?" --wait --timeout 60000
ogp federation agent <peer-id> task-delegation "Return a short ack" --priority high --wait --timeout 60000
```

Expected result:

- fire-and-forget delivery succeeds
- `--wait` returns a real reply path, not just transport success
- activity log records the interaction

### Persona routing

If the peer advertises more than one agent:

```bash
ogp federation agent <peer-id> queries "hello primary" --to-agent junior --wait
ogp federation agent <peer-id> queries "hello specialist" --to-agent apollo --wait
```

Negative test:

```bash
ogp federation agent <peer-id> queries "bad persona test" --to-agent definitely-not-real --wait
```

Expected result:

- valid persona IDs route successfully
- invalid persona ID fails with a clear error

## 8. Scope Enforcement

Approve or grant a peer with restricted scopes, then verify allowed vs denied behavior.

Example:

```bash
ogp federation grant <peer-id> --intents message --rate 20/3600
ogp federation scopes <peer-id>
```

Now try:

```bash
ogp federation send <peer-id> message '{"text":"allowed"}'
ogp federation agent <peer-id> memory-management "should be denied"
ogp project query-peer <peer-id> some-project
```

Expected result:

- `message` works
- `agent-comms` fails if not granted
- project intents fail if project scopes are not granted

Then restore the broader scope set and verify those flows work again.

## 9. Project Intents

This is the highest-value cross-machine test after basic federation.

Recommended topology for this round:

- create the canonical shared project on `Cosmo`
- have `OpenClaw`, `Hermes`, and `Aleph` join it
- send contributions from each spoke into Cosmo
- verify that queries against Cosmo reflect the combined state

On the owner gateway:

```bash
ogp project create rc1-shared "RC1 Shared Test" --description "Real multi-gateway test"
ogp project contribute rc1-shared note "owner bootstrap note" --local-only
ogp project status rc1-shared
```

From a remote approved peer:

```bash
ogp project request-join <owner-peer-id> rc1-shared "RC1 Shared Test" --description "Join from remote gateway"
ogp project query-peer <owner-peer-id> rc1-shared
ogp project send-contribution <owner-peer-id> rc1-shared task "Remote task from rc1 test"
ogp project send-contribution <owner-peer-id> rc1-shared decision "Remote decision from rc1 test" --metadata '{"confidence":"high"}'
ogp project status-peer <owner-peer-id> rc1-shared
```

Run this with both remote peers joining the same project.

Expected result:

- pre-join query should fail or be denied
- join succeeds and the project membership becomes visible
- remote contributions show up on the owner gateway
- query after join returns the new entries
- status-peer succeeds at least at the transport level

Evidence:

- `ogp project status rc1-shared`
- `~/.ogp/projects.json`
- `~/.ogp-hermes/projects.json`
- Cosmo's `projects.json`
- Aleph's `projects.json`

## 10. Rendezvous / Invite Flow

Only run this if you intend to use rendezvous in production.

From one gateway:

```bash
ogp federation invite
```

From another:

```bash
ogp federation accept <token>
```

Also test connect-by-pubkey:

```bash
ogp federation connect <pubkey>
```

Expected result:

- invite token resolves and creates the same approved peer state you get from direct request/approve
- connect-by-pubkey finds the peer and completes federation
- rendezvous registration stays alive while the daemon is up

## 11. Removal And Re-Federation

For each pair:

```bash
ogp federation remove <peer-id>
ogp federation list
```

Expected result:

- removed peer is marked removed locally
- remote side receives the removal notification on a best-effort basis
- sending further traffic to the removed peer fails

Then immediately re-request federation and make sure the pair can recover cleanly.

## 12. Restart, Reboot, And Tunnel Recovery

These are operational tests, not protocol tests, but they matter.

### Daemon restart

```bash
ogp --for all stop
ogp --for all start --background
ogp --for all status
```

### Public endpoint recovery

```bash
curl -sS "$OC_URL/.well-known/ogp" | jq .version
curl -sS "$HERMES_URL/.well-known/ogp" | jq .version
curl -sS "$COSMO_URL/.well-known/ogp" | jq .version
curl -sS "$ALEPH_URL/.well-known/ogp" | jq .version
```

### Tunnel validation

Verify each public URL continues to map to the correct local daemon after restart.

## 13. Known Local Risk To Explicitly Test

On David's macOS machine, the current LaunchAgent can fail if launchd cannot find `node` for the `ogp` wrapper. That is worth an explicit reboot/login test because it will absolutely look like "tunnel is up but OGP is dead."

Check:

```bash
launchctl print gui/$(id -u)/com.dp-pcs.ogp
sed -n '1,80p' ~/.ogp/launchagent.log
```

If this still shows `env: node: No such file or directory`, autostart is not trustworthy yet.

## 14. Evidence To Save Per Test Run

For each major run, save:

```bash
ogp --for all status
ogp --for openclaw federation list
ogp --for hermes federation list
ogp agent-comms activity --last 50
curl -sS "$OC_URL/.well-known/ogp" | jq .
curl -sS "$HERMES_URL/.well-known/ogp" | jq .
curl -sS "$COSMO_URL/.well-known/ogp" | jq .
curl -sS "$ALEPH_URL/.well-known/ogp" | jq .
```

Also keep:

- `~/.ogp/daemon.log`
- `~/.ogp-hermes/daemon.log`
- each gateway's `peers.json`
- each gateway's `projects.json`

## Minimal Ship Gate

If you do not have time to run everything, the minimum bar before treating `rc.1` as real is:

1. all four public cards return `200`
2. `OpenClaw <-> Cosmo`, `Hermes <-> Cosmo`, and `Aleph <-> Cosmo` can federate
3. health changes on Cosmo stop/start are visible and recover from the spoke gateways
4. one successful `agent-comms --wait` round-trip from each spoke to Cosmo
5. one successful project join + contribution + query flow with Cosmo as the shared project owner
6. one successful removal + re-federation cycle against Cosmo
