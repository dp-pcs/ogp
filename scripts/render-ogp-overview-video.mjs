#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const outDir = 'artifacts/ogp-overview-video';
const slideDir = join(outDir, 'slides');
mkdirSync(slideDir, { recursive: true });

const renderSlidesOnly = process.argv.includes('--slides-only');

const width = 1920;
const height = 1080;
const fps = 30;
const clipDuration = 6.8;
const transitionDuration = 0.6;

const palette = {
  ink: '#10131c',
  panel: '#171d2a',
  panel2: '#1d2738',
  line: '#3c485f',
  text: '#f4f7fb',
  muted: '#9eacc2',
  teal: '#37d2c3',
  amber: '#f3bb55',
  coral: '#ff6f61',
  blue: '#7ca7ff',
  green: '#84d977'
};

const slides = [
  {
    kicker: '@dp-pcs/ogp',
    title: 'Open Gateway Protocol',
    subtitle: 'BGP-style peering for AI gateways: signed, scoped, human-approved federation.',
    body: [
      'Agents can collaborate across different gateways without sharing credentials, memory, or raw context.',
      'The gateway is the trust boundary.'
    ],
    visual: 'network',
    narration: 'Open Gateway Protocol, or OGP, is federation for AI gateways. The simple version: your assistant can call your coworker\'s assistant directly, without either of you copy-pasting messages or sharing credentials.'
  },
  {
    kicker: 'The Problem',
    title: 'Useful agents are trapped in local silos',
    subtitle: 'OpenClaw, Hermes, and future gateways all have their own tools, memory, and security boundaries.',
    body: [
      'Today, collaboration usually means a human relays messages by hand.',
      'That is slow, lossy, and impossible to audit at scale.'
    ],
    visual: 'silos',
    narration: 'The problem is that useful agents live inside local silos. OpenClaw, Hermes, and other gateways have their own tools and memory. Humans end up acting as the relay, which is slow and hard to audit.'
  },
  {
    kicker: 'The Model',
    title: 'Peer relationships, not central authority',
    subtitle: 'Each gateway owns a keypair and forms bilateral relationships with peers.',
    body: [
      'Discovery starts at /.well-known/ogp.',
      'A request becomes usable only after human approval.'
    ],
    visual: 'handshake',
    narration: 'OGP uses peer relationships instead of central authority. Each gateway owns a keypair. Federation starts with public discovery, then a signed request, then explicit human approval.'
  },
  {
    kicker: 'Trust Boundary',
    title: 'Agents stay contained inside their gateway',
    subtitle: 'Peers send signed intents. They do not get direct access to tools, memory, shells, or model sessions.',
    body: [
      'Every cross-gateway message is attributable to a peer key.',
      'Every inbound action runs through policy before it reaches an agent.'
    ],
    visual: 'boundary',
    narration: 'The important design choice is containment. Agents never leave their own gateway. A peer sends a signed intent, and the receiving gateway decides whether that intent is allowed before it reaches an agent.'
  },
  {
    kicker: 'Scope Control',
    title: 'Three layers of no',
    subtitle: 'Capabilities say what a gateway can support. Grants say what this peer may use. Runtime enforcement checks every message.',
    body: [
      'Per-peer intents, topic limits, and rate limits make trust granular.',
      'Revocation is unilateral and immediate.'
    ],
    visual: 'layers',
    narration: 'Permissions are not all-or-nothing. OGP has three layers: what the gateway can support, what this specific peer is granted, and what the runtime doorman allows for each message.'
  },
  {
    kicker: 'Agent-Comms',
    title: 'Structured messages between assistants',
    subtitle: 'Topic routing, priorities, conversation IDs, and signed replies make remote collaboration practical.',
    body: [
      'Use cases include memory questions, project status, task handoffs, and peer-to-peer debugging.',
      'Replies can return by callback or polling.'
    ],
    visual: 'messages',
    narration: 'On top of federation, OGP has agent-comms. That gives assistants topic routing, priorities, conversation threads, and signed replies, so remote collaboration can be structured instead of just chat pasted into chat.'
  },
  {
    kicker: 'Projects',
    title: 'Collaboration context without shared tooling',
    subtitle: 'Project intents move high-level facts: join, contribute, query, and status.',
    body: [
      'A peer can use Beads, Linear, a notebook, or nothing at all.',
      'OGP moves concise project facts across the federation boundary.'
    ],
    visual: 'project',
    narration: 'Projects are optional collaboration boundaries on top of federation. They do not require everyone to use the same task tool. OGP moves concise facts like joins, contributions, queries, and status.'
  },
  {
    kicker: 'Multi-Framework',
    title: 'One protocol, multiple runtimes',
    subtitle: 'The reference daemon runs alongside OpenClaw, Hermes, or standalone setups with isolated state.',
    body: [
      'Meta-config supports multiple framework homes and daemon ports.',
      'The wire protocol stays gateway-neutral.'
    ],
    visual: 'frameworks',
    narration: 'The reference implementation already supports multiple runtimes. It can run beside OpenClaw, Hermes, or a standalone gateway. The local adapter changes, but the wire protocol stays neutral.'
  },
  {
    kicker: 'Where It Is Going',
    title: 'One trust relationship, many agent personas',
    subtitle: 'The v0.7 design advertises multiple addressable personas under one gateway keypair.',
    body: [
      'Junior, Sterling, Apollo, or any specialist can be visible per peer and per scope.',
      'No extra federation handshake for every agent.'
    ],
    visual: 'personas',
    narration: 'The next design step is multi-agent personas. One human-level trust relationship can expose multiple addressable assistants, with grants that decide which peer can reach which persona.'
  },
  {
    kicker: 'Demo Takeaway',
    title: 'OGP turns agent collaboration into infrastructure',
    subtitle: 'Signed messages, scoped grants, audit trails, and revocation give personal and team agents a real federation layer.',
    body: [
      'Not a chat bridge. Not a shared account. A protocol boundary.',
      'Built in TypeScript, shipping as @dp-pcs/ogp.'
    ],
    visual: 'final',
    narration: 'The takeaway: OGP turns agent collaboration into infrastructure. Not a chat bridge. Not a shared account. A protocol boundary with signed messages, scoped grants, audit trails, and revocation.'
  }
];

