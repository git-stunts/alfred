import { ConfigRegistry, ControlPlane, LivePolicyPlan } from '../../src/index.js';

const registry = new ConfigRegistry();
const controlPlane = new ControlPlane(registry);
const livePlan = LivePolicyPlan.bulkhead('bulkhead', { limit: 3, queueLimit: 5 });
const registration = controlPlane.registerLivePolicy(livePlan, 'gateway/api');

if (!registration.ok) {
  throw new Error(registration.error.message);
}

const { policy } = registration.data;

async function mockCall() {
  await new Promise((resolve) => setTimeout(resolve, 50));
  return 'ok';
}

async function run() {
  console.log('Initial limit:', registry.read('gateway/api/bulkhead/limit'));
  const initialResults = await Promise.all([policy.execute(mockCall), policy.execute(mockCall)]);
  for (const execution of initialResults) {
    if (!execution.ok) {
      throw new Error(execution.error.message);
    }
  }

  registry.write('gateway/api/bulkhead/limit', '1');
  console.log('Updated limit:', registry.read('gateway/api/bulkhead/limit'));

  const finalResults = await Promise.all([
    policy.execute(mockCall),
    policy.execute(mockCall),
    policy.execute(mockCall),
  ]);
  for (const execution of finalResults) {
    if (!execution.ok) {
      throw new Error(execution.error.message);
    }
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
