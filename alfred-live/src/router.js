import { InvalidCommandError, errorResult } from './errors.js';

function isObject(value) {
  return value !== null && typeof value === 'object';
}

export class CommandRouter {
  #registry;

  constructor(registry) {
    this.#registry = registry;
  }

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
