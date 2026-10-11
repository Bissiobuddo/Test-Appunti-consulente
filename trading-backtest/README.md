# Backtest: raddoppiare 5.000 € in 1-3 settimane

**Obiettivo:** investire fino a 5.000 €, arrivare a 10.000 € (+100%) in 1-3 settimane, con
probabilità di successo vicina al 90%.

**Risultato:** non si può fare. Non è questione di trovare l'ingresso giusto: è un limite
matematico, e i dati lo confermano. In questo rapporto ci sono la prova, i numeri e
le alternative che invece reggono.

---

## 1. Il limite matematico (vale per qualunque strategia)

Se un mercato non ti dà un vantaggio vero, cioè se in media non guadagni, la probabilità di
**toccare il doppio del capitale prima di perderlo** non supera il **50%**. Questo vale per
qualunque regola di ingresso e uscita, leva o stop-loss (è la disuguaglianza di Ville / il
teorema di arresto opzionale). Cambiando le regole sposti solo *come* perdi, non *quanto spesso vinci*.

Ragionando al contrario: se raddoppiassi davvero nel 90% dei casi, ogni operazione di 3
settimane renderebbe in media almeno **+80%**. Ripetuta 17 volte l'anno, porterebbe 5.000 € a
circa **100 milioni in 12 mesi**. Nessun fondo al mondo si avvicina a questo risultato: il più
famoso, Medallion di Renaissance, fa circa +66% *all'anno*.

## 2. Cosa ho testato

`backtest.py` prova **294 strategie per mercato**, cioè 7 segnali di ingresso × long/short × leva
(1, 2, 3, 5, 10, 20, 30) × 3 stop-loss, su 5 mercati con dati reali:

| Mercato | Periodo | Barre |
|---|---|---|
| Bitcoin | 2013 – mag 2026 | giornaliere |
| Ethereum | 2015 – mag 2026 | giornaliere |
| Azione (Google) | 2004 – 2013 | giornaliere |
| Petrolio Brent | 1987 – ott 2026 | giornaliere |
| EUR/USD | apr 2017 – feb 2018 | orarie |

I segnali di ingresso sono:
- sempre;
- momentum a 1 mese;
- momentum a 3 mesi;
- breakout del massimo a 1 mese;
- acquisto dopo un crollo;
- volatilità compressa;
- volatilità alta.

L'operazione si apre a ogni segnale e si chiude quando succede una di queste cose:
- tocca l'obiettivo;
- tocca lo stop o la liquidazione;
- passano 3 settimane.

Nei costi ho incluso spread, commissioni e finanziamento della leva. Ho anche tenuto conto
dei movimenti dentro la giornata, che con la leva fanno scattare la liquidazione anche
quando la chiusura sembra tranquilla.

**Per evitare di imbrogliare me stesso** ho fatto due passaggi:
1. ho scelto i parametri solo sul primo 70% della storia;
2. ho verificato quei parametri sul 30% finale, che la strategia non aveva mai visto.

Se avessi ritoccato la strategia finché il backtest non mostrava 90%, avrei ottenuto un numero
falso: una strategia adattata al passato che poi fallisce dal vivo. Si chiama overfitting.

## 3. Risultati per l'obiettivo +100% (il tuo obiettivo)

Questi sono i risultati della strategia migliore scelta sul passato e verificata sul periodo
non visto:

| Mercato | Strategia migliore | Successo nel passato | **Successo sul periodo non visto** | Perdi tutto |
|---|---|---|---|---|
| Bitcoin | breakout, leva 20 | 70% | **50%** | 47% |
| Ethereum | breakout, leva 10 | 62% | **51%** | 34% |
| Azione | volatilità compressa, leva 30 | 62% | **33%** | 60% |
| Brent | short dopo crollo, leva 30 | 56% | **46%** | 54% |
| EUR/USD | momentum, leva 30 | 7% | **23%** | 0%* |

\* Sul cambio con leva 30 nel campione non si arriva a zero, ma si raddoppia raramente.
Il campione copre solo 10 mesi.

