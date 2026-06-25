export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { startWindRefresh } = await import('./lib/wind/cache');
    startWindRefresh();
  }
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { runStartup } = await import("./startup");
    const { scheduleJob } = await import("./lib/rte/scheduler");

    await runStartup();
    scheduleJob();
  }
}