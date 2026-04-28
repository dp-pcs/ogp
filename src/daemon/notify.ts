import {
  type FederatedMessageClass,
  type HumanSurfacingMode,
  type RelayHandlingMode,
  requireConfig,
  type InboundFederationMode,
  type OGPConfig
} from '../shared/config.js';
import crypto from 'node:crypto';
import { dispatchAgentHook, injectMessage } from './openclaw-bridge.js';
import { sendReply, type ReplyPayload } from './reply-handler.js';
import { shouldRelaxTls } from '../shared/tls.js';

export interface NotificationPayload {
  text: string;
  sessionKey?: string;
  metadata?: Record<string, any>;
  messageClass?: FederatedMessageClass;
  /**
   * Target agent for routing the notification.
   * If specified, looks up notifyTargets[agent] first, then falls back to legacy notifyTarget.
   */
  agent?: string;
  /**
   * Peer ID of the sender (for hook payload)
   */
  peerId?: string;
  /**
   * Intent that triggered this notification (for hook payload)
   */
  intent?: string;
  /**
   * Topic for agent-comms notifications (for hook payload)
   */
  topic?: string;
  /**
   * Display name of the peer (for Hermes integration)
   */
  peerDisplayName?: string;
  /**
   * Priority level (for Hermes integration)
   */
  priority?: 'low' | 'normal' | 'high';
  /**
   * Conversation ID for threading (for Hermes integration)
   */
  conversationId?: string;
}

/**
 * Notification backend interface for platform-agnostic notifications.
 * Each platform (OpenClaw, Hermes, etc.) implements this interface.
 */
interface NotificationBackend {
  readonly name: string;
  notify(payload: NotificationPayload, config: OGPConfig): Promise<boolean>;
}

export interface EffectiveFederatedHandlingPolicy {
  messageClass: FederatedMessageClass;
  topic?: string;
  mode: InboundFederationMode;
  relayMode: RelayHandlingMode;
  surfaceToHuman: HumanSurfacingMode;
  allowDirectPeerReply: boolean;
}

type MutableFederatedHandlingPolicy = {
  mode?: InboundFederationMode;
  relayMode?: RelayHandlingMode;
  surfaceToHuman?: HumanSurfacingMode;
  allowDirectPeerReply?: boolean;
};

/**
 * Resolve the notification target for a given agent.
 * Priority:
 * 1. notifyTargets[agent] (if agent specified and exists in map)
 * 2. legacy notifyTarget (for backward compatibility)
 * 3. undefined (no specific target)
 */
function resolveNotifyTarget(config: OGPConfig, agent?: string): string | undefined {
  // Check per-agent targets first if agent is specified
  if (agent && config.notifyTargets?.[agent]) {
    return config.notifyTargets[agent];
  }
  // Fall back to legacy notifyTarget
  return config.notifyTarget;
}

function resolveHumanDeliveryTarget(config: OGPConfig, agent?: string): string | undefined {
  return config.humanDeliveryTarget || resolveNotifyTarget(config, agent);
}

function resolveInternalOpenClawSessionKey(config: OGPConfig): string {
  const agentId = config.agentId || 'main';
  return `agent:${agentId}:main`;
}

function targetToSessionKey(target: string, agentId: string): string {
  if (target.startsWith('agent:')) {
    return target;
  }

  if (target.startsWith('session:')) {
    return target.slice('session:'.length);
  }

  if (target.startsWith('telegram:')) {
    const chatId = target.replace('telegram:', '');
    return `agent:${agentId}:telegram:direct:${chatId}`;
  }

  return `agent:${agentId}:main`;
}

function resolveOpenClawSessionKey(config: OGPConfig, agent?: string): string {
  const agentId = config.agentId || 'main';
  const target = resolveHumanDeliveryTarget(config, agent);

  if (target) {
    return targetToSessionKey(target, agentId);
  }

  return `agent:${agentId}:main`;
}