Anche **barando**, cioè scegliendo la strategia guardando direttamente il periodo di verifica, il
massimo è **55-61%**. Tutte le strategie che si avvicinano al raddoppio usano leva 10-30 e
**perdono tutto circa una volta su due**. In media il capitale finale è circa uguale a quello
iniziale: è una scommessa a testa o croce, con i costi a sfavore.

Inoltre, la leva 10-30 su crypto e azioni è **oltre i limiti per i clienti retail nell'UE**
(ESMA). I limiti sono:
- crypto: 2:1;
- azioni: 5:1;
- materie prime: 10:1;
- indici principali: 20:1;
- valute principali: 30:1.

## 4. Il compromesso reale: obiettivo contro probabilità

Più abbassi l'obiettivo, più sale la probabilità. Questi numeri vengono dal periodo non visto
(leva 2-5x salvo dove indicato):

| Obiettivo in 3 settimane | Probabilità (Bitcoin) | Probabilità (Ethereum) | Quando va male |
|---|---|---|---|
| +10% | 93% | 92% | perdi da 1/3 a 2/3 |
| +20% | 83% | 82% | perdi da 1/3 a 2/3 |
| +30% | 74% (leva 10) | 71% | |
| +100% | 50% (leva 20) | 51% (leva 10) | perdi tutto |

**Attenzione:**
- I numeri su Bitcoin ed Ethereum vengono da un periodo in cui sono saliti molto (Bitcoin è
  passato da 30k a 77k). Una strategia long è sembrata migliore di quanto sarà in un mercato
  laterale o in calo.
- Le strategie al 90% vincono spesso poco e perdono raramente molto. Una sola perdita
  cancella circa 3-5 vincite.

Il dettaglio completo è in `results/migliori_strategie.csv`.

## 5. Cosa ti consiglio

Il tuo obiettivo richiede di cambiare **una** delle tre cose:
- quanto vuoi guadagnare;
- in quanto tempo;
- con quale probabilità.

Le alternative serie sono queste.

1. **Puntata asimmetrica a perdita limitata.** Accetti 40-50% di probabilità di raddoppio e il
   rischio di perdere la somma investita, ma decidi tu la cifra (ad esempio 1.000-2.000 €, non
   5.000 €). Lo strumento più pulito sono le **opzioni** (call o put su indici ed ETF, ad esempio
   con Interactive Brokers): la perdita massima è il premio pagato, quindi non c'è liquidazione
   né margin call. Va trattata come una scommessa, non come un investimento.
2. **Obiettivo +10-20% in 3 settimane** su Bitcoin o Ethereum, con leva 2-3 e stop. Il backtest
   dà 80-90%, ma con le cautele del punto 4. Va prima verificato dal vivo con importi piccoli
   o in demo.
3. **Raddoppio su un orizzonte più lungo** (anni, non settimane) con ETF azionari: è l'unica
   strada in cui la probabilità di raddoppiare è davvero alta.

Ricorda anche le tasse in Italia: 26% sulle plusvalenze, 33% sulle crypto dal 2026. Riducono
il guadagno netto.

---

# Parte 2 — Obiettivo più basso, probabilità alta (+10% in 3 settimane)

## 6. Tentativo 1: "Trend + Volatilità Adattiva" (TVA) — scartata

`strategia.py`. L'idea era di adattare la leva alla volatilità del momento:
- si entra solo a favore di trend;
- l'obiettivo +10% corrisponde sempre a un movimento piccolo rispetto alla volatilità tipica;
- lo stop sta lontano.

Ho fatto girare 300 combinazioni su BTC, ETH, azione e Brent, con stesse regole per tutti i
mercati e validazione anno per anno. Il risultato è negativo:
- la probabilità massima si ferma all'**84-85%**;
- il guadagno medio è **zero**;
- quando va male perdi circa il **53%**.

Il trend e la volatilità da soli non danno un vantaggio sufficiente.

## 7. Tentativo 2: "Put Spread con filtro di Volatilità" (PSV) — quella che funziona meglio

