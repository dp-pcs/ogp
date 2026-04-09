#!/usr/bin/env node
import { existsSync, mkdirSync, cpSync, readdirSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { createInterface } from 'node:readline';
import { execSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const skillsSrc = join(__dirname, '..', 'skills');

// Detect which AI platform(s) are installed
function detectPlatforms() {
  const platforms = [];

  // Check for OpenClaw
  if (existsSync(join(homedir(), '.openclaw')) || existsSync(join(homedir(), '.claw'))) {
    platforms.push({
      name: 'OpenClaw',
      skillsDir: join(homedir(), '.openclaw', 'skills'),
      check: () => existsSync(join(homedir(), '.openclaw')) || existsSync(join(homedir(), '.claw'))
    });
  }

  // Check for Hermes
  if (existsSync(join(homedir(), '.hermes'))) {
    platforms.push({
      name: 'Hermes',
      skillsDir: join(homedir(), '.claude', 'skills'),
      check: () => existsSync(join(homedir(), '.hermes'))
    });
  }

  // Check for Claude Code (generic)
  if (existsSync(join(homedir(), '.claude', 'skills'))) {
    platforms.push({
      name: 'Claude Code',
      skillsDir: join(homedir(), '.claude', 'skills'),
      check: () => existsSync(join(homedir(), '.claude'))
    });
  }

  // Remove duplicates by skillsDir path
  const seen = new Set();
  return platforms.filter(p => {
    if (seen.has(p.skillsDir)) return false;
    seen.add(p.skillsDir);
    return true;
  });
}

// Auto-discover all skill folders
const availableSkills = readdirSync(skillsSrc, { withFileTypes: true })
  .filter(d => d.isDirectory() && existsSync(join(skillsSrc, d.name, 'SKILL.md')))
  .map(d => d.name);

function getSkillVersion(skill) {
  const skillFile = join(skillsSrc, skill, 'SKILL.md');
  const content = readFileSync(skillFile, 'utf8');
  const match = content.match(/^version:\s*(.+)$/m);
  return match?.[1]?.trim() ?? 'unknown';
}

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

async function selectPlatforms(platforms) {
  if (!isInteractive || platforms.length === 1) {
    // Non-interactive or only one platform: install to all
    return platforms;
  }

  console.log('\n🤖 Detected AI Platforms:\n');
  platforms.forEach((p, i) => {
    console.log(`  ${i + 1}. ${p.name} (${p.skillsDir})`);
  });
  console.log(`  ${platforms.length + 1}. Install to all`);
  console.log(`  0. Cancel\n`);

  const answer = await prompt(`Select platforms to install to (e.g. "1 2" or "${platforms.length + 1}" for all): `);

  if (!answer || answer === '0') {
    console.log('Cancelled.');
    process.exit(0);
  }

  if (answer === String(platforms.length + 1) || answer.toLowerCase() === 'all') {
    return platforms;
  }

  const indices = answer.split(/[\s,]+/).map(n => parseInt(n) - 1).filter(i => i >= 0 && i < platforms.length);
  if (indices.length === 0) {
    console.log('No valid selection. Installing to all platforms.');
    return platforms;
  }

  return indices.map(i => platforms[i]);
}

async function main() {
  const detectedPlatforms = detectPlatforms();

  if (detectedPlatforms.length === 0) {
    console.log('\n⚠️  No supported AI platforms detected.');
    console.log('');
    console.log('OGP skills can be installed to:');
    console.log('  - OpenClaw: ~/.openclaw/skills/');
    console.log('  - Hermes: ~/.claude/skills/');
    console.log('  - Claude Code: ~/.claude/skills/');
    console.log('');
    console.log('To install manually:');
    console.log('  cp -r $(npm root -g)/@dp-pcs/ogp/skills/* ~/.openclaw/skills/');
    console.log('  # or');
    console.log('  cp -r $(npm root -g)/@dp-pcs/ogp/skills/* ~/.claude/skills/');
    process.exit(1);
  }

  const selectedSkills = await selectSkills();
  const selectedPlatforms = await selectPlatforms(detectedPlatforms);

  let totalInstalled = 0;

  for (const platform of selectedPlatforms) {
    console.log(`\n📥 Installing to ${platform.name} (${platform.skillsDir})...`);

    if (!existsSync(platform.skillsDir)) {
      mkdirSync(platform.skillsDir, { recursive: true });
      console.log(`   Created directory: ${platform.skillsDir}`);
    }

    let installed = 0;
    for (const skill of selectedSkills) {
      const src = join(skillsSrc, skill);
      const dest = join(platform.skillsDir, skill);
      try {
        // Replace the installed skill directory wholesale so stale files from
        // previous package versions do not survive upgrades.
        rmSync(dest, { recursive: true, force: true });
        cpSync(src, dest, { recursive: true });
        console.log(`   ✓ ${skill}`);
        installed++;
      } catch (err) {
        console.warn(`   ✗ ${skill}: ${err.message}`);
      }
    }

    console.log(`   ${installed}/${selectedSkills.length} skills installed`);
    totalInstalled += installed;
  }

  if (totalInstalled > 0) {
    console.log(`\n✅ Successfully installed ${totalInstalled} skill(s) to ${selectedPlatforms.length} platform(s)`);
    console.log('');

    const installedVersions = selectedSkills
      .map(skill => `${skill}@${getSkillVersion(skill)}`)
      .join(', ');
    console.log(`Installed skill versions: ${installedVersions}`);
    console.log('Verify installed copies with:');
    console.log("  rg -n '^version:' ~/.openclaw/skills/ogp*/SKILL.md ~/.claude/skills/ogp*/SKILL.md 2>/dev/null");
    console.log('');

    // Platform-specific restart instructions
    const platformNames = selectedPlatforms.map(p => p.name);
    if (platformNames.includes('OpenClaw')) {
      console.log('OpenClaw: Restart your gateway to load the skills');
      console.log('  openclaw restart');
    }
    if (platformNames.includes('Hermes')) {
      console.log('Hermes: Skills are loaded automatically');
      console.log('  hermes skills list  (to verify)');
    }
    if (platformNames.includes('Claude Code')) {
      console.log('Claude Code: Restart Claude Code to load the skills');
    }
  } else {
    console.log('\n⚠️  No skills were installed');
  }
}

main().catch(err => {
  console.warn('\n❌ Install failed:', err.message);
  console.warn('');
  console.warn('Manual install:');
  console.warn('  cp -r $(npm root -g)/@dp-pcs/ogp/skills/* ~/.openclaw/skills/');
  console.warn('  # or');
  console.warn('  cp -r $(npm root -g)/@dp-pcs/ogp/skills/* ~/.claude/skills/');
  process.exit(1);
});
