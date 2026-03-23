#!/usr/bin/env node
import { existsSync, mkdirSync, cpSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { createInterface } from 'node:readline';

const __dirname = dirname(fileURLToPath(import.meta.url));
const skillsSrc = join(__dirname, '..', 'skills');
const skillsDest = join(homedir(), '.openclaw', 'skills');

// Auto-discover all skill folders
const availableSkills = readdirSync(skillsSrc, { withFileTypes: true })
  .filter(d => d.isDirectory() && existsSync(join(skillsSrc, d.name, 'SKILL.md')))
  .map(d => d.name);

if (availableSkills.length === 0) {
  console.log('No skills found in the skills/ directory.');
  process.exit(0);
}

// Check if running interactively (TTY) or non-interactively
const isInteractive = process.stdin.isTTY && process.stdout.isTTY;

async function prompt(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => {
    rl.question(question, answer => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function selectSkills() {
  if (!isInteractive) {
    // Non-interactive: install all
    return availableSkills;
  }

  console.log('\n📦 OGP Skills Installer\n');
  console.log('Available skills:');
  availableSkills.forEach((skill, i) => {
    console.log(`  ${i + 1}. ${skill}`);
  });
  console.log(`  ${availableSkills.length + 1}. Install all`);
  console.log(`  0. Cancel\n`);

  const answer = await prompt(`Select skills to install (e.g. "1 3" or "${availableSkills.length + 1}" for all): `);

  if (!answer || answer === '0') {
    console.log('Cancelled.');
    process.exit(0);
  }

  if (answer === String(availableSkills.length + 1) || answer.toLowerCase() === 'all') {
    return availableSkills;
  }

  const indices = answer.split(/[\s,]+/).map(n => parseInt(n) - 1).filter(i => i >= 0 && i < availableSkills.length);
  if (indices.length === 0) {
    console.log('No valid selection. Installing all skills.');
    return availableSkills;
  }

  return indices.map(i => availableSkills[i]);
}

async function main() {
  const selected = await selectSkills();

  if (!existsSync(skillsDest)) {
    mkdirSync(skillsDest, { recursive: true });
  }

  console.log('');
  let installed = 0;
  for (const skill of selected) {
    const src = join(skillsSrc, skill);
    const dest = join(skillsDest, skill);
    try {
      cpSync(src, dest, { recursive: true });
      console.log(`✓ Installed: ${skill} → ${dest}`);
      installed++;
    } catch (err) {
      console.warn(`✗ Failed to install ${skill}: ${err.message}`);
    }
  }

  if (installed > 0) {
    console.log(`\n${installed} skill(s) installed. Restart your OpenClaw gateway to load them.`);
  }
}

main().catch(err => {
  console.warn('Install failed:', err.message);
  console.warn('Manual install: cp -r $(npm root -g)/@dp-pcs/ogp/skills/ogp ~/.openclaw/skills/');
});
