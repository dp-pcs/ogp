# Hermes Integration Implementation Checklist

> Developer checklist for adding Hermes support to OGP
>
> Historical note, April 9, 2026: this file is retained as an implementation artifact.
> Many unchecked boxes below were never backfilled after the sidecar work landed.
> Do not use this file as the canonical current backlog. Use `CURRENT_WORK.md` and Beads instead.

## Phase 1: Sidecar Integration (Week 1)

### Prerequisites
- [ ] Hermes installed and running
- [ ] Hermes webhook adapter enabled (port 8644)
- [ ] OpenClaw+OGP setup working (baseline to not break)

### Code Changes

#### 1. Add Hermes Notification Backend

**File:** `src/daemon/notify.ts`

- [ ] Import crypto at the top
- [ ] Add `NotificationBackend` interface
- [ ] Implement `HermesBackend` class
- [ ] Implement `OpenClawBackend` class (wrap existing code)
- [ ] Add `getNotificationBackend()` factory
- [ ] Refactor `notifyLocalAgent()` to use backend system
- [ ] Add HMAC signature generation for Hermes webhook

**Code Template:**
```typescript
import crypto from 'crypto';

interface NotificationBackend {
  name: string;
  notify(context: NotificationContext): Promise<void>;
}

interface NotificationContext {
  peerId: string;
  peerDisplayName: string;
  intent: string;
  payload: any;
  timestamp: string;
}

class HermesBackend implements NotificationBackend {
  name = "hermes";

  async notify(ctx: NotificationContext): Promise<void> {
    const config = loadConfig();
    const webhookUrl = config.hermesWebhookUrl || 'http://localhost:8644/webhooks/ogp_federation';
    const secret = config.hermesWebhookSecret;

    if (!secret) {
      throw new Error('hermesWebhookSecret not configured');
    }

    const body = {
      peer_id: ctx.peerId,
      peer_display_name: ctx.peerDisplayName,
      intent: ctx.intent,
      topic: ctx.payload.topic || "",
      message: ctx.payload.message || JSON.stringify(ctx.payload),
      priority: ctx.payload.priority || "normal",
      conversation_id: ctx.payload.conversationId,
      timestamp: ctx.timestamp,
      payload: ctx.payload
    };

    const bodyStr = JSON.stringify(body);
    const signature = crypto
      .createHmac('sha256', secret)
      .update(bodyStr)
      .digest('hex');

    await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Hub-Signature-256': `sha256=${signature}`
      },
      body: bodyStr
    });
  }
}

class OpenClawBackend implements NotificationBackend {
  name = "openclaw";

  async notify(ctx: NotificationContext): Promise<void> {
    // Move existing notifyOpenClaw() code here
  }
}

function getNotificationBackend(): NotificationBackend {
  const config = loadConfig();
  const platform = config.platform || 'openclaw';

  switch (platform) {
    case 'openclaw':
      return new OpenClawBackend();
    case 'hermes':
      return new HermesBackend();
    default:
      throw new Error(`Unknown platform: ${platform}`);
  }
}

export async function notifyLocalAgent(
  peerId: string,
  peerDisplayName: string,
  intent: string,
  payload: any
): Promise<void> {
  const backend = getNotificationBackend();

  await backend.notify({
    peerId,
    peerDisplayName,
    intent,
    payload,
    timestamp: new Date().toISOString()
  });
}
```

#### 2. Update Config Types

**File:** `src/shared/config.ts`

- [ ] Add `platform?: string` field to `Config` interface
- [ ] Add `hermesWebhookUrl?: string` field
- [ ] Add `hermesWebhookSecret?: string` field
- [ ] Update config validation
- [ ] Add migration for existing configs (default platform to 'openclaw')

**Code Template:**
```typescript
export interface Config {
  // Existing fields...
  daemonPort: number;
  gatewayUrl: string;
  displayName: string;
  email: string;
  stateDir?: string;

  // Platform selection
  platform?: string;  // 'openclaw' | 'hermes'

  // OpenClaw-specific (existing)
  openclawUrl?: string;
  openclawToken?: string;
  openclawHooksToken?: string;
  agentId?: string;
  notifyTarget?: string;
  notifyTargets?: Record<string, string>;

  // Hermes-specific (new)
  hermesWebhookUrl?: string;
  hermesWebhookSecret?: string;

  // Existing fields...
  rendezvous?: RendezvousConfig;
}
```

#### 3. Update CLI Setup Wizard

**File:** `src/cli/setup.ts`

- [ ] Add platform selection prompt (OpenClaw or Hermes)
- [ ] Conditionally prompt for OpenClaw config OR Hermes config
- [ ] For Hermes: prompt for webhook URL and secret
- [ ] For OpenClaw: use existing agent discovery flow
- [ ] Save appropriate fields to config.json

