// Tiene lo schermo acceso durante dettatura/registrazione (utile in auto).
let sentinel: WakeLockSentinel | null = null;

export async function keepAwake() {
  try {
    sentinel = (await navigator.wakeLock?.request("screen")) ?? null;
  } catch {
    sentinel = null;
  }
}

export async function releaseAwake() {
  await sentinel?.release().catch(() => {});
  sentinel = null;
}
