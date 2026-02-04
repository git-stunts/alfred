import { InvalidCommandError, errorResult } from './errors.js';

function isObject(value) {
  return value !== null && typeof value === 'object';
}

/**
 * Executes control-plane commands against a ConfigRegistry.
 */
export class CommandRouter {
  #registry;

  /**
   * @param {{ read(path: string): any, write(path: string, value: string): any, keys(prefix?: string): any }} registry
   */
  constructor(registry) {
    this.#registry = registry;
  }

  /**
   * Execute a command and return a Result envelope.
   * @param {{ type: 'read_config' | 'write_config' | 'list_config', path?: string, value?: string, prefix?: string }} command
   * @returns {{ ok: true, data: any } | { ok: false, error: { code: string, message: string, details?: unknown } }}
   */
  execute(command) {
    if (!isObject(command)) {
      return errorResult(new InvalidCommandError('Command must be an object.'));
    }

    switch (command.type) {
      case 'read_config':
        return this.#registry.read(command.path);
      case 'write_config':
        return this.#registry.write(command.path, command.value);
      case 'list_config':
        return this.#registry.keys(command.prefix);
      default:
        return errorResult(
          new InvalidCommandError('Unknown command type.', { type: command.type })
        );
    }
  }
}
