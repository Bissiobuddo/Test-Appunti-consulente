import { Capacitor } from "@capacitor/core";

/** true nell'app Android: niente server, le chiamate AI e i feed partono dal telefono con la chiave dell'utente. */
export const isNative = Capacitor.isNativePlatform();
