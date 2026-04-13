# Project Intent Testing

This repo now includes a runnable local project-intent harness:

```bash
npm run test:project-intents
```

The harness creates two isolated local gateways with separate `OGP_HOME` directories, federates them over localhost, and exercises the real project commands:

- `federation request`
- `federation approve`
- `project create`
- `project contribute --local-only`
- `project request-join`
- `project send-contribution`
- `project query-peer`
- `project status-peer`

## What It Verifies

The automated run checks these behaviors:

1. Two local daemons can boot independently.
2. Federation approval completes between them.
3. The project owner can create a local project and persist local contributions.
4. A non-member peer cannot query the project before joining.
5. The peer can join the project through `project.join`.
6. The joined peer can send a remote contribution through `project.contribute`.
7. The joined peer can query the owner project through `project.query`.
8. The status request path for `project.status` succeeds at the transport level.

## Useful Variants

Keep the temp state and logs for inspection:

```bash
npm run test:project-intents -- --keep-state
```

Use a custom root or ports:

```bash
npm run test:project-intents -- \
  --root /tmp/ogp-project-intent-test \
  --alpha-port 18990 \
  --beta-port 18991
```

Skip the TypeScript rebuild when `dist/` is already current:

```bash
npm run test:project-intents -- --skip-build
```

## Manual Checks

If you want to replay the flow by hand, the harness prints the exact commands it used. These are the most valuable checks:

1. Membership isolation:
   `project query-peer` should fail before `project request-join`.
2. Membership grant:
   `project request-join` should create or update the project on the requester and add the remote member on the owner.
3. Data flow:
   `project send-contribution` should create a new contribution on the owner gateway.
4. Remote visibility:
   `project query-peer` should return the contribution after join succeeds.
5. Local persistence:
   `projects.json` under each `OGP_HOME` should reflect the expected project and topic state.

## Interpreting Success

Project intents are working if all of the following are true:

- both daemons answer `/.well-known/ogp`
- both peers end up `approved` in `peers.json`
- the owner `projects.json` contains the remote member after join
- the owner `projects.json` contains the remote contribution after send
- pre-join query fails and post-join query succeeds

## Known Testing Nuance

`project status-peer` currently confirms that the request was sent, but it is not the best content-verification command because the CLI does not format the returned status payload. Treat it as a transport-path check, and use `project query-peer`, `project status`, `projects.json`, and daemon logs for stronger validation.

For controlled runs, `project contribute --local-only` is still useful when you want to inspect local state before any federation traffic. The default auto-sync path now limits fan-out to approved peers who are explicit members of the project.

## File Transfer

OGP project intents do not currently implement first-class file transfer. Small structured metadata is fine, but real file movement would need explicit protocol support such as:

- file manifests with name, size, MIME type, and hash
- signed download URLs
- chunking or streaming for larger payloads
- size limits and approval controls
- storage and retention rules

For now, the practical pattern is to transfer references, hashes, and URLs through project intents rather than raw file contents.
