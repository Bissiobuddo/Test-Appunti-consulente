"""
Segnale del giorno per la strategia PSV (put spread sull'S&P 500).

Legge data/spx.csv e data/vix.csv (aggiornali prima con `python3 dati.py aggiorna`)
e dice se oggi c'è un ingresso. Se c'è, indica gli strike da vendere e comprare,
la scadenza, il premio minimo da accettare e quanti contratti aprire.

Strumento consigliato: opzioni XSP (Mini-SPX, 1/10 dell'S&P 500): europee,
regolate in contanti, niente assegnazione anticipata, contratti piccoli adatti a
un conto da 5.000 €. Le stesse regole valgono per SPX (strike x10).

Uso:  python3 segnale.py [rischio_per_operazione_in_dollari]   (default 1500)
"""
from __future__ import annotations

import sys

import numpy as np
import pandas as pd

import opzioni as o

# Regola scelta dal walk-forward più recente (vedi results/psv_scelte_walkforward.csv).
# Se rilanci opzioni.py con dati nuovi e la regola cambia, aggiorna qui.
Z, W_PCT, FILTRO = 0.75, 0.02, "trend"
GIORNI_MAX_DATI = 4  # oltre questo ritardo i dati sono vecchi: non si opera


def main():
    rischio = float(sys.argv[1]) if len(sys.argv) > 1 else 1500.0
    df = o.carica()
    oggi = df.iloc[-1]
    data = df.index[-1]
    ritardo = (pd.Timestamp.today().normalize() - data).days
    print(f"Ultimo dato: {data.date()}  S&P 500 {oggi.S:,.2f}  VIX {oggi.vix:.2f}  "
          f"media 200g {oggi.sma200:,.2f}  VIX medio 20g {oggi.vix_media:.2f}")
    if ritardo > GIORNI_MAX_DATI:
        print(f"ATTENZIONE: i dati hanno {ritardo} giorni. Aggiorna con `python3 dati.py aggiorna` "
              f"prima di operare: il calcolo qui sotto è solo dimostrativo.")

    print(f"Filtro trend (indice sopra la media 200g): {'SÌ' if oggi.S > oggi.sma200 else 'NO'}")
    print(f"Filtro VIX calmo (VIX ≤ 1,1 x media 20g):  {'SÌ' if oggi.vix <= 1.1 * oggi.vix_media else 'NO'}")
    print(f"Regola attiva: {FILTRO}")
    if not o.filtro(df, FILTRO)[-1]:
        print("\n=> OGGI NESSUN INGRESSO. Si riprova domani.")
        return

    T = 21 / 365
    k1 = oggi.S * np.exp(-Z * oggi.vix / 100 * np.sqrt(T))
    k1_xsp = np.floor(k1 / 10)                 # strike XSP a passi di 1 punto
    k2_xsp = k1_xsp - max(1, round(W_PCT * oggi.S / 10))
    larghezza = k1_xsp - k2_xsp
    ip = o.IPOTESI["base"]
    s10 = oggi.S / 10
    stima = (o.put(s10, k1_xsp, T, o.iv(s10, k1_xsp, T, oggi.vix, ip))
             - o.put(s10, k2_xsp, T, o.iv(s10, k2_xsp, T, oggi.vix, ip)))
    minimo = 0.10 * larghezza                  # sotto questo premio il rischio non è pagato
    perdita_max = (larghezza - minimo) * 100
    n = int(rischio // perdita_max)
    scadenza = pd.bdate_range(data, periods=16)[-1].date()

    print(f"""
=> INGRESSO: vendi un put spread XSP con scadenza {scadenza} (circa 3 settimane)
   VENDI  put XSP strike {k1_xsp:.0f}   (SPX equivalente {k1_xsp * 10:.0f})
   COMPRA put XSP strike {k2_xsp:.0f}   (SPX equivalente {k2_xsp * 10:.0f})
   Premio stimato dal modello: {stima:.2f} punti (= ${stima * 100:.0f} a spread)
   Premio MINIMO da accettare: {minimo:.2f} punti; se il broker offre meno, non entrare
   Perdita massima per spread: circa ${perdita_max:,.0f}
   Contratti con rischio massimo ${rischio:,.0f}: {n}{'  (alza il rischio o salta)' if n == 0 else ''}
   Uscita: tieni fino a scadenza (regolamento in contanti), nessuno stop.
   Guadagno se a scadenza XSP > {k1_xsp:.0f}; perdita piena se < {k2_xsp:.0f}.""")


if __name__ == "__main__":
    main()
