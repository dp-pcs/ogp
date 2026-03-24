import fs from 'node:fs';
import path from 'node:path';
import { registerIntent, removeIntent as removeIntentFromRegistry, listIntents, getIntent } from '../daemon/intent-registry.js';
export function registerNewIntent(name, options) {
    // Validation
    if (!name || name.trim() === '') {
        console.error('Error: Intent name is required');
        process.exit(1);
    }
    if (!options.description || options.description.trim() === '') {
        console.error('Error: Description is required');
        process.exit(1);
    }
    if (options.script && !fs.existsSync(options.script)) {
        console.error(`Error: Script file not found: ${options.script}`);
        process.exit(1);
    }
    if (options.script && !fs.statSync(options.script).isFile()) {
        console.error(`Error: Script path must be a file: ${options.script}`);
        process.exit(1);
    }
    // Make script path absolute if provided
    const scriptPath = options.script ? path.resolve(options.script) : undefined;
    // Check if script is executable (if provided)
    if (scriptPath) {
        try {
            fs.accessSync(scriptPath, fs.constants.X_OK);
        }
        catch {
            console.error(`Error: Script is not executable: ${scriptPath}`);
            console.error('Run: chmod +x ' + scriptPath);
            process.exit(1);
        }
    }
    // Check if intent already exists
    const existing = getIntent(name);
    if (existing) {
        console.log(`Intent "${name}" already exists. Updating...`);
    }
    const intent = {
        name,
        description: options.description,
        handler: scriptPath
    };
    registerIntent(intent);
    if (existing) {
        console.log(`✓ Intent updated: ${name}`);
    }
    else {
        console.log(`✓ Intent registered: ${name}`);
    }
    console.log(`  Description: ${options.description}`);
    if (scriptPath) {
        console.log(`  Script: ${scriptPath}`);
    }
}
export function listRegisteredIntents() {
    const intents = listIntents();
    if (intents.length === 0) {
        console.log('No intents registered.');
        return;
    }
    console.log('\nREGISTERED INTENTS:\n');
    intents.forEach(intent => {
        console.log(`  ${intent.name}`);
        console.log(`    Description: ${intent.description}`);
        if (intent.handler) {
            console.log(`    Handler: ${intent.handler}`);
        }
        if (intent.schema) {
            console.log(`    Schema: ${JSON.stringify(intent.schema, null, 6).split('\n').map(line => '    ' + line).join('\n').trim()}`);
        }
        console.log('');
    });
}
export function removeIntent(name) {
    if (!name || name.trim() === '') {
        console.error('Error: Intent name is required');
        process.exit(1);
    }
    const intent = getIntent(name);
    if (!intent) {
        console.error(`Error: Intent "${name}" not found`);
        process.exit(1);
    }
    // Prevent removing default intents
    const defaultIntents = ['message', 'task-request', 'status-update', 'agent-comms'];
    if (defaultIntents.includes(name)) {
        console.error(`Error: Cannot remove built-in intent: ${name}`);
        process.exit(1);
    }
    const success = removeIntentFromRegistry(name);
    if (success) {
        console.log(`✓ Intent removed: ${name}`);
    }
    else {
        console.error(`Error: Failed to remove intent: ${name}`);
        process.exit(1);
    }
}
//# sourceMappingURL=intent-registry.js.map