`opzioni.py`. Invece di scommettere sulla direzione, si **vende assicurazione** sull'S&P 500.
Le opzioni put sull'indice sono in media più care del rischio reale: il VIX è stato quasi
sempre sopra la volatilità che si è poi verificata. Chi le vende incassa questa differenza.
È un vantaggio economico noto da decenni (premio per il rischio di volatilità), non una
coincidenza trovata nei dati.

**Le regole:**
1. Si entra solo se l'S&P 500 è sopra la sua media a 200 giorni e il VIX non sta salendo
   (VIX ≤ 1,1 volte la sua media a 20 giorni).
2. Si **vende** una put con scadenza circa 3 settimane, circa 0,75 volatilità sotto il prezzo
   (in genere 2-4% sotto).
3. Si **compra** una put il 2% più in basso. Questo fissa la perdita massima: niente margin
   call e niente liquidazioni.
4. Si tiene fino a scadenza, senza stop.
5. Strumento: opzioni **XSP** (Mini-SPX) con Interactive Brokers o un altro broker con
   opzioni USA. Sono europee e regolate in contanti, e con 5.000 € il conto ha la taglia giusta.

**Validazione:**
- 675 combinazioni;
- dati S&P 500 e VIX dal 1990 al 2022, che includono il 2000-2002, il 2008, il crollo Covid
  del 2020 e il 2022;
- ogni anno la regola è scelta usando **solo gli anni precedenti**.

Il walk-forward ha scelto quasi sempre la stessa regola, ed è un buon segno di robustezza.

### Risultati fuori campione (1995-2022)

| | Valore |
|---|---|
| Operazioni in guadagno | **89%** |
| Operazioni con almeno +10% sul capitale a rischio | 69% |
| Guadagno tipico quando va bene | **+11%** in ≤ 3 settimane |
| Perdita media quando va male | **−66%** del capitale a rischio |
| Rendimento medio per operazione | +3,0% |
| Operazioni per anno | circa 13 |

**Quanto dipende dalle ipotesi sul prezzo delle opzioni?** Non ho uno storico dei prezzi
reali delle opzioni, quindi le ho prezzate con un modello a partire dal VIX. Ho provato tre
scenari:

| Scenario | In guadagno | Rendimento medio per operazione |
|---|---|---|
| Ottimista | 89% | +5,9% |
| **Base (già prudente)** | **89%** | **+3,0%** |
| Pessimista (opzioni più economiche, costi più alti) | 91% | +0,1% |

Il 90% di successo regge in tutti gli scenari. Il **guadagno medio invece è sottile**: con
prezzi pessimistici sparisce. Per questo prima di usare soldi veri va verificato con i premi
reali del broker (vedi `segnale.py`, premio minimo).

### La cosa più importante: quanto rischiare per operazione

Il 90% vale **per singola operazione**. In un anno ne fai circa 13, e la probabilità di
superarle tutte senza perdite è 0,9^13 ≈ 25%. Le perdite, quando arrivano, mangiano due terzi
della puntata.

Simulazione del periodo 1995-2022 partendo da 5.000 € e reinvestendo:

| Rischio per operazione | Capitale finale | Calo massimo | Anni in perdita | Anno peggiore |
|---|---|---|---|---|
| **100% (tutti i 5.000 €)** | **0 €: conto azzerato** | −100% | 12/27 | −100% |
| 50% | 40.800 € | −93% | 11/27 | −68% |
| 33% | 60.900 € | −75% | 10/27 | −46% |
| **20%** | **34.200 €** | **−52%** | 9/27 | −28% |

**Conclusione onesta:**
- Puntando tutto ogni volta vedi "+10% in 3 settimane" quasi sempre, ma prima o poi il conto
  si azzera.
- Con un rischio sensato (circa 20% a operazione, cioè 1 contratto XSP con 5.000 €) il
  risultato di lungo periodo è circa **+7-10% l'anno**, simile all'indice, con oscillazioni forti.
- È una strategia vera e con una logica economica, ma non è una macchina da soldi.

