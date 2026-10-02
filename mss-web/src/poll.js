// Start-to-start overlap is avoided by scheduling only after settlement.
export function poll(task, delay = 10000) {
  let stopped = false;
  let timer;
  async function run() {
    try { await task(); } finally { if (!stopped) timer = setTimeout(run, delay); }
  }
  run();
  return () => { stopped = true; clearTimeout(timer); };
}