**Code Template:**
```typescript
// In setup wizard, after basic info:

const platform = await prompt({
  type: 'select',
  name: 'platform',
  message: 'Which AI platform is this gateway for?',
  choices: [
    { title: 'OpenClaw', value: 'openclaw' },
    { title: 'Hermes', value: 'hermes' }
  ]
});

if (platform === 'hermes') {
  const hermesWebhookUrl = await prompt({
    type: 'text',
    name: 'hermesWebhookUrl',
    message: 'Hermes webhook URL',
    initial: 'http://localhost:8644/webhooks/ogp_federation'
  });

  const hermesWebhookSecret = await prompt({
    type: 'password',
    name: 'hermesWebhookSecret',
    message: 'Hermes webhook secret (must match Hermes config.yaml)'
  });

  config.platform = 'hermes';
  config.hermesWebhookUrl = hermesWebhookUrl;
  config.hermesWebhookSecret = hermesWebhookSecret;
} else {
  // Existing OpenClaw flow
  config.platform = 'openclaw';
  // ... agent discovery, etc.
}
```

#### 4. Update Status Command

**File:** `src/cli/federation.ts` (status command)

- [ ] Show platform type in status output
- [ ] Show appropriate backend info (OpenClaw URL or Hermes webhook URL)

### Testing

- [ ] Build project: `npm run build`
- [ ] Test OpenClaw integration still works (regression test)
  - [ ] `ogp status` shows OpenClaw config
  - [ ] Can send messages to existing OpenClaw peers
  - [ ] Notifications arrive in OpenClaw
- [ ] Test Hermes integration
  - [ ] Configure Hermes webhook route
  - [ ] Create new OGP instance: `mkdir ~/.ogp-hermes`
  - [ ] Run setup: `OGP_STATE_DIR=~/.ogp-hermes ogp setup`
  - [ ] Select "Hermes" platform
  - [ ] Start daemon on port 18791
  - [ ] Verify `.well-known/ogp` endpoint works
- [ ] Test local federation
  - [ ] Request federation from OpenClaw OGP to Hermes OGP
  - [ ] Approve from Hermes OGP
  - [ ] Send message from OpenClaw to Hermes
  - [ ] Verify message arrives in Hermes webhook logs
  - [ ] Verify signature verification passes
  - [ ] Verify Hermes agent receives and processes message

### Documentation

- [ ] Update README with Hermes support announcement
- [ ] Add example Hermes config to docs
- [ ] Update setup guide with platform selection
- [ ] Add troubleshooting section for webhook signature issues

### Release

- [ ] Version bump to 0.3.0 (minor - new feature)
- [ ] Update CHANGELOG.md
- [ ] Tag release
- [ ] Publish to npm: `npm publish`
- [ ] Announce on Twitter/X

---

## Phase 2: Native Hermes Adapter (Month 1-2)

### Design

- [ ] Review Hermes gateway platform adapter pattern
- [ ] Study `gateway/platforms/base.py`
- [ ] Study `gateway/platforms/webhook.py` for HTTP server reference
- [ ] Decide on state storage location (`~/.hermes/ogp/` vs `~/.ogp/`)

### Implementation

#### 1. Create OGP Platform Adapter

**File:** `~/.hermes/hermes-agent/gateway/platforms/ogp.py`

- [ ] Import Ed25519 crypto library
- [ ] Create `OGPAdapter(BasePlatformAdapter)` class
- [ ] Implement lifecycle methods (`connect()`, `disconnect()`)
- [ ] Implement HTTP server (aiohttp)
- [ ] Implement `.well-known/ogp` endpoint
- [ ] Implement `/federation/request` endpoint
- [ ] Implement `/federation/approve` endpoint
- [ ] Implement `/federation/message` endpoint
- [ ] Implement `/federation/removed` endpoint
- [ ] Implement keypair management (load/generate)
- [ ] Implement peer storage (JSON file)
- [ ] Implement Doorman access control
- [ ] Implement scope enforcement
- [ ] Implement rate limiting (sliding window)

