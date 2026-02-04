#!/usr/bin/env node

import { randomUUID } from 'node:crypto';
import { encodeCommandEnvelope } from '../src/command-envelope.js';

const usage = `alfredctl - emit Alfred Live control-plane commands (JSONL)

Usage:
  alfredctl list [prefix] [--id <id>] [--auth <token>]
  alfredctl read <path> [--id <id>] [--auth <token>]
  alfredctl write <path> <value> [--id <id>] [--auth <token>]

Options:
  --id <id>     Command id (default: random UUID)
  --auth <token> Optional auth token
  -h, --help    Show this help
`;

function fail(message) {
  process.stderr.write(`${message}\n\n${usage.trim()}\n`);
  process.exit(1);
}

function parseArgs(argv) {
  const options = { id: undefined, auth: undefined };
  const positionals = [];

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === '--') {
      positionals.push(...argv.slice(i + 1));
      break;
    }

    if (arg === '-h' || arg === '--help') {
      return { help: true, options, positionals };
    }

    if (arg === '--id' || arg === '--auth') {
      const value = argv[i + 1];
      if (!value) {
        fail(`Missing value for ${arg}.`);
      }
      if (arg === '--id') {
        options.id = value;
      } else {
        options.auth = value;
      }
      i += 1;
      continue;
    }

    if (arg.startsWith('--')) {
      fail(`Unknown option: ${arg}`);
    }

    positionals.push(arg);
  }

  return { help: false, options, positionals };
}

function buildEnvelope(positionals, options) {
  if (positionals.length === 0) {
    fail('Missing command.');
  }

  const [command, ...rest] = positionals;
  const id = options.id ?? randomUUID();
  const auth = options.auth;

  switch (command) {
    case 'list': {
      if (rest.length > 1) {
        fail('list accepts at most one prefix argument.');
      }
      const args = rest[0] ? { prefix: rest[0] } : {};
      return { id, cmd: 'list_config', args, auth };
    }
    case 'read': {
      if (rest.length !== 1) {
        fail('read requires exactly one path argument.');
      }
      return { id, cmd: 'read_config', args: { path: rest[0] }, auth };
    }
    case 'write': {
      if (rest.length !== 2) {
        fail('write requires a path and value argument.');
      }
      return { id, cmd: 'write_config', args: { path: rest[0], value: rest[1] }, auth };
    }
    default:
      fail(`Unknown command: ${command}`);
      return null;
  }
}

const parsed = parseArgs(process.argv.slice(2));
if (parsed.help) {
  process.stdout.write(`${usage.trim()}\n`);
  process.exit(0);
}

const envelope = buildEnvelope(parsed.positionals, parsed.options);
if (!envelope) {
  process.exit(1);
}
const encoded = encodeCommandEnvelope(envelope);
if (!encoded.ok) {
  process.stderr.write(`${encoded.error.code}: ${encoded.error.message}\n`);
  if (encoded.error.details) {
    process.stderr.write(`${JSON.stringify(encoded.error.details, null, 2)}\n`);
  }
  process.exit(1);
}

process.stdout.write(`${encoded.data}\n`);
