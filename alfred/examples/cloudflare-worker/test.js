/**
 * Local test runner using Miniflare to verify Alfred works in Cloudflare Workers.
 *
 * Run with: node test.js
 */

import { Miniflare } from 'miniflare';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function runTests() {
  console.log('Starting Miniflare (Cloudflare Workers local runtime)...\n');

  const mf = new Miniflare({
    modules: true,
    scriptPath: join(__dirname, 'dist/worker.js'),
  });

  try {
    const response = await mf.dispatchFetch('http://localhost/');
    const results = await response.json();

    console.log('Runtime:', results.runtime);
    console.log('\nTest Results:');
    console.log('─'.repeat(50));

    for (const test of results.tests) {
      const status = test.passed ? '✓' : '✗';
      const color = test.passed ? '\x1b[32m' : '\x1b[31m';
      console.log(`${color}${status}\x1b[0m ${test.name}`);
      if (!test.passed && test.error) {
        console.log(`  └─ ${test.error}`);
      }
    }

    console.log('─'.repeat(50));
    console.log(`\n${results.summary}`);

    if (results.allPassed) {
      console.log('\n\x1b[32m✓ Alfred works in Cloudflare Workers!\x1b[0m\n');
      process.exit(0);
    } else {
      console.log('\n\x1b[31m✗ Some tests failed\x1b[0m\n');
      process.exit(1);
    }
  } finally {
    await mf.dispose();
  }
}

runTests().catch((err) => {
  console.error('Test runner failed:', err);
  process.exit(1);
});