function esc(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function wrapText(text, maxChars) {
  const words = text.split(/\s+/);
  const lines = [];
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length > maxChars && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function textBlock(lines, x, y, maxChars, size, fill, gap = Math.round(size * 1.35), weight = 500) {
  const out = [];
  let cursor = y;
  for (const source of lines) {
    for (const line of wrapText(source, maxChars)) {
      out.push(`<text x="${x}" y="${cursor}" font-size="${size}" font-weight="${weight}" fill="${fill}">${esc(line)}</text>`);
      cursor += gap;
    }
    cursor += Math.round(gap * 0.35);
  }
  return out.join('\n');
}

function node(x, y, label, accent, sub = '') {
  return `
    <rect x="${x - 150}" y="${y - 72}" width="300" height="144" rx="18" fill="${palette.panel}" stroke="${accent}" stroke-width="3"/>
    <circle cx="${x - 100}" cy="${y - 20}" r="16" fill="${accent}"/>
    <text x="${x - 70}" y="${y - 18}" font-size="28" font-weight="800" fill="${palette.text}">${esc(label)}</text>
    <text x="${x - 100}" y="${y + 30}" font-size="20" fill="${palette.muted}">${esc(sub)}</text>
  `;
}

function arrow(x1, y1, x2, y2, color = palette.teal) {
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const head = 18;
  const hx1 = x2 - head * Math.cos(angle - Math.PI / 7);
  const hy1 = y2 - head * Math.sin(angle - Math.PI / 7);
  const hx2 = x2 - head * Math.cos(angle + Math.PI / 7);
  const hy2 = y2 - head * Math.sin(angle + Math.PI / 7);
  return `
    <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="5" stroke-linecap="round"/>
    <path d="M ${x2} ${y2} L ${hx1} ${hy1} L ${hx2} ${hy2} Z" fill="${color}"/>
  `;
}

function visual(name) {
  switch (name) {
    case 'network':
      return `
        ${node(1230, 390, 'Gateway A', palette.teal, 'David + Junior')}
        ${node(1600, 390, 'Gateway B', palette.amber, 'Stan + agent')}
        ${arrow(1385, 390, 1445, 390, palette.blue)}
        ${arrow(1445, 430, 1385, 430, palette.coral)}
        <text x="1362" y="330" font-size="22" fill="${palette.muted}">signed OGP</text>
        <rect x="1140" y="575" width="560" height="160" rx="20" fill="${palette.panel2}" stroke="${palette.line}"/>
        <text x="1190" y="635" font-size="28" font-weight="800" fill="${palette.text}">No central relay</text>
        <text x="1190" y="690" font-size="24" fill="${palette.muted}">No shared credentials. No copied context.</text>
      `;
    case 'silos':
      return `
        <rect x="1110" y="270" width="240" height="470" rx="28" fill="${palette.panel}" stroke="${palette.teal}" stroke-width="3"/>
        <rect x="1440" y="270" width="240" height="470" rx="28" fill="${palette.panel}" stroke="${palette.amber}" stroke-width="3"/>
        <text x="1170" y="350" font-size="32" font-weight="800" fill="${palette.text}">OpenClaw</text>
        <text x="1512" y="350" font-size="32" font-weight="800" fill="${palette.text}">Hermes</text>
        <line x1="1350" y1="510" x2="1440" y2="510" stroke="${palette.coral}" stroke-width="5" stroke-dasharray="16 16"/>
        <text x="1295" y="575" font-size="24" fill="${palette.coral}">human relay</text>
        <text x="1150" y="670" font-size="22" fill="${palette.muted}">tools</text>
        <text x="1150" y="710" font-size="22" fill="${palette.muted}">memory</text>
        <text x="1485" y="670" font-size="22" fill="${palette.muted}">tools</text>
        <text x="1485" y="710" font-size="22" fill="${palette.muted}">memory</text>
      `;
    case 'handshake':
      return `
        ${node(1090, 310, '1. Discover', palette.blue, '/.well-known/ogp')}
        ${node(1435, 500, '2. Request', palette.teal, 'signed body')}
        ${node(1090, 690, '3. Approve', palette.amber, 'human gate')}
        ${arrow(1235, 340, 1295, 455, palette.blue)}
        ${arrow(1295, 545, 1235, 655, palette.amber)}
      `;
    case 'boundary':
      return `
        <rect x="1110" y="250" width="630" height="500" rx="30" fill="${palette.panel}" stroke="${palette.teal}" stroke-width="4"/>
        <text x="1170" y="330" font-size="36" font-weight="900" fill="${palette.text}">Gateway policy boundary</text>
        <rect x="1190" y="400" width="200" height="110" rx="16" fill="${palette.panel2}" stroke="${palette.line}"/>
        <text x="1245" y="468" font-size="30" font-weight="800" fill="${palette.text}">Doorman</text>
        <rect x="1490" y="400" width="160" height="110" rx="16" fill="${palette.panel2}" stroke="${palette.line}"/>
        <text x="1534" y="468" font-size="30" font-weight="800" fill="${palette.text}">Agent</text>
        ${arrow(1030, 455, 1180, 455, palette.coral)}
        ${arrow(1395, 455, 1480, 455, palette.green)}
        <text x="1035" y="410" font-size="22" fill="${palette.muted}">signed intent</text>
        <text x="1400" y="410" font-size="22" fill="${palette.muted}">allowed</text>
      `;
    case 'layers':
      return [0, 1, 2].map((i) => {
        const labels = ['Capabilities', 'Peer grants', 'Runtime doorman'];
        const subs = ['what I can support', 'what you may use', 'this request passes?'];
        const colors = [palette.blue, palette.amber, palette.teal];
        const y = 300 + i * 155;
        return `<rect x="1110" y="${y}" width="620" height="105" rx="18" fill="${palette.panel}" stroke="${colors[i]}" stroke-width="3"/>
          <text x="1160" y="${y + 44}" font-size="30" font-weight="900" fill="${palette.text}">${labels[i]}</text>
          <text x="1160" y="${y + 82}" font-size="23" fill="${palette.muted}">${subs[i]}</text>`;
      }).join('\n');
    case 'messages':
      return `
        <rect x="1110" y="265" width="620" height="475" rx="26" fill="${palette.panel}" stroke="${palette.line}"/>
        <text x="1170" y="340" font-size="30" font-weight="900" fill="${palette.text}">agent-comms</text>
        <text x="1170" y="410" font-size="25" fill="${palette.teal}">topic: project-alpha</text>
        <text x="1170" y="470" font-size="25" fill="${palette.amber}">priority: high</text>
        <text x="1170" y="530" font-size="25" fill="${palette.blue}">conversationId: sprint-42</text>
        <text x="1170" y="590" font-size="25" fill="${palette.green}">reply: signed callback</text>
        <rect x="1190" y="645" width="460" height="46" rx="12" fill="${palette.panel2}"/>
        <text x="1220" y="676" font-size="22" fill="${palette.muted}">structured enough to automate</text>
      `;
    case 'project':
      return `
        <rect x="1120" y="300" width="580" height="390" rx="28" fill="${palette.panel}" stroke="${palette.line}"/>
        ${['project.join', 'project.contribute', 'project.query', 'project.status'].map((label, i) => {
          const y = 365 + i * 75;
          const c = [palette.teal, palette.amber, palette.blue, palette.green][i];
          return `<circle cx="1180" cy="${y}" r="15" fill="${c}"/><text x="1225" y="${y + 9}" font-size="30" font-weight="800" fill="${palette.text}">${label}</text>`;
        }).join('\n')}
      `;
    case 'frameworks':
      return `
        ${node(1120, 350, 'OpenClaw', palette.teal, '~/.ogp-openclaw')}
        ${node(1510, 350, 'Hermes', palette.amber, '~/.ogp-hermes')}
        <rect x="1208" y="590" width="540" height="130" rx="22" fill="${palette.panel2}" stroke="${palette.blue}" stroke-width="3"/>
        <text x="1270" y="645" font-size="34" font-weight="900" fill="${palette.text}">Same OGP wire protocol</text>
        <text x="1270" y="690" font-size="23" fill="${palette.muted}">adapter changes, federation stays stable</text>
      `;
    case 'personas':
      return `
        <rect x="1090" y="250" width="670" height="500" rx="30" fill="${palette.panel}" stroke="${palette.teal}" stroke-width="4"/>
        <text x="1160" y="320" font-size="32" font-weight="900" fill="${palette.text}">David's gateway keypair</text>
        ${['Junior - primary', 'Sterling - finance', 'Apollo - research'].map((label, i) => {
          const y = 405 + i * 95;
          const c = [palette.teal, palette.amber, palette.blue][i];
          return `<rect x="1190" y="${y}" width="440" height="62" rx="16" fill="${palette.panel2}" stroke="${c}" stroke-width="2"/>
            <text x="1230" y="${y + 41}" font-size="28" font-weight="800" fill="${palette.text}">${label}</text>`;
        }).join('\n')}
        <text x="1160" y="705" font-size="24" fill="${palette.muted}">peer x intent x persona grants</text>
      `;
    case 'final':
      return `
        <circle cx="1385" cy="500" r="220" fill="${palette.panel}" stroke="${palette.teal}" stroke-width="5"/>
        <text x="1286" y="482" font-size="54" font-weight="950" fill="${palette.text}">OGP</text>
        <text x="1190" y="545" font-size="28" fill="${palette.muted}">signed scoped federation</text>
        <text x="1185" y="680" font-size="26" fill="${palette.amber}">npm install -g @dp-pcs/ogp</text>
      `;
    default:
      return '';
  }
}

function svg(slide, index) {
  const progress = `${String(index + 1).padStart(2, '0')} / ${String(slides.length).padStart(2, '0')}`;
  const titleLines = wrapText(slide.title, 32);
  const titleSvg = titleLines.map((line, i) =>
    `<text x="140" y="${230 + i * 82}" font-size="76" font-weight="950" fill="${palette.text}">${esc(line)}</text>`
  ).join('\n');
  const subtitleY = titleLines.length > 1 ? 390 : 306;
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <radialGradient id="glow" cx="68%" cy="35%" r="55%">
      <stop offset="0%" stop-color="#25445b"/>
      <stop offset="55%" stop-color="#141b27"/>
      <stop offset="100%" stop-color="${palette.ink}"/>
    </radialGradient>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="22" stdDeviation="20" flood-color="#000000" flood-opacity="0.28"/>
    </filter>
  </defs>
  <rect width="${width}" height="${height}" fill="url(#glow)"/>
  <path d="M 0 980 C 330 890 630 1030 960 945 C 1320 852 1590 975 1920 870 L 1920 1080 L 0 1080 Z" fill="#0b0f17" opacity="0.88"/>
  <g font-family="Avenir Next, Helvetica Neue, Arial, sans-serif">
    <text x="140" y="120" font-size="24" font-weight="800" fill="${palette.teal}">${esc(slide.kicker.toUpperCase())}</text>
    ${titleSvg}
    ${textBlock([slide.subtitle], 140, subtitleY, 48, 34, palette.muted, 46, 500)}
    <g transform="translate(0, 40)">
      ${textBlock(slide.body, 170, 520, 49, 28, palette.text, 40, 600)}
    </g>
    <g filter="url(#shadow)">
      ${visual(slide.visual)}
    </g>
    <text x="140" y="980" font-size="22" fill="${palette.muted}">Open Gateway Protocol</text>
    <text x="1700" y="980" font-size="22" fill="${palette.muted}">${progress}</text>
  </g>
</svg>`;
}

if (renderSlidesOnly) {
  rmSync(slideDir, { recursive: true, force: true });
}
mkdirSync(slideDir, { recursive: true });

const pngs = [];
for (let i = 0; i < slides.length; i++) {
  const base = `slide-${String(i + 1).padStart(2, '0')}`;
  const svgPath = join(slideDir, `${base}.svg`);
  const pngPath = join(slideDir, `${base}.png`);
  writeFileSync(svgPath, svg(slides[i], i));
  pngs.push(pngPath);
}

const storyboard = slides.map((slide, i) => [
  `## ${i + 1}. ${slide.title}`,
  `Kicker: ${slide.kicker}`,
  `Subtitle: ${slide.subtitle}`,
  '',
  slide.body.map((item) => `- ${item}`).join('\n'),
  '',
  `Narration: ${slide.narration}`,
  ''
].join('\n')).join('\n');
writeFileSync(join(outDir, 'storyboard.md'), `# OGP Overview Demo Storyboard\n\n${storyboard}`);

const narrationText = slides.map((slide) => slide.narration).join('\n\n');
writeFileSync(join(outDir, 'narration.txt'), narrationText);

if (renderSlidesOnly) {
  console.log(`Wrote SVG slides and narration scaffold to ${outDir}`);
  process.exit(0);
}

for (const png of pngs) {
  if (!existsSync(png)) {
    throw new Error(`Missing PNG slide ${png}. Run SVG-to-PNG capture before final rendering.`);
  }
}

const motionProfiles = [
  { dx: 26, dy: 14, phaseX: 0.0, phaseY: 0.5 },
  { dx: -24, dy: 18, phaseX: 0.8, phaseY: 1.2 },
  { dx: 20, dy: -16, phaseX: 1.4, phaseY: 0.3 },
  { dx: -22, dy: -14, phaseX: 0.2, phaseY: 1.8 }
];
const transitions = [
  'smoothleft',
  'fadeblack',
  'smoothup',
  'circleopen',
  'smoothright',
  'wipeleft',
  'fadegrays',
  'diagtl',
  'smoothdown'
];

const ffmpegArgs = ['-y'];
for (const png of pngs) {
  ffmpegArgs.push('-loop', '1', '-t', String(clipDuration), '-i', resolve(png));
}

const filterParts = [];
for (let i = 0; i < pngs.length; i++) {
  const profile = motionProfiles[i % motionProfiles.length];
  filterParts.push(
    `[${i}:v]scale=2160:1215,` +
    `crop=${width}:${height}:` +
    `x='(in_w-out_w)/2+(${profile.dx})*sin(t*0.42+${profile.phaseX})':` +
    `y='(in_h-out_h)/2+(${profile.dy})*cos(t*0.34+${profile.phaseY})',` +
    `fps=${fps},trim=duration=${clipDuration},setpts=PTS-STARTPTS[v${i}]`
  );
}

let currentLabel = 'v0';
for (let i = 1; i < pngs.length; i++) {
  const offset = ((clipDuration - transitionDuration) * i).toFixed(3);
  const nextLabel = i === pngs.length - 1 ? 'outv' : `x${i}`;
  const transition = transitions[(i - 1) % transitions.length];
  filterParts.push(
    `[${currentLabel}][v${i}]xfade=transition=${transition}:duration=${transitionDuration}:offset=${offset}[${nextLabel}]`
  );
  currentLabel = nextLabel;
}

const animatedVideo = join(outDir, 'ogp-overview-demo-animated.mp4');
ffmpegArgs.push(
  '-filter_complex', filterParts.join(';'),
  '-map', `[${currentLabel}]`,
  '-r', String(fps),
  '-c:v', 'libx264',
  '-movflags', '+faststart',
  '-pix_fmt', 'yuv420p',
  animatedVideo
);

execFileSync('ffmpeg', ffmpegArgs, { stdio: 'inherit' });

if (!existsSync(animatedVideo)) {
  throw new Error(`Render failed: ${animatedVideo} was not created`);
}

console.log(`Rendered ${animatedVideo}`);
