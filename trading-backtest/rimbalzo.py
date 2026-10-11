"""
Strategia "Rimbalzo": comprare l'S&P 500 dopo un calo di breve periodo.

Nasce da ricerca.py: tra 3.522 correlazioni testate, l'unica famiglia che è
sopravvissuta alla correzione statistica E si è ripetuta nel 2013-2026 è
l'inversione di breve sugli indici USA (dopo giorni di calo / RSI(2) basso,
i 5 giorni successivi rendono più della media).

Regole (varianti fissate prima, scelta fatta solo sul periodo 1993-2012):
  ingresso alla chiusura quando RSI(2) < soglia  [opzionale: indice sopra la media 200g]
  uscita alla chiusura quando RSI(2) > uscita, oppure dopo max_giorni sedute
  quando non si è investiti, il denaro rende il tasso dei T-bill (^IRX)

Strumento: CFD o future sull'S&P 500 (si opera alla chiusura USA, con leva
consentita fino a 20:1 per i retail UE; qui al massimo 3x). Costi: 0,03% a
transazione e finanziamento della leva al tasso T-bill + 2,5% annuo.

Il confronto è con "compra e tieni" SPY (con dividendi), sullo stesso periodo.

Uso:  python3 rimbalzo.py         (backtest)
      python3 rimbalzo.py oggi    (segnale del giorno)
"""
from __future__ import annotations

import itertools
import os
import sys

import numpy as np
import pandas as pd

from ricerca import carica, rsi

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "results")
FINE_SCOPERTA = "2013-01-01"
COSTO = 0.0003
SPREAD_FINANZ = 0.025
ENTRATA = [5, 10, 15, 25]
USCITA = [50, 70]
MAX_GIORNI = [5, 10]
TREND = [False, True]


def dati() -> pd.DataFrame:
    spy = carica("spy")
    irx = carica("irx")
    df = pd.DataFrame({"px": spy.px, "close": spy.close})
    df["tasso"] = (irx.close.reindex(df.index).ffill() / 100).fillna(0.03)
    df["ret"] = df.px.pct_change()
    df["rsi2"] = rsi(df.close, 2)
    df["sma200"] = df.close.rolling(200).mean()
    return df.dropna()


def posizione(df: pd.DataFrame, entra: float, esci: float, max_g: int, trend: bool) -> np.ndarray:
    """1 = investito durante il giorno successivo, 0 = liquidità. Decisione alla chiusura."""
    r = df.rsi2.values
    sopra = (df.close > df.sma200).values
    pos = np.zeros(len(df))
    dentro, giorni = False, 0
    for i in range(len(df)):
        if dentro:
            giorni += 1
            if r[i] > esci or giorni >= max_g:
                dentro = False
        elif r[i] < entra and (sopra[i] or not trend):
            dentro, giorni = True, 0
        pos[i] = dentro
    return pos


def rendimenti(df: pd.DataFrame, pos: np.ndarray, leva: float, base: float = 0.0) -> pd.Series:
    """`base`: esposizione tenuta sempre (0 = solo nei segnali, 1 = sempre investiti
    e la leva in più si aggiunge solo durante i segnali)."""
    p = pd.Series(pos, index=df.index).shift(1).fillna(0)       # posizione tenuta nel giorno
    cambi = pd.Series(pos, index=df.index).diff().abs().fillna(0).shift(1).fillna(0)
    espos = base + p * (leva - base)
    cash = df.tasso / 252
    finanz = (df.tasso + SPREAD_FINANZ) / 252 * np.maximum(espos - 1, 0)
    return espos * df.ret - finanz + np.maximum(1 - espos, 0) * cash - cambi * COSTO * (leva - base)


