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

## 6. Come rifare il test

```bash
pip install pandas numpy
python3 backtest.py      # circa 15 secondi, scrive i risultati in results/
```

`data/` contiene i prezzi usati, prelevati da fonti pubbliche (Coin Metrics, datasets/oil-prices,
dati di esempio di backtesting.py).

> Questo è un lavoro di analisi didattica, non una consulenza finanziaria personalizzata. Il
> trading a leva può farti perdere tutto il capitale investito.
