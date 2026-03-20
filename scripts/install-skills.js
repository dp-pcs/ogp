#!/usr/bin/env node
import { existsSync, mkdirSync, cpSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const skillsSrc = join(__dirname, '..', 'skills');
const skillsDest = join(homedir(), '.openclaw', 'skills');

const skills = ['ogp', 'ogp-expose'];

try {
  if (!existsSync(skillsDest)) {
    mkdirSync(skillsDest, { recursive: true });
  }

  for (const skill of skills) {
    const src = join(skillsSrc, skill);
    const dest = join(skillsDest, skill);
    if (existsSync(src)) {
      cpSync(src, dest, { recursive: true });
      console.log(`✓ Installed skill: ${skill} → ${dest}`);
    }
  }

  console.log('\nOGP skills installed. Restart your OpenClaw gateway to load them.');
} catch (err) {
  console.warn('Note: Could not auto-install OpenClaw skills:', err.message);
  console.warn('Manual install: cp -r $(npm root -g)/ogp/skills/ogp ~/.openclaw/skills/');
}