function resolveOpenClawDeliveryTarget(
  config: OGPConfig,
  agent?: string
): { channel?: string; to?: string } | undefined {
  const target = resolveHumanDeliveryTarget(config, agent);
  if (!target) {
    return undefined;
  }

  if (target.startsWith('telegram:')) {
    return {
      channel: 'telegram',
      to: target.replace('telegram:', '')
    };
  }

  const parts = target.split(':').filter(Boolean);
  if (parts[0] !== 'agent') {
    return undefined;
  }

  if (parts.length >= 5 && parts[2] === 'telegram' && parts[3] === 'direct') {
    return {
      channel: 'telegram',
      to: parts[4]
    };
  }

  if (parts.length >= 6 && parts[2] === 'telegram' && parts[4] === 'direct') {
    return {
      channel: 'telegram',
      to: parts[5]
    };
  }

  return undefined;
}

function getInboundFederationMode(config: OGPConfig): InboundFederationMode | undefined {
  return config.inboundFederationPolicy?.mode;
}

function getPayloadMetadata(payload: NotificationPayload): Record<string, any> {
  return payload.metadata ?? {};
}

function getOgpMetadata(payload: NotificationPayload): Record<string, any> {
  const metadata = getPayloadMetadata(payload);
  return metadata.ogp ?? {};
}

function resolvePayloadIntent(payload: NotificationPayload): string | undefined {
  return payload.intent || getOgpMetadata(payload).intent;
}

function resolvePayloadTopic(payload: NotificationPayload): string | undefined {
  return payload.topic || getOgpMetadata(payload).topic;
}

function resolvePayloadPeerId(payload: NotificationPayload): string | undefined {
  const ogp = getOgpMetadata(payload);
  return payload.peerId || ogp.from || ogp.peer?.id;
}

function resolvePayloadPeerDisplayName(payload: NotificationPayload): string | undefined {
  const ogp = getOgpMetadata(payload);
  return payload.peerDisplayName || ogp.peer?.displayName;
}

function mergeRule(
  target: MutableFederatedHandlingPolicy,
  rule?: {
    mode?: InboundFederationMode;
    relayMode?: RelayHandlingMode;
    surfaceToHuman?: HumanSurfacingMode;
    allowDirectPeerReply?: boolean;
  }
): void {
  if (!rule) {
    return;
  }

  if (rule.mode !== undefined) {
    target.mode = rule.mode;
  }
  if (rule.relayMode !== undefined) {
    target.relayMode = rule.relayMode;
  }
  if (rule.surfaceToHuman !== undefined) {
    target.surfaceToHuman = rule.surfaceToHuman;
  }
  if (rule.allowDirectPeerReply !== undefined) {
    target.allowDirectPeerReply = rule.allowDirectPeerReply;
  }
}

function applyDelegatedAuthorityPrecedence(
  accumulated: MutableFederatedHandlingPolicy,
  config: OGPConfig,
  messageClass: FederatedMessageClass,
  topic?: string,
  peerId?: string
): void {
  const legacyMode = getInboundFederationMode(config);
  if (legacyMode) {
    accumulated.mode = legacyMode;
  }

  const delegatedAuthority = config.delegatedAuthority;
  if (!delegatedAuthority) {
    return;
  }

  const peerScope = peerId ? delegatedAuthority.peers?.[peerId] : undefined;

  // Deterministic precedence contract:
  // 1. Legacy coarse mode as baseline fallback
  // 2. Default rules: global, then peer
  // 3. Message-class rules: global, then peer
  // 4. Topic rules: global, then peer
  //
  // This prevents peer defaults from accidentally erasing a more specific
  // global class rule such as "human-relay must not allow direct peer reply."
  mergeRule(accumulated, delegatedAuthority.global.defaultRule);
  mergeRule(accumulated, peerScope?.defaultRule);
  mergeRule(accumulated, delegatedAuthority.global.classRules?.[messageClass]);
  mergeRule(accumulated, peerScope?.classRules?.[messageClass]);

  if (topic) {
    mergeRule(accumulated, delegatedAuthority.global.topicRules?.[topic]);
    mergeRule(accumulated, peerScope?.topicRules?.[topic]);
  }
}

