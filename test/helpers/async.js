export function defer() {
  let resolve;
  const promise = new Promise((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

export function flush() {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}