def metriche(r: pd.Series) -> dict:
    eq = (1 + r).cumprod()
    anni = len(r) / 252
    cagr = eq.iloc[-1] ** (1 / anni) - 1
    vol = r.std() * np.sqrt(252)
    dd = (eq / eq.cummax() - 1).min()
    # finestre di 3 settimane (15 sedute) non sovrapposte
    f = (1 + r).groupby(np.arange(len(r)) // 15).prod() - 1
    return dict(cagr=cagr, vol=vol, sharpe=(r.mean() * 252 - 0.025) / vol if vol else np.nan, calo_max=dd,
                finestre_3s_positive=(f > 0).mean(), finestre_3s_oltre_5=(f > 0.05).mean(),
                peggiori_3s=f.min())


def operazioni(df: pd.DataFrame, pos: np.ndarray, leva: float) -> pd.DataFrame:
    p = pd.Series(pos, index=df.index)
    inizio = p.diff().fillna(p.iloc[0]) == 1
    gruppo = inizio.cumsum().where(p.shift(1).fillna(0) == 1)
    r = leva * df.ret
    t = r.groupby(gruppo).apply(lambda x: (1 + x).prod() - 1)
    return t


def main():
    os.makedirs(OUT, exist_ok=True)
    df = dati()
    a, b = df[df.index < FINE_SCOPERTA], df[df.index >= FINE_SCOPERTA]
    righe = []
    for e, u, g, t in itertools.product(ENTRATA, USCITA, MAX_GIORNI, TREND):
        pos_a = posizione(a, e, u, g, t)
        m = metriche(rendimenti(a, pos_a, 1))
        righe.append(dict(entra=e, esci=u, max_giorni=g, trend=t, tempo_investito=pos_a.mean(), **m))
    griglia = pd.DataFrame(righe)
    # si sceglie per guadagno "oltre la liquidità" per unità di rischio, con esposizione minima
    griglia = griglia[griglia.tempo_investito >= 0.10].sort_values("sharpe", ascending=False)
    griglia.to_csv(os.path.join(OUT, "rimbalzo_griglia_scoperta.csv"), index=False)
    best = griglia.iloc[0]
    print("Regola scelta su 1993-2012 (miglior rapporto rendimento/rischio):")
    print(f"  entra con RSI(2) < {best.entra:.0f}, esci con RSI(2) > {best.esci:.0f} o dopo "
          f"{best.max_giorni:.0f} sedute, filtro trend: {'sì' if best.trend else 'no'}")
    print(f"  in quel periodo: investito {best.tempo_investito:.0%} del tempo, Sharpe {best.sharpe:.2f}")
    mediana = griglia.sharpe.median()
    print(f"  (Sharpe mediano delle varianti valide: {mediana:.2f})")

    pct = lambda x: f"{x:+.1%}"
    res = []
    for nome, d in (("1993-2012 (scoperta)", a), ("2013-2026 (verifica)", b)):
        pos = posizione(d, best.entra, best.esci, int(best.max_giorni), bool(best.trend))
        bh = metriche(d.ret)
        res.append(dict(periodo=nome, strategia="Compra e tieni SPY", investito=1.0, **bh))
        for leva in (1, 2, 3):
            m = metriche(rendimenti(d, pos, leva))
            res.append(dict(periodo=nome, strategia=f"Rimbalzo leva {leva}x", investito=pos.mean(), **m))
        for leva in (2, 3):
            m = metriche(rendimenti(d, pos, leva, base=1))
            res.append(dict(periodo=nome, strategia=f"Indice + rimbalzo a {leva}x", investito=1.0, **m))
            # confronto equo: indice con leva costante pari all'esposizione media della strategia
            e = 1 + pos.mean() * (leva - 1)
            m = metriche(rendimenti(d, np.ones(len(d)), e))
            res.append(dict(periodo=nome, strategia=f"  confronto: SPY sempre a {e:.2f}x",
                            investito=1.0, **m))
        if nome.startswith("2013"):
            ops = operazioni(d, pos, 1)
    res = pd.DataFrame(res)
    res.to_csv(os.path.join(OUT, "rimbalzo_risultati.csv"), index=False)
    pd.set_option("display.width", 200)
    print()
    print(res.to_string(index=False, formatters={
        "investito": "{:.0%}".format, "cagr": pct, "vol": "{:.0%}".format, "sharpe": "{:.2f}".format,
        "calo_max": "{:.0%}".format, "finestre_3s_positive": "{:.0%}".format,
        "finestre_3s_oltre_5": "{:.0%}".format, "peggiori_3s": "{:+.0%}".format}))
    print(f"\nOperazioni 2013-2026 (leva 1x): {len(ops)}, in guadagno {(ops > 0).mean():.0%}, "
          f"media {ops.mean():+.2%}, mediana {ops.median():+.2%}, peggiore {ops.min():+.1%}, "
          f"migliore {ops.max():+.1%}")
    pos_b = posizione(b, best.entra, best.esci, int(best.max_giorni), bool(best.trend))
    anni = pd.DataFrame({"SPY": b.ret, "Indice_piu_rimbalzo_2x": rendimenti(b, pos_b, 2, base=1),
                         "Indice_piu_rimbalzo_3x": rendimenti(b, pos_b, 3, base=1)})
    print("\nAnno per anno (2013-2026):")
    print(anni.groupby(anni.index.year).apply(lambda x: (1 + x).prod() - 1)
          .to_string(formatters={c: pct for c in anni.columns}))


# Regola scelta sul 1993-2012 (vedi results/rimbalzo_griglia_scoperta.csv).
REGOLA = dict(entra=10, esci=70, max_giorni=5, trend=True)


def oggi():
    df = dati()
    d = df.index[-1]
    pos = posizione(df, REGOLA["entra"], REGOLA["esci"], REGOLA["max_giorni"], REGOLA["trend"])
    ritardo = (pd.Timestamp.today().normalize() - d).days
    print(f"\n=== Strategia Rimbalzo (S&P 500) ===")
    print(f"Ultimo dato: {d.date()}  SPY {df.close.iloc[-1]:.2f}  RSI(2) {df.rsi2.iloc[-1]:.1f}  "
          f"media 200g {df.sma200.iloc[-1]:.2f}")
    if ritardo > 4:
        print(f"ATTENZIONE: dati vecchi di {ritardo} giorni, aggiorna prima di operare.")
    giorni = int(pd.Series(pos[::-1]).cumprod().sum()) if pos[-1] else 0
    if pos[-1] and giorni == 1:
        print(f"=> ENTRA oggi in chiusura: porta l'esposizione da 1x a 2-3x (RSI(2) < {REGOLA['entra']}).")
    elif pos[-1]:
        print(f"=> RESTA con esposizione aumentata (giorno {giorni} di max {REGOLA['max_giorni']}).")
    elif len(pos) > 1 and pos[-2]:
        print("=> ESCI oggi in chiusura: torna all'esposizione base 1x.")
    else:
        print("=> Nessun segnale: esposizione base 1x (o liquidità, se usi solo i rimbalzi).")


if __name__ == "__main__":
    oggi() if sys.argv[1:] == ["oggi"] else main()
