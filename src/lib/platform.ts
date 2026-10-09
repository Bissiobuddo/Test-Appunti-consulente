import { Capacitor } from "@capacitor/core";

/** true nell'app Android: niente server, le chiamate AI partono dal telefono con le chiavi dell'utente. */
export const isNative = Capacitor.isNativePlatform();