---

# Parte 3 — Dati di mercato: perché erano "bloccati" e come averli

**Cosa vuol dire bloccati.** Il computer cloud dove lavoro ha un firewall che lascia passare
solo alcuni siti (GitHub, i repository di librerie). Yahoo, Binance, TradingView e simili
sono esclusi. È un'impostazione di questo ambiente, non un limite dei siti. Sul tuo PC e su
GitHub Actions funzionano normalmente. Ci sono due soluzioni:

1. **Sbloccare l'ambiente cloud.** Nelle impostazioni dell'ambiente (menu dell'ambiente nella
   barra del titolo della sessione → Edit → Network access) aggiungi questi domini agli
   Allowed domains:
   - `query1.finance.yahoo.com`, `query2.finance.yahoo.com`, `fc.yahoo.com`
   - `data-api.binance.vision`
   - `cdn.cboe.com`
   - `financialmodelingprep.com`

   Guida: https://code.claude.com/docs/en/cloud-environments#network-access
2. **GitHub Actions** (già pronto): `.github/workflows/trading-dati.yml` scarica i dati,
   calcola il segnale e salva tutto nel repository. Gira dopo la chiusura di Wall Street nei
   giorni feriali, una volta unito al branch principale, oppure a mano da Actions → Run workflow.

**Le fonti in `dati.py`:**

| Dato | Fonte | Chiave |
|---|---|---|
| Indici, azioni, ETF, futures, cambi | Yahoo Finance (`yfinance`) | no |
| Crypto | Binance API pubblica | no |
| VIX ufficiale | CBOE | no |
| Fondamentali (bilanci, multipli, profilo) | Financial Modeling Prep | gratuita, `FMP_API_KEY` |
| Fondamentali (alternativa) | Alpha Vantage | gratuita, `ALPHAVANTAGE_API_KEY` |

**TradingView.** Non offre un'API pubblica per scaricare i suoi dati: le librerie che lo fanno
leggono il sito di nascosto, violano i termini d'uso e smettono di funzionare spesso.
L'integrazione corretta è al contrario: portare la strategia dentro TradingView.
- `tradingview/psv_segnale.pine` è un indicatore Pine Script con le stesse regole di `segnale.py`.
- Si apre il grafico giornaliero di `SP:SPX`, si incolla lo script nel Pine Editor e si crea un
  **avviso** sulla condizione "PSV ingresso".
- Ricevi notifica sul telefono o via email con gli strike.
- Con un piano a pagamento, l'avviso può anche chiamare un webhook.
- TradingView ha anche i fondamentali nel Pine Script (`request.financial()`).

---

# Come si usa

```bash
pip install -r requirements.txt
python3 dati.py aggiorna     # scarica i prezzi aggiornati
python3 segnale.py 1000      # segnale di oggi con rischio massimo $1.000
```

`segnale.py` ti dice se oggi si entra e, se sì, cosa fare:
- quale put XSP vendere e quale comprare;
- la scadenza;
- il **premio minimo** da accettare;
- quanti contratti aprire.

Se il broker offre un premio inferiore al minimo, non si entra.

**Prima di usare soldi veri:** fai 2-3 mesi in conto demo (paper trading di IBKR), segnando i
premi reali ottenuti, e confrontali con quelli del modello.

Per rifare tutti i test:
```bash
python3 backtest.py      # parte 1: raddoppio            (~15 s)
python3 strategia.py     # tentativo TVA                  (~30 s)
python3 opzioni.py       # strategia PSV + robustezza     (~2 min)
```

I dati in `data/` vengono da fonti pubbliche: Coin Metrics, datasets/oil-prices,
datasets/finance-vix, S&P 500 da skfolio, dati di esempio di backtesting.py.

Tasse in Italia: 26% sulle plusvalenze da opzioni (redditi diversi).

> Questo è un lavoro di analisi didattica, non una consulenza finanziaria personalizzata.
> Vendere opzioni e usare la leva può farti perdere tutto il capitale investito.
