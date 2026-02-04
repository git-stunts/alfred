import { ConfigRegistry, ControlPlane, LivePolicyPlan } from '../../src/index.js';

const registry = new ConfigRegistry();
const controlPlane = new ControlPlane(registry);
const livePlan = LivePolicyPlan.bulkhead('bulkhead', { limit: 3, queueLimit: 5 });
const result = controlPlane.registerLivePolicy(livePlan, 'gateway/api');

if (!result.ok) {
  throw new Error(result.error.message);
}

const { policy } = result.data;

async function mockCall() {
  await new Promise((resolve) => setTimeout(resolve, 50));
  return 'ok';
}

async function run() {
  console.log('Initial limit:', registry.read('gateway/api/bulkhead/limit'));
  await Promise.all([policy.execute(mockCall), policy.execute(mockCall)]);

  registry.write('gateway/api/bulkhead/limit', '1');
  console.log('Updated limit:', registry.read('gateway/api/bulkhead/limit'));

  await Promise.all([policy.execute(mockCall), policy.execute(mockCall), policy.execute(mockCall)]);
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
