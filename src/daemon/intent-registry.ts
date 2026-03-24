import fs from 'node:fs';
import path from 'node:path';
import { getConfigDir, ensureConfigDir } from '../shared/config.js';

export interface Intent {
  name: string;
  description: string;
  schema?: Record<string, any>;  // JSON schema for parameters
  handler?: string;              // handler script path or command
}

const INTENTS_FILE = path.join(getConfigDir(), 'intent-registry.json');

const DEFAULT_INTENTS: Intent[] = [
  {
    name: 'message',
    description: 'Simple text message',
    schema: {
      type: 'object',
      properties: {
        text: { type: 'string' }
      },
      required: ['text']
    }
  },
  {
    name: 'task-request',
    description: 'Request a peer to perform a task',
    schema: {
      type: 'object',
      properties: {
        taskType: { type: 'string' },
        description: { type: 'string' },
        parameters: { type: 'object' }
      },
      required: ['taskType', 'description']
    }
  },
  {
    name: 'status-update',
    description: 'Status update from a peer',
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string' },
        message: { type: 'string' }
      },
      required: ['status']
    }
  },
  {
    name: 'agent-comms',
    description: 'Agent-to-agent communication with topic routing',
    schema: {
      type: 'object',
      properties: {
        topic: { type: 'string', description: 'Topic category for routing (e.g., "memory-management")' },
        message: { type: 'string', description: 'The message content' },
        replyTo: { type: 'string', format: 'uri', description: 'Callback URL for async reply' },
        conversationId: { type: 'string', description: 'Thread identifier for multi-turn conversations' },
        priority: { type: 'string', enum: ['low', 'normal', 'high'], description: 'Message priority level' }
      },
      required: ['topic', 'message']
    }
  }
];

export function loadIntents(): Intent[] {
  ensureConfigDir();
  if (!fs.existsSync(INTENTS_FILE)) {
    saveIntents(DEFAULT_INTENTS);
    return DEFAULT_INTENTS;
  }

  const data = fs.readFileSync(INTENTS_FILE, 'utf-8');
  const existingIntents = JSON.parse(data) as Intent[];

  // Merge new default intents that don't exist in the file (upgrade path)
  let updated = false;
  for (const defaultIntent of DEFAULT_INTENTS) {
    const exists = existingIntents.some(i => i.name === defaultIntent.name);
    if (!exists) {
      existingIntents.push(defaultIntent);
      updated = true;
      console.log(`[OGP] Added new default intent: ${defaultIntent.name}`);
    }
  }

  // Save if we added new intents
  if (updated) {
    saveIntents(existingIntents);
  }

  return existingIntents;
}

export function saveIntents(intents: Intent[]): void {
  ensureConfigDir();
  fs.writeFileSync(INTENTS_FILE, JSON.stringify(intents, null, 2), 'utf-8');
}

export function registerIntent(intent: Intent): void {
  const intents = loadIntents();
  const existing = intents.findIndex(i => i.name === intent.name);
  if (existing >= 0) {
    intents[existing] = intent;
  } else {
    intents.push(intent);
  }
  saveIntents(intents);
}

export function getIntent(name: string): Intent | null {
  const intents = loadIntents();
  return intents.find(i => i.name === name) || null;
}

export function removeIntent(name: string): boolean {
  const intents = loadIntents();
  const index = intents.findIndex(i => i.name === name);
  if (index >= 0) {
    intents.splice(index, 1);
    saveIntents(intents);
    return true;
  }
  return false;
}

export function listIntents(): Intent[] {
  return loadIntents();
}