**File Structure:**
```python
class OGPAdapter(BasePlatformAdapter):
    def __init__(self, config: PlatformConfig):
        self._port = int(config.extra.get("port", 18790))
        self._peers_file = Path.home() / ".hermes" / "ogp" / "peers.json"
        self._keypair_file = Path.home() / ".hermes" / "ogp" / "keypair.json"
        self._keypair = self._load_or_generate_keypair()
        self._peers = self._load_peers()
        self._doorman = Doorman(self._peers)

    async def connect(self) -> bool:
        # Start HTTP server
        app = web.Application()
        app.router.add_get("/.well-known/ogp", self._handle_well_known)
        app.router.add_post("/federation/request", self._handle_request)
        app.router.add_post("/federation/approve", self._handle_approve)
        app.router.add_post("/federation/message", self._handle_message)
        # ...
        await site.start()
        return True

    async def _handle_message(self, request: web.Request) -> web.Response:
        # 1. Read body
        # 2. Verify signature
        # 3. Doorman access check
        # 4. Route to agent
        pass
```

#### 2. Add Ed25519 Crypto

- [ ] Use Python `cryptography` library
- [ ] Generate/load Ed25519 keypair
- [ ] Sign messages
- [ ] Verify signatures

**Code Template:**
```python
from cryptography.hazmat.primitives.asymmetric import ed25519
from cryptography.hazmat.primitives import serialization

def generate_keypair():
    private_key = ed25519.Ed25519PrivateKey.generate()
    public_key = private_key.public_key()

    private_bytes = private_key.private_bytes(
        encoding=serialization.Encoding.Raw,
        format=serialization.PrivateFormat.Raw,
        encryption_algorithm=serialization.NoEncryption()
    )

    public_bytes = public_key.public_bytes(
        encoding=serialization.Encoding.Raw,
        format=serialization.PublicFormat.Raw
    )

    return {
        "publicKey": public_bytes.hex(),
        "privateKey": private_bytes.hex()
    }

def sign_message(message: bytes, private_key_hex: str) -> str:
    private_bytes = bytes.fromhex(private_key_hex)
    private_key = ed25519.Ed25519PrivateKey.from_private_bytes(private_bytes)
    signature = private_key.sign(message)
    return signature.hex()

def verify_signature(message: bytes, signature_hex: str, public_key_hex: str) -> bool:
    try:
        public_bytes = bytes.fromhex(public_key_hex)
        public_key = ed25519.Ed25519PublicKey.from_public_bytes(public_bytes)
        signature = bytes.fromhex(signature_hex)
        public_key.verify(signature, message)
        return True
    except Exception:
        return False
```

#### 3. Implement Doorman

- [ ] 6-step validation algorithm
- [ ] Peer lookup by ID
- [ ] Approval status check
- [ ] Scope bundle validation
- [ ] Intent grant check
- [ ] Topic coverage check (agent-comms)
- [ ] Rate limit check (sliding window)

#### 4. Add Rendezvous Support

- [ ] Auto-register on startup
- [ ] 30-second heartbeat
- [ ] Auto-deregister on shutdown
- [ ] Peer lookup by public key

### Testing

- [ ] Unit tests for crypto functions
- [ ] Unit tests for Doorman
- [ ] Integration test: Native Hermes ↔ Node.js OGP
- [ ] Integration test: Native Hermes ↔ Native Hermes
- [ ] Interoperability test: Hermes ↔ OpenClaw federation
- [ ] Load test: 100 concurrent messages
- [ ] Security test: Invalid signatures rejected
- [ ] Security test: Scope violations rejected

### Migration

- [ ] Document migration path from sidecar to native
- [ ] Provide import script for peers.json
- [ ] Provide import script for keypair.json

---

## Verification Checklist

### Sidecar Integration (Phase 1)

- [ ] OpenClaw integration still works (no regression)
- [ ] Hermes can receive OGP messages via webhook
- [ ] Signature verification works
- [ ] Can run multiple OGP instances on same machine
- [ ] Local federation works (OpenClaw ↔ Hermes)
- [ ] Remote federation works (Hermes ↔ remote OpenClaw)
- [ ] Scope enforcement works
- [ ] Rate limiting works
- [ ] Agent-comms intent works
- [ ] Project intents work

### Native Integration (Phase 2)

- [ ] Hermes speaks OGP without Node.js daemon
- [ ] Interoperates with Node.js OGP instances
- [ ] All protocol features implemented
- [ ] Performance meets requirements
- [ ] Security audit passed
- [ ] Documentation complete
- [ ] Migration guide published

---

## Success Metrics

### Phase 1 (Sidecar)
- ✅ Zero breaking changes to OpenClaw integration
- ✅ Hermes can federate with OpenClaw instances
- ✅ Setup time < 10 minutes
- ✅ Documentation clarity score > 8/10

### Phase 2 (Native)
- ✅ No Node.js dependency for Hermes deployments
- ✅ 100% protocol compatibility with Node.js OGP
- ✅ Performance: <50ms message processing latency
- ✅ Code coverage > 80%
- ✅ Production deployment success rate > 95%

---

**Last Updated:** 2026-04-04
**Next Review:** After Phase 1 completion