/**
 * Send replyTo callback if present in payload metadata
 * This completes the --wait loop for the initiating peer
 */
async function handleReplyToCallback(payload: NotificationPayload, success: boolean, data?: any, error?: string): Promise<void> {
  const ogp = getOgpMetadata(payload);
  const replyTo = ogp.replyTo;
  const nonce = ogp.nonce;
  const peerId = resolvePayloadPeerId(payload);

  if (!replyTo || !nonce || !peerId) {
    // No replyTo callback requested
    return;
  }

  const replyPayload: ReplyPayload = {
    nonce,
    success,
    data,
    error,
    timestamp: new Date().toISOString()
  };

  try {
    const result = await sendReply(peerId, replyTo, replyPayload);
    if (!result.success) {
      console.warn(`[OGP] Failed to send replyTo callback to ${peerId}:`, result.error);
    }
  } catch (err) {
    console.error(`[OGP] Error sending replyTo callback to ${peerId}:`, err);
  }
}

export function classifyFederatedMessage(payload: NotificationPayload): FederatedMessageClass {
  if (payload.messageClass) {
    return payload.messageClass;
  }

  const ogp = getOgpMetadata(payload);
  const intent = resolvePayloadIntent(payload);

  if (ogp.messageClass) {
    return ogp.messageClass as FederatedMessageClass;
  }

  switch (ogp.type) {
    case 'federation_request':
    case 'approval_request':
      return 'approval-request';
    case 'federation_removed':
      return 'status-update';
  }

  if (ogp.requestedHumanRelay === true) {
    return 'human-relay';
  }

  if (intent === 'status-update') {
    return 'status-update';
  }

  if (intent === 'agent-comms') {
    return 'agent-work';
  }

  return 'agent-work';
}

function defaultRelayModeForMode(mode: InboundFederationMode): RelayHandlingMode {
  switch (mode) {
    case 'approval-required':
      return 'approval-required';
    case 'summarize':
      return 'summarize';
    case 'forward':
    case 'autonomous':
    default:
      return 'deliver';
  }
}

function defaultSurfaceToHumanForMode(mode: InboundFederationMode): HumanSurfacingMode {
  switch (mode) {
    case 'forward':
      return 'always';
    case 'autonomous':
      return 'important-only';
    case 'approval-required':
      return 'always';
    case 'summarize':
    default:
      return 'summary-only';
  }
}

export function resolveFederatedHandlingPolicy(
  config: OGPConfig,
  payload: NotificationPayload
): EffectiveFederatedHandlingPolicy {
  const messageClass = classifyFederatedMessage(payload);
  const topic = resolvePayloadTopic(payload);
  const peerId = resolvePayloadPeerId(payload);
  const accumulated: MutableFederatedHandlingPolicy = {};

  applyDelegatedAuthorityPrecedence(accumulated, config, messageClass, topic, peerId);

  if (messageClass === 'approval-request') {
    return {
      messageClass,
      topic,
      mode: accumulated.mode ?? 'approval-required',
      relayMode: accumulated.relayMode ?? 'approval-required',
      surfaceToHuman: accumulated.surfaceToHuman ?? 'always',
      allowDirectPeerReply: accumulated.allowDirectPeerReply ?? false
    };
  }

  const mode = accumulated.mode ?? 'summarize';
  const relayMode = accumulated.relayMode ?? (
    messageClass === 'human-relay'
      ? defaultRelayModeForMode(mode)
      : defaultRelayModeForMode(mode)
  );
  const surfaceToHuman = accumulated.surfaceToHuman ?? (
    messageClass === 'human-relay' && relayMode === 'deliver'
      ? 'always'
      : messageClass === 'status-update'
        ? 'summary-only'
        : defaultSurfaceToHumanForMode(mode)
  );
  const allowDirectPeerReply = accumulated.allowDirectPeerReply ?? (
    messageClass === 'agent-work' && mode !== 'approval-required'
  );

  return {
    messageClass,
    topic,
    mode,
    relayMode,
    surfaceToHuman,
    allowDirectPeerReply
  };
}

