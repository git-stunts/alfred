export function defer() {
  let resolve;
  const promise = new Promise((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

export async function flush(ticks = 1) {
  for (let i = 0; i < ticks; i++) {
    await Promise.resolve();
  }
}

export async function waitFor(condition, ticks = 10) {
  for (let i = 0; i < ticks; i++) {
    if (condition()) return;
    await flush(1);
  }
  throw new Error('Condition not met within flush window.');
}
