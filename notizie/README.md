# 📰 Notizie Chiare

App che ogni giorno legge le principali testate, raggruppa gli articoli che parlano dello stesso fatto
e fa riassumere le notizie dall'AI (Claude), divise per categoria. Per ogni notizia confronta le fonti,
indica quanto è attendibile e cita sempre le testate, con il link agli articoli.
Le notizie si possono ascoltare in auto e farsi spiegare quando manca il contesto.

Come l'app «Appunti Vocali AI» di questo repository, funziona in due modi:
- **App Android (APK)**: funziona da sola, senza server. La chiave Claude si inserisce nelle Impostazioni e resta sul telefono.
- **Sito web (PWA)**: lo pubblichi su un server e lo usi da computer o telefono. La chiave sta sul server.

## Funzioni

| | |
|---|---|
| **Rassegna per categoria** | Italia, Mondo, Economia, Tecnologia, Scienza e salute, Cultura e spettacoli, Sport. Si filtrano con le etichette in alto; nelle impostazioni scegli quali preparare e quante notizie per categoria. |
| **Confronto tra le fonti** | Ogni notizia ha un'etichetta di attendibilità: **Confermata** (più testate concordano), **Parzialmente confermata** (dettagli diversi o in evoluzione), **Fonte unica**, **Versioni contrastanti**. Nel dettaglio trovi cosa riporta ciascuna testata quando non concordano, le cautele (dichiarazioni di parte, stime provvisorie…) e l'elenco delle fonti con link agli articoli. Un filtro mostra solo le notizie confermate. |
| **Spiegamelo** | Per chi parte da zero: contesto, perché conta, possibili implicazioni, parole da capire e cosa non si sa ancora. Puoi anche fare domande libere sulla notizia. Spiegazioni e risposte restano salvate. |
| **Modalità auto** | Tocca «Ascolta le notizie»: l'app legge una notizia dopo l'altra (titolo, riassunto, fonti e attendibilità) con pulsanti grandi per pausa, avanti e indietro e la velocità regolabile. Lo schermo resta acceso. Nelle impostazioni puoi far leggere anche punti chiave, cautele e la spiegazione dei termini. |
| **Fonti** | ANSA, AGI, Rai News, Corriere della Sera, la Repubblica, Il Sole 24 Ore, Il Post, La Gazzetta dello Sport, BBC News. Si possono disattivare e si possono aggiungere altri feed RSS. |

La rassegna resta salvata **sul dispositivo**: si può riaprire e ascoltare anche senza rete.

### Come lavora l'AI e cosa sapere

- L'app scarica i feed RSS delle testate (ultime 30 ore circa) e passa a Claude **titoli e sommari**, non gli articoli completi. Claude raggruppa, riassume e confronta solo su quella base: per i dettagli apri gli articoli citati.
- Le fonti citate sono sempre articoli realmente letti dai feed: se l'AI indicasse un articolo inesistente, viene scartato.
- Più testate che riprendono lo stesso lancio di agenzia non sono conferme davvero indipendenti: l'AI lo segnala quando se ne accorge.
- «Spiegamelo» usa anche le conoscenze generali del modello, che potrebbero non includere gli sviluppi più recenti; l'app lo ricorda sotto ogni spiegazione.
- Se una testata cambia l'indirizzo del suo feed, l'app la segnala come «non raggiungibile» e continua con le altre.

### Costi

Ogni aggiornamento fa una richiesta a Claude per categoria; «Spiegamelo» e le domande una richiesta ciascuna.
Nelle impostazioni puoi scegliere **Claude Opus 5.5** (massima qualità, predefinito) o **Claude Sonnet 5.5**
(più veloce ed economico) e ridurre categorie e numero di notizie. Sul server la stessa rassegna richiesta
più volte entro 20 minuti non viene rigenerata.

## 📱 Installare l'app Android

1. Dal telefono apri la pagina **Releases** del repository e scarica l'ultimo `NotizieChiare-….apk` (release «Notizie Chiare»).
2. Aprilo e consenti l'installazione da questa fonte.
3. Apri **Notizie Chiare**, tocca ⚙️ e incolla la **chiave Claude** ([console.anthropic.com](https://console.anthropic.com/settings/keys)).
4. Tocca «Aggiorna».

L'APK viene compilato da GitHub Actions (`.github/workflows/notizie-android.yml`) a ogni modifica della cartella `notizie/`
e pubblicato nelle Releases: come versione stabile quando la modifica arriva su `main`, come «anteprima» dagli altri branch. Per la lettura ad alta voce usa la sintesi vocale di
Android: se non parla, controlla in *Impostazioni › Sintesi vocale* che sia installata la voce italiana.

## Avvio in locale

Serve Node.js 22 o superiore.

```bash
cd notizie
npm install
cp .env.example .env      # poi inserisci la chiave
npm run dev               # web su http://localhost:5173, API su :3000
npm test                  # test di lettura feed e sintesi (senza chiamare l'AI)
```

Per la produzione:

```bash
npm run build
npm start                 # tutto su http://localhost:3000
```

| Variabile | A cosa serve |
|---|---|
| `ANTHROPIC_API_KEY` | Chiave Claude per riassumere, confrontare e spiegare le notizie. |
| `APP_PASSWORD` | Password per proteggere il sito quando è online. Consigliata: senza, chiunque abbia il link può usare la tua chiave. |

Per pubblicarlo online vale quanto scritto nel README principale (Render, Railway, VPS…; nella cartella c'è un `Dockerfile`).
Su Render imposta come *Root directory* `notizie`.

## Struttura

```
server/              API Node/Express per la versione web (/api/digest, /api/explain, /api/ask)
shared/
  sources.ts         Categorie, testate e indirizzi dei feed
  feeds.ts           Lettura dei feed RSS/Atom, doppioni, numerazione degli articoli
  prompt.ts          Istruzioni per l'AI (sintesi, attendibilità, spiegazioni)
  schema.ts          Schema delle notizie e delle spiegazioni (Zod)
  digest.ts          Chiamate a Claude (usate dal server e dall'app Android)
src/
  components/        Scheda notizia, Spiegamelo, Modalità auto, Impostazioni
  lib/               chiamate API, archivio locale, sintesi vocale, testo da leggere
android/             Progetto Android (Capacitor)
```
