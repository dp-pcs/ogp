import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Detect the user's shell
 */
function detectShell(): 'bash' | 'zsh' | 'unknown' {
  const shell = process.env.SHELL || '';

  if (shell.includes('bash')) {
    return 'bash';
  } else if (shell.includes('zsh')) {
    return 'zsh';
  }

  return 'unknown';
}

/**
 * Install bash completion script
 */
function installBashCompletion(): void {
  const homeDir = os.homedir();
  const ogpDir = path.join(homeDir, '.ogp');
  const completionScriptSrc = path.resolve(__dirname, '../../scripts/completion.bash');
  const completionScriptDest = path.join(ogpDir, 'completion.bash');
  const bashrcPath = path.join(homeDir, '.bashrc');
  const bashProfilePath = path.join(homeDir, '.bash_profile');

  if (!fs.existsSync(completionScriptSrc)) {
    console.error(`Error: Completion script not found at ${completionScriptSrc}`);
    console.error('This may be a packaging issue. Please report this bug.');
    process.exit(1);
  }

  // Ensure ~/.ogp directory exists
  if (!fs.existsSync(ogpDir)) {
    fs.mkdirSync(ogpDir, { recursive: true });
  }

  // Copy completion script
  fs.copyFileSync(completionScriptSrc, completionScriptDest);
  console.log(`✓ Copied completion script to ${completionScriptDest}`);

  // Add source line to appropriate rc file
  const sourceLine = `\n# OGP completion\n[ -f "${completionScriptDest}" ] && source "${completionScriptDest}"\n`;

  // Check if we should use .bashrc or .bash_profile
  let rcPath = bashrcPath;
  if (!fs.existsSync(bashrcPath) && fs.existsSync(bashProfilePath)) {
    rcPath = bashProfilePath;
  }

  // Check if already sourced
  let rcContent = '';
  if (fs.existsSync(rcPath)) {
    rcContent = fs.readFileSync(rcPath, 'utf-8');
  }

  if (rcContent.includes(completionScriptDest)) {
    console.log(`✓ Completion already configured in ${rcPath}`);
  } else {
    fs.appendFileSync(rcPath, sourceLine);
    console.log(`✓ Added source line to ${rcPath}`);
  }

  console.log('');
  console.log('Installation complete!');
  console.log('');
  console.log('To activate completion in your current shell, run:');
  console.log(`  source ${completionScriptDest}`);
  console.log('');
  console.log('Or start a new shell session.');
}

/**
 * Install zsh completion script
 */
function installZshCompletion(): void {
  const homeDir = os.homedir();
  const zshCompletionDir = path.join(homeDir, '.zsh', 'completion');
  const completionScriptSrc = path.resolve(__dirname, '../../scripts/completion.zsh');
  const completionScriptDest = path.join(zshCompletionDir, '_ogp');
  const zshrcPath = path.join(homeDir, '.zshrc');

  if (!fs.existsSync(completionScriptSrc)) {
    console.error(`Error: Completion script not found at ${completionScriptSrc}`);
    console.error('This may be a packaging issue. Please report this bug.');
    process.exit(1);
  }

  // Create zsh completion directory if it doesn't exist
  if (!fs.existsSync(zshCompletionDir)) {
    fs.mkdirSync(zshCompletionDir, { recursive: true });
    console.log(`✓ Created ${zshCompletionDir}`);
  }

  // Copy completion script
  fs.copyFileSync(completionScriptSrc, completionScriptDest);
  console.log(`✓ Copied zsh completion script to ${completionScriptDest}`);

  // Add fpath and compinit to zshrc if needed
  let zshrcContent = '';
  if (fs.existsSync(zshrcPath)) {
    zshrcContent = fs.readFileSync(zshrcPath, 'utf-8');
  }

  // Check if fpath already includes our completion directory
  const needsFpath = !zshrcContent.includes('.zsh/completion');
  const needsCompinit = !zshrcContent.includes('compinit');

  if (needsFpath || needsCompinit) {
    // Be smart about what to add
    let addCommand = '\n# OGP completion\n';

    if (needsFpath) {
      addCommand += 'fpath=(~/.zsh/completion $fpath)\n';
    }

    if (needsCompinit) {
      addCommand += 'autoload -Uz compinit && compinit\n';
    }

    if (fs.existsSync(zshrcPath)) {
      fs.appendFileSync(zshrcPath, addCommand);
      console.log(`✓ Updated ${zshrcPath} with completion setup`);
    } else {
      fs.writeFileSync(zshrcPath, addCommand);
      console.log(`✓ Created ${zshrcPath} with completion setup`);
    }
  } else {
    console.log(`✓ Completion setup already exists in ${zshrcPath}`);
  }

  console.log('');
  console.log('Installation complete!');
  console.log('');
  console.log('To activate completion in your current shell, run:');
  console.log('  source ~/.zshrc');
  console.log('');
  console.log('Or start a new shell session.');
  console.log('Note: You may need to run "rm ~/.zcompdump && compinit" to rebuild completion cache');
}

/**
 * Install completion for current shell
 */
export async function installCompletion(): Promise<void> {
  const shell = detectShell();

  if (shell === 'unknown') {
    console.error('Error: Could not detect shell. Currently only bash and zsh are supported.');
    console.error(`Your SHELL environment variable is: ${process.env.SHELL || '(not set)'}`);
    process.exit(1);
  }

  console.log(`Detected shell: ${shell}`);
  console.log('');

  if (shell === 'bash') {
    installBashCompletion();
  } else if (shell === 'zsh') {
    installZshCompletion();
  }
}
