/**
 * Cisco-style context-sensitive help with ? symbol
 *
 * Intercepts ? in command line and shows available commands/options at that level
 */
/**
 * Check if arguments contain ? for context-sensitive help
 * Returns the command path before the ? (e.g., ['config', 'health-check'])
 */
export function shouldShowContextHelp(args) {
    const questionIndex = args.findIndex(arg => arg === '?');
    if (questionIndex === -1) {
        return null;
    }
    // Return command path before the ?
    // Skip first 2 args (node and script path)
    const commandArgs = args.slice(2, questionIndex);
    // Filter out flags like --for
    return commandArgs.filter(arg => !arg.startsWith('-'));
}
/**
 * Find a command in the command tree by path
 */
function findCommand(rootCommand, path) {
    let current = rootCommand;
    for (const segment of path) {
        const subcommand = current.commands.find(cmd => cmd.name() === segment);
        if (!subcommand) {
            return null;
        }
        current = subcommand;
    }
    return current;
}
/**
 * Format and display context-sensitive help
 */
export function displayContextHelp(rootCommand, commandPath) {
    const targetCommand = commandPath.length === 0
        ? rootCommand
        : findCommand(rootCommand, commandPath);
    if (!targetCommand) {
        console.error(`Error: Command path '${commandPath.join(' ')}' not found`);
        process.exit(1);
    }
    const commandName = commandPath.length === 0 ? 'ogp' : commandPath.join(' ');
    console.log('');
    console.log(`Available commands for '${commandName}':`);
    console.log('━'.repeat(60));
    console.log('');
    // Show subcommands
    const subcommands = targetCommand.commands.filter(cmd => !cmd.hidden);
    if (subcommands.length > 0) {
        const maxNameLength = Math.max(...subcommands.map(cmd => cmd.name().length));
        subcommands.forEach(cmd => {
            const name = cmd.name().padEnd(maxNameLength + 2);
            const description = cmd.description() || '';
            console.log(`  ${name} ${description}`);
        });
        console.log('');
    }
    // Show options
    const options = targetCommand.options;
    if (options.length > 0) {
        console.log('Options:');
        options.forEach(opt => {
            const flags = opt.flags.padEnd(25);
            const description = opt.description || '';
            console.log(`  ${flags} ${description}`);
        });
        console.log('');
    }
    // Show arguments if this is a leaf command
    const argsList = targetCommand._args || [];
    if (argsList.length > 0) {
        console.log('Arguments:');
        argsList.forEach((arg) => {
            const required = arg.required ? 'required' : 'optional';
            const name = arg.name().padEnd(20);
            const description = arg.description || '';
            console.log(`  ${name} [${required}] ${description}`);
        });
        console.log('');
    }
    // Show usage example
    if (subcommands.length > 0) {
        console.log('Usage:');
        console.log(`  ${commandName} <command> [options]`);
        console.log('');
        console.log('Type "?" after any command to see its available options.');
        console.log(`Example: ${commandName} <command> ?`);
    }
    else if (argsList.length > 0) {
        const argNames = argsList.map((arg) => arg.required ? `<${arg.name()}>` : `[${arg.name()}]`).join(' ');
        console.log('Usage:');
        console.log(`  ${commandName} ${argNames} [options]`);
    }
    console.log('');
}
/**
 * Process context help request if ? is present in args
 * Returns true if help was shown (and program should exit)
 */
export function handleContextHelp(rootCommand, args = process.argv) {
    const commandPath = shouldShowContextHelp(args);
    if (commandPath === null) {
        return false;
    }
    displayContextHelp(rootCommand, commandPath);
    return true;
}
//# sourceMappingURL=context-help.js.map