function shouldDeliverToHuman(policy: EffectiveFederatedHandlingPolicy): boolean {
  if (policy.messageClass === 'approval-request') {
    return true;
  }

  return policy.surfaceToHuman !== 'never';
}

export function formatHandlingGuidance(
  config: OGPConfig,
  payload: NotificationPayload
): string {
  const policy = resolveFederatedHandlingPolicy(config, payload);
  const target = resolveHumanDeliveryTarget(config);
  const targetNote = target ? `Configured human delivery target: ${target}.` : '';

  switch (policy.messageClass) {
    case 'approval-request':
      return `Message class: approval-request. Human preference: hold action and peer replies until the human explicitly approves. Surface this request to the human now. ${targetNote}`.trim();
    case 'human-relay':
      switch (policy.relayMode) {
        case 'summarize':
          return `Message class: human-relay. Human preference: summarize the requested relay for the human instead of claiming verbatim delivery. Do not tell the peer the human was notified unless that actually happened. ${targetNote}`.trim();
        case 'approval-required':
          return `Message class: human-relay. Human preference: hold this relay for approval before treating it as delivered. Do not claim delivery to the peer until the human approves and the delivery actually happens. ${targetNote}`.trim();
        case 'deliver':
        default:
          return `Message class: human-relay. Human preference: treat this as a delivery obligation to the configured human channel. Do not claim delivery to the peer unless you actually deliver it there. ${targetNote}`.trim();
      }
    case 'status-update':
      return `Message class: status-update. Human preference: keep this lightweight and summarize it unless it becomes urgent or approval-related. ${targetNote}`.trim();
  }

  switch (policy.mode) {
    case 'forward':
      return `Human preference: proactively forward inbound federated items to the configured human channel. Do not claim delivery unless you actually send it there. ${targetNote}`.trim();
    case 'summarize':
      return `Human preference: summarize inbound federated items and surface only action requests, uncertainty, or important updates. Do not assume that mentioning it in a different channel counts as delivery. ${targetNote}`.trim();
    case 'autonomous':
      return `Human preference: act autonomously when possible, but if a peer explicitly asks you to tell the human something, treat that as a delivery obligation to the configured human channel. ${targetNote}`.trim();
    case 'approval-required':
      return `Human preference: do not act on or reply to federated requests until the human explicitly approves. ${targetNote}`.trim();
    default:
      return '';
  }
}

/**
 * OpenClaw notification backend.
 * Uses the OpenClaw gateway RPC to deliver messages into the correct session.
 */
class OpenClawBackend implements NotificationBackend {
  readonly name = 'openclaw';

