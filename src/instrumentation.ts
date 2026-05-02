export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { startWindRefresh } = await import('./lib/wind/cache');
    startWindRefresh();
  }
}