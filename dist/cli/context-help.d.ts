/**
 * Cisco-style context-sensitive help with ? symbol
 *
 * Intercepts ? in command line and shows available commands/options at that level
 */
import type { Command } from 'commander';
/**
 * Check if arguments contain ? for context-sensitive help
 * Returns the command path before the ? (e.g., ['config', 'health-check'])
 */
export declare function shouldShowContextHelp(args: string[]): string[] | null;
/**
 * Format and display context-sensitive help
 */
export declare function displayContextHelp(rootCommand: Command, commandPath: string[]): void;
/**
 * Process context help request if ? is present in args
 * Returns true if help was shown (and program should exit)
 */
export declare function handleContextHelp(rootCommand: Command, args?: string[]): boolean;
//# sourceMappingURL=context-help.d.ts.map