  async notify(payload: NotificationPayload, config: OGPConfig): Promise<boolean> {
    const peerName = resolvePayloadPeerDisplayName(payload) || resolvePayloadPeerId(payload) || 'unknown peer';
    const intent = resolvePayloadIntent(payload) || 'message';
    const topic = resolvePayloadTopic(payload) || 'general';
    const handlingGuidance = formatHandlingGuidance(config, payload);
    const policy = resolveFederatedHandlingPolicy(config, payload);
    const deliverToHuman = shouldDeliverToHuman(policy);

    const taskText = `Federated message from ${peerName} (${intent}/${topic}).

Message:
${payload.text}${
      handlingGuidance ? `\n\n[OGP Handling Policy]\n${handlingGuidance}` : ''
    }`;

    const sessionMessageText = `[OGP Federation] From ${peerName} (${intent}/${topic}):\n${payload.text}${
      handlingGuidance ? `\n\n[OGP Handling Policy]\n${handlingGuidance}` : ''
    }`;

    try {
      const deliveryTarget = deliverToHuman
        ? resolveOpenClawDeliveryTarget(config, payload.agent)
        : undefined;
      const deliverySessionKey = deliverToHuman
        ? resolveOpenClawSessionKey(config, payload.agent)
        : resolveInternalOpenClawSessionKey(config);
      const hookDelivered = await dispatchAgentHook(taskText, peerName, {
        deliver: deliverToHuman,
        target: deliveryTarget,
        sessionKey: deliverySessionKey
      });
      if (hookDelivered) {
        if (!deliverToHuman) {
          console.log('[OGP] Message delivered to OpenClaw via /hooks/agent without proactive human delivery for peer:', peerName);

          // Send replyTo callback if requested
          await handleReplyToCallback(payload, true, { received: true });

          return true;
        }

        const sessionKey = resolveOpenClawSessionKey(config, payload.agent);
        const syncNote = `[OGP Internal Sync]
A federated request from ${peerName} (${intent}/${topic}) was handled via /hooks/agent and delivered to the configured human channel.

Do not treat this as a new pending delivery obligation unless the human asks you to revisit it.

Handled message summary:
${payload.text}`;

        const synced = await injectMessage(sessionKey, syncNote, peerName);
        if (!synced) {
          console.warn('[OGP] Hook delivery succeeded, but DM-session sync note failed for peer:', peerName);
        }

        console.log('[OGP] Message delivered to OpenClaw via /hooks/agent for peer:', peerName);

        // Send replyTo callback if requested
        await handleReplyToCallback(payload, true, { received: true });

        return true;
      }

      const sessionKey = deliverToHuman
        ? resolveOpenClawSessionKey(config, payload.agent)
        : resolveInternalOpenClawSessionKey(config);
      const result = await injectMessage(sessionKey, sessionMessageText, peerName);
      if (result) {
        console.log('[OGP] Message delivered to OpenClaw session fallback for peer:', peerName);

        // Send replyTo callback if requested
        await handleReplyToCallback(payload, true, { received: true });

        return true;
      } else {
        console.error('[OGP] OpenClaw notification delivery failed');

        // Send failure callback if requested
        await handleReplyToCallback(payload, false, undefined, 'OpenClaw session injection failed');

        return false;
      }
    } catch (err) {
      console.error('[OGP] Message injection failed:', err);

      // Send failure callback if requested
      await handleReplyToCallback(payload, false, undefined, err instanceof Error ? err.message : String(err));

      return false;
    }
  }
}

/**
 * Hermes notification backend.
 * Uses Hermes's webhook platform adapter for OGP integration.
 */
class HermesBackend implements NotificationBackend {
  readonly name = 'hermes';

