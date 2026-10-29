# 🎙️ Appunti Vocali AI

App per dettare o registrare appunti a voce (anche in auto, col microfono Bluetooth), trascriverli
e farli organizzare dall'AI (Claude) in un elenco puntato. Gli appunti si possono esportare come
documento o come mappa mentale.

Funziona in due modi:
- **App Android (APK)**: si installa sul telefono e funziona da sola, senza server. Le chiavi API si inseriscono nelle Impostazioni dell'app e restano sul telefono.
- **Sito web (PWA)**: lo pubblichi su un server e lo usi da computer o telefono, anche installandolo dal browser. Le chiavi stanno sul server.

> 📰 Nella cartella [`notizie/`](notizie/README.md) c'è una seconda app, **Notizie Chiare**: riassume le notizie del giorno
> per categoria confrontando le fonti (anche senza AI, gratis), le spiega a chi non ha il contesto e le legge ad alta voce in auto.

## 📱 Installare l'app Android

1. Dal telefono apri la pagina **Releases** di questo repository su GitHub e scarica l'ultimo file `AppuntiVocaliAI-….apk`.
2. Aprilo. Android chiede di consentire l'installazione di app da questa fonte (browser o file manager): accetta.
3. Apri **Appunti Vocali AI**, tocca ⚙️ **Impostazioni** e incolla:
   - la **chiave Claude** ([console.anthropic.com](https://console.anthropic.com/settings/keys)), per organizzare gli appunti;
   - facoltativa, una **chiave OpenAI o Groq**, per «Registra» e «Carica audio».

L'APK viene ricompilato da GitHub Actions a ogni modifica su `main`
(file `.github/workflows/android.yml`). Le nuove versioni si installano sopra la precedente senza perdere gli appunti.

> L'APK è firmato con una chiave di sviluppo inclusa nel repository (`android/app/debug.keystore`).
> Va bene per installarlo sui propri dispositivi; per pubblicarlo sul Play Store serve una chiave di rilascio privata.

Nell'app Android:
- **Detta** usa il riconoscimento vocale di Android: scrive una frase alla volta e riparte da solo dopo ogni pausa. Su alcuni telefoni a ogni ripartenza si sente un breve segnale acustico.
- Per dettati lunghi in auto conviene **Registra**: registra di continuo e trascrive alla fine.

## Funzioni

| | |
|---|---|
| **Detta** | Trascrizione dal vivo mentre parli (riconoscimento vocale del browser, italiano). Si riavvia da solo dopo le pause, così puoi parlare liberamente alla guida. Lo schermo resta acceso. |
| **Registra** | Registra l'audio (pausa e ripresa possibili) e lo trascrive con Whisper alla fine. Puoi scegliere il microfono, ad esempio quello Bluetooth. |
| **Carica file audio** | Trascrive un file già registrato (m4a, mp3, wav, ogg, webm… fino a 25 MB). |
| **Organizza con AI – Fedele** | Divide il testo in sezioni con punti elenco e corregge solo gli errori evidenti di trascrizione. **Non aggiunge contenuti.** Elenca ogni correzione e segnala in "Da verificare" i passaggi poco chiari invece di indovinarli. Estrae anche le cose da fare. |
| **Organizza con AI – Amplia ✦** | Come Fedele, ma aggiunge anche spiegazioni, spunti e domande. Ogni aggiunta è segnata con **✦ AI**, per distinguerla da quello che hai detto tu. |
| **Modifica** | Puoi modificare la trascrizione e anche ogni punto degli appunti: basta toccarlo. |
| **Mappa mentale** | Mappa interattiva generata dagli appunti: si può zoomare e i rami si aprono e chiudono al tocco. |
| **Esporta** | Word (.docx), PDF, Markdown, testo. Mappa mentale come HTML interattivo, immagine SVG, FreeMind `.mm` (si apre con XMind, FreeMind, Freeplane, MindMeister, SimpleMind) e OPML. Su Android compare il menu di condivisione (Drive, email, WhatsApp…). |

Gli appunti restano salvati **sul dispositivo** (IndexedDB del browser) e si possono consultare anche offline.

## Avvio in locale

Serve Node.js 22 o superiore.

```bash
npm install
cp .env.example .env      # poi inserisci le chiavi
npm run dev               # web su http://localhost:5173, API su :3000
```

Per la produzione:

```bash
npm run build
npm start                 # tutto su http://localhost:3000
```

### Variabili d'ambiente (`.env`)

| Variabile | A cosa serve |
|---|---|
| `ANTHROPIC_API_KEY` | Chiave Claude per organizzare, correggere e ampliare gli appunti ([console.anthropic.com](https://console.anthropic.com)). |
| `TRANSCRIPTION_API_KEY` | Chiave per la trascrizione dei file audio e delle registrazioni (OpenAI o Groq). È facoltativa: senza, funziona solo la "Dettatura" dal vivo. |
| `TRANSCRIPTION_API_URL`, `TRANSCRIPTION_MODEL` | L'endpoint compatibile Whisper e il modello da usare (vedi `.env.example`). |
| `APP_PASSWORD` | Password per proteggere il sito quando è online. Consigliata: senza, chiunque abbia il link può usare le tue chiavi. |

## Pubblicarlo online (per usarlo da telefono e da PC)

Sul telefono microfono e installazione funzionano solo se il sito è in **HTTPS**. Qualsiasi hosting
Node va bene: Render, Railway, Fly.io, un VPS… Nel repository c'è un `Dockerfile` pronto.

Esempio con **Render**: crea un nuovo "Web Service" collegato a questo repository, con
- Build command: `npm ci && npm run build`
- Start command: `npm start`
- Variabili d'ambiente: quelle della tabella sopra.

## Note sull'uso in auto e col Bluetooth

- **Dettatura**: usa il microfono attivo nel sistema. Se il telefono è collegato all'auto o a un auricolare Bluetooth, Android in genere usa quello.
- **Registra**: dal menu "Microfono" puoi scegliere esplicitamente il dispositivo Bluetooth.
- La dettatura dal vivo usa il riconoscimento vocale di Google tramite Chrome, quindi serve la connessione. Se il segnale è scarso, conviene **Registra**: l'audio viene trascritto alla fine.
- Usa l'app solo con il telefono fissato al supporto. I pulsanti sono grandi apposta per avviare e fermare la registrazione con un tocco.

## Compilare l'APK in locale

Servono Android Studio (o l'Android SDK) e Java 21.

```bash
npm run android       # compila il sito, lo copia nel progetto Android e apre Android Studio
```

## Struttura

```
server/              API Node/Express per la versione web (rotte /api/*, password)
shared/
  organize.ts        Claude: organizzazione con output strutturato (usata da server e app Android)
  prompt.ts          Istruzioni per l'AI (modalità fedele/amplia)
  transcription.ts   Trascrizione audio (endpoint compatibile Whisper)
  schema.ts          Schema degli appunti organizzati (Zod)
src/
  components/        Capture (detta/registra/carica), NoteEditor, OrganizedView, MindMap, Settings
  lib/               dettatura (web e Android), registratore, archivio locale, esportazioni
android/             Progetto Android (Capacitor)
.github/workflows/   Compilazione automatica dell'APK
```
