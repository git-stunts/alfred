import { ConfigRegistry, Policy, defineLiveBulkhead } from '../../src/index.js';

const registry = new ConfigRegistry();

defineLiveBulkhead(registry, 'bulkhead/api', {
  limit: 3,
  queueLimit: 5,
});

const policy = Policy.liveBulkhead('bulkhead/api', registry);

async function mockCall() {
  await new Promise((resolve) => setTimeout(resolve, 50));
  return 'ok';
}

async function run() {
  console.log('Initial limit:', registry.read('bulkhead/api/limit'));
  await Promise.all([policy.execute(mockCall), policy.execute(mockCall)]);

  registry.write('bulkhead/api/limit', '1');
  console.log('Updated limit:', registry.read('bulkhead/api/limit'));

  await Promise.all([policy.execute(mockCall), policy.execute(mockCall), policy.execute(mockCall)]);
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