  async notify(payload: NotificationPayload, config: OGPConfig): Promise<boolean> {
    const policy = resolveFederatedHandlingPolicy(config, payload);
    const webhookUrl = config.hermesWebhookUrl || 'http://localhost:8644/webhooks/ogp_federation';
    const secret = config.hermesWebhookSecret;

    if (!secret) {
      console.error('[OGP] Hermes webhook secret not configured. Set hermesWebhookSecret in config.json');
      return false;
    }

    // Build webhook payload
    // Note: event_type is required by Hermes webhook event filter ("events" subscription list)
    const intentStr = resolvePayloadIntent(payload) || 'message';
    const body = {
      event_type: intentStr,  // required for Hermes event filter ("*" is not a wildcard there)
      peer_id: resolvePayloadPeerId(payload) || 'unknown',
      peer_display_name: resolvePayloadPeerDisplayName(payload) || resolvePayloadPeerId(payload) || 'Unknown Peer',
      intent: intentStr,
      topic: resolvePayloadTopic(payload) || 'general',
      message: payload.text,
      priority: payload.priority || 'normal',
      conversation_id: payload.conversationId,
      human_delivery_target: resolveHumanDeliveryTarget(config, payload.agent),
      handling_mode: policy.mode,
      message_class: classifyFederatedMessage(payload),
      human_surfacing_mode: policy.surfaceToHuman,
      relay_mode: policy.relayMode,
      timestamp: new Date().toISOString(),
      payload: payload.metadata || {}
    };

    const bodyStr = JSON.stringify(body);

    // Compute HMAC signature
    const signature = crypto
      .createHmac('sha256', secret)
      .update(bodyStr)
      .digest('hex');

    try {
      const result = await new Promise<boolean>((resolve) => {
        import('node:https').then(({ request: httpsRequest }) => {
          import('node:http').then(({ request: httpRequest }) => {
            import('node:url').then(({ URL }) => {
              const url = new URL(webhookUrl);
              const isHttps = url.protocol === 'https:';
              const reqFn = isHttps ? httpsRequest : httpRequest;

              // SECURITY (F-03): TLS verification is relaxed only for loopback
              // (typical local Hermes dev setup). Remote Hermes URLs get full
              // certificate verification. Operators who deliberately point at
              // a remote self-signed Hermes can opt in via OGP_HERMES_INSECURE_TLS=1.
              const req = (reqFn as typeof httpsRequest)({
                hostname: url.hostname,
                port: url.port || (isHttps ? 443 : 80),
                path: url.pathname,
                method: 'POST',
                rejectUnauthorized: !shouldRelaxTls(url.hostname, 'OGP_HERMES_INSECURE_TLS'),
                headers: {
                  'Content-Type': 'application/json',
                  'X-Hub-Signature-256': `sha256=${signature}`,
                  'Content-Length': Buffer.byteLength(bodyStr),
                },
              }, (res) => {
                resolve(res.statusCode !== undefined && res.statusCode >= 200 && res.statusCode < 300);
              });

              req.on('error', (error) => {
                console.error('[OGP] Hermes webhook request error:', error);
                resolve(false);
              });
              req.setTimeout(5000, () => {
                req.destroy();
                resolve(false);
              });
              req.write(bodyStr);
              req.end();
            });
          });
        });
      });

      if (result) {
        console.log('[OGP] Notified Hermes via webhook:', payload.text);

        // Send replyTo callback if requested
        await handleReplyToCallback(payload, true, { received: true });

        return true;
      } else {
        console.error('[OGP] Hermes webhook call failed (non-2xx response)');

        // Send failure callback if requested
        await handleReplyToCallback(payload, false, undefined, 'Hermes webhook returned non-2xx status');

        return false;
      }
    } catch (error) {
      console.error('[OGP] Hermes webhook failed:', error);

      // Send failure callback if requested
      await handleReplyToCallback(payload, false, undefined, error instanceof Error ? error.message : String(error));

      return false;
    }
  }
}

/**
 * Get the appropriate notification backend based on platform config.
 * Defaults to OpenClaw for backward compatibility.
 */
function getNotificationBackend(config: OGPConfig): NotificationBackend {
  const platform = config.platform || 'openclaw';

  switch (platform) {
    case 'hermes':
      return new HermesBackend();
    case 'openclaw':
    default:
      return new OpenClawBackend();
  }
}

export async function notifyOpenClaw(payload: NotificationPayload): Promise<boolean> {
  const config = requireConfig();
  const backend = getNotificationBackend(config);
  return backend.notify(payload, config);
}

/**
 * Send notification to the local AI agent using the configured platform backend.
 * This is the recommended function for new code.
 *
 * @param payload Notification data including message, peer info, and metadata
 * @returns Promise<boolean> indicating success
 */
export async function notifyLocalAgent(payload: NotificationPayload): Promise<boolean> {
  const config = requireConfig();
  const backend = getNotificationBackend(config);
  return backend.notify(payload, config);
}

/**
 * Inject plain text into the local OpenClaw session without wrapping it as an
 * inbound federation message. This is used to mirror local outbound actions
 * into the agent's visible conversation state.
 */
export async function deliverLocalSessionText(text: string, agent?: string): Promise<boolean> {
  const config = requireConfig();

  if ((config.platform || 'openclaw') !== 'openclaw') {
    return false;
  }

  const sessionKey = resolveOpenClawSessionKey(config, agent);
  return injectMessage(sessionKey, text);
}
