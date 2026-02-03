import { Adaptive, ConfigRegistry, CommandRouter } from '@git-stunts/alfred-live';

const bulkheadLimit = new Adaptive(10);
const registry = new ConfigRegistry();

registry.register('bulkhead/limit', bulkheadLimit, {
  parse: (value) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      throw new Error('bulkhead/limit must be a number');
    }
    return parsed;
  },
  format: (value) => value.toString(),
});

const router = new CommandRouter(registry);

console.log('read_config:', router.execute({ type: 'read_config', path: 'bulkhead/limit' }));
console.log(
  'write_config:',
  router.execute({ type: 'write_config', path: 'bulkhead/limit', value: '5' })
);
console.log('list_config:', router.execute({ type: 'list_config', prefix: 'bulkhead' }));
