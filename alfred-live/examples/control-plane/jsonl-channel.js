import {
  Adaptive,
  CommandRouter,
  ConfigRegistry,
  executeCommandLine,
} from '@git-stunts/alfred-live';

const registry = new ConfigRegistry();
const retryCount = new Adaptive(3);

registry.register('retry/count', retryCount, {
  parse: (value) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      throw new Error('retry/count must be a number');
    }
    return parsed;
  },
  format: (value) => value.toString(),
});

const router = new CommandRouter(registry);

const line = JSON.stringify({
  id: 'cmd-1',
  cmd: 'write_config',
  args: { path: 'retry/count', value: '5' },
});

const resultLine = executeCommandLine(router, line);
if (!resultLine.ok) {
  throw new Error(resultLine.error.message);
}

console.log(resultLine.data);
