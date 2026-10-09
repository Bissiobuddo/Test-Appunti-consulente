import { KeepAwake } from "@capacitor-community/keep-awake";
import { isNative } from "./platform.ts";

// Tiene lo schermo acceso durante dettatura/registrazione (utile in auto).
let sentinel: WakeLockSentinel | null = null;

export async function keepAwake() {
  try {
    if (isNative) await KeepAwake.keepAwake();
    else sentinel = (await navigator.wakeLock?.request("screen")) ?? null;
  } catch {
    sentinel = null;
  }
}

export async function releaseAwake() {
  if (isNative) await KeepAwake.allowSleep().catch(() => {});
  await sentinel?.release().catch(() => {});
  sentinel = null;
}
