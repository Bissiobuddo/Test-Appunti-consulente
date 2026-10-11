"""
Strategia "TVA" — Trend + Volatilità Adattiva — per l'obiettivo +10% in max 3 settimane.

Idea: invece di usare una leva fissa, si sceglie la leva in base alla volatilità
del momento, così che l'obiettivo richieda sempre un movimento di prezzo
"piccolo" rispetto a quanto il mercato si muove normalmente in 3 settimane
(k volte la volatilità), mentre lo stop sta "lontano" (m volte la volatilità).
Si entra solo nella direzione del trend.

    sigma_3w  = volatilità giornaliera (ultime 4 settimane) * sqrt(barre in 3 settimane)
    movimento richiesto = k * sigma_3w      ->  leva = obiettivo / movimento
    distanza dello stop = m * sigma_3w      ->  perdita max ≈ leva * distanza
    se la leva necessaria supera il limite UE per quel mercato, non si entra.

Senza alcun vantaggio la probabilità di toccare l'obiettivo prima dello stop è
circa m / (k + m) (colonna "p_caso"): la strategia vale qualcosa solo se fa
MEGLIO di quel numero e se il guadagno medio (ev) resta positivo.

La validazione è walk-forward: per ogni anno si scelgono i parametri usando solo
gli anni precedenti (tutti i mercati insieme, stesse regole per tutti) e si
misura il risultato sull'anno successivo, che le regole non hanno mai visto.

Uso:  python3 strategia.py
"""
from __future__ import annotations

import itertools
import os

import numpy as np
import pandas as pd

from backtest import ASSETS, OUT, load, simulate_paths

TARGET = 1.10            # +10% sul capitale
CAPITALE = 5000          # euro per operazione
MERCATI = ["BTC", "ETH", "GOOG", "BRENT"]
K = [0.2, 0.3, 0.4, 0.5, 0.75]
M = [0.75, 1.0, 1.5, 2.0, 3.0]
FILTRI = ["nessuno", "trend100", "trend100_calmo", "golden"]
DIREZIONI = ["long", "short", "entrambe"]
HIT_MIN = 0.85           # vincolo: probabilità di successo minima in-sample
PRIMO_ANNO_TEST = 2008   # servono almeno alcuni anni di storia per scegliere


def indicatori(p: pd.Series, bars_week: int) -> dict:
    n_m = 4 * bars_week
    horizon = 3 * bars_week
    r = np.log(p).diff()
    sig_d = r.rolling(n_m).std()
    sig_3w = sig_d * np.sqrt(horizon)
    sma20, sma50 = p.rolling(n_m).mean(), p.rolling(10 * bars_week).mean()
    sma100, sma200 = p.rolling(20 * bars_week).mean(), p.rolling(40 * bars_week).mean()
    up100 = (p > sma100) & (sma100 > sma100.shift(n_m))
    dn100 = (p < sma100) & (sma100 < sma100.shift(n_m))
    calmo = (np.log(p / sma20)).abs() < 1.0 * sig_3w  # non troppo lontano dalla media a 1 mese
    filtri = {
        "nessuno": (pd.Series(True, index=p.index), pd.Series(True, index=p.index)),
        "trend100": (up100, dn100),
        "trend100_calmo": (up100 & calmo, dn100 & calmo),
        "golden": ((sma50 > sma200) & (p > sma50), (sma50 < sma200) & (p < sma50)),
    }
    return dict(sigma=sig_d.values, sig_3w=sig_3w.values, horizon=horizon,
                filtri={k: (np.asarray(a, bool), np.asarray(b, bool)) for k, (a, b) in filtri.items()})


def operazioni(name: str, ind: dict, prices: np.ndarray, dates: pd.DatetimeIndex,
               k: float, m: float, filtro: str, direzione: str, seed: int = 7) -> pd.DataFrame:
    """Tutte le operazioni possibili (una per ogni barra con segnale)."""
    cfg = ASSETS[name]
    rng = np.random.default_rng(seed)
    sig_3w = ind["sig_3w"]
    with np.errstate(divide="ignore", invalid="ignore"):
        lev = (TARGET - 1) / (k * sig_3w)
    stop = 1 - lev * m * sig_3w                       # equity a cui scatta lo stop
    ok_lev = np.isfinite(lev) & (lev <= cfg["eu_max_lev"]) & (lev >= 0.5)
    out = []
    for d, mask in ((1, ind["filtri"][filtro][0]), (-1, ind["filtri"][filtro][1])):
        if (direzione == "long" and d == -1) or (direzione == "short" and d == 1):
            continue
        r = simulate_paths(prices, mask & ok_lev, ind["sigma"], d, np.nan_to_num(lev),
                           np.nan_to_num(stop), ind["horizon"], TARGET, cfg["cost"],
                           cfg["carry"], rng)
        out.append(pd.DataFrame(dict(asset=name, entrata=r["idx"], uscita=r["exit"],
                                     data=dates[r["idx"]], anno=dates[r["idx"]].year,
                                     data_uscita=dates[r["exit"]],
                                     dir=d, leva=lev[r["idx"]], success=r["success"],
                                     final=r["final"])))
    return pd.concat(out, ignore_index=True) if out else pd.DataFrame()


def griglia() -> pd.DataFrame:
    """Tutte le operazioni di tutte le combinazioni, su tutti i mercati."""
    tutte = []
    for name in MERCATI:
        p = load(name)
        ind = indicatori(p, ASSETS[name]["bars_week"])
        for k, m, f, d in itertools.product(K, M, FILTRI, DIREZIONI):
            t = operazioni(name, ind, p.values.astype(float), p.index, k, m, f, d)
            if len(t):
                t["combo"] = f"k={k} m={m} {f} {d}"
                t["k"], t["m"] = k, m
                tutte.append(t)
    return pd.concat(tutte, ignore_index=True)


def riassunto(t: pd.DataFrame) -> pd.Series:
    loss = t.final[~t.success]
    return pd.Series(dict(n=len(t), p=t.success.mean(), ev=t.final.mean(),
                          perdita_media=(loss.mean() - 1) if len(loss) else 0.0,
                          p_caso=(t.m / (t.k + t.m)).mean()))


def sequenziale(t: pd.DataFrame) -> pd.DataFrame:
    """Come la useresti davvero: una sola operazione alla volta per mercato,
    la successiva solo dopo la chiusura della precedente, 5.000 € a operazione."""
    righe = []
    for name, g in t.sort_values("entrata").groupby("asset"):
        libero = -1
        for row in g.itertuples():
            if row.entrata > libero:
                righe.append(row)
                libero = row.uscita
    s = pd.DataFrame(righe)
    s["euro"] = (s.final - 1) * CAPITALE
    return s


def main():
    os.makedirs(OUT, exist_ok=True)
    print("Calcolo di tutte le combinazioni ...")
    g = griglia()
    stats = g.groupby("combo").apply(riassunto, include_groups=False).reset_index()

    # --- walk-forward: per ogni anno scelgo con il solo passato ---
    oos, scelte = [], []
    anni = sorted(y for y in g.anno.unique() if y >= PRIMO_ANNO_TEST)
    for y in anni:
        passato = g[g.data_uscita < pd.Timestamp(year=y, month=1, day=1)]  # solo operazioni già chiuse
        st = passato.groupby("combo").apply(riassunto, include_groups=False)
        st = st[(st.n >= 100) & (st.p >= HIT_MIN)]
        if st.empty:
            continue
        best = st.sort_values("ev", ascending=False).index[0]
        scelte.append(dict(anno=y, combo=best, p_in=st.loc[best, "p"], ev_in=st.loc[best, "ev"]))
        oos.append(g[(g.anno == y) & (g.combo == best)])
    oos = pd.concat(oos, ignore_index=True)
    scelte = pd.DataFrame(scelte)

    print("\n=== Regole scelte anno per anno (solo con il passato) ===")
    print(scelte.to_string(index=False, formatters={"p_in": "{:.0%}".format, "ev_in": "{:.3f}".format}))

    print("\n=== Risultato fuori campione (walk-forward), tutte le operazioni possibili ===")
    tot = riassunto(oos)
    print(f"operazioni: {int(tot.n)}  successo: {tot.p:.0%}  (a caso: {tot.p_caso:.0%})  "
          f"equity media finale: {tot.ev:.3f}  perdita media quando va male: {tot.perdita_media:.0%}")
    per_asset = oos.groupby("asset").apply(riassunto, include_groups=False)
    print(per_asset.to_string(formatters={"p": "{:.0%}".format, "ev": "{:.3f}".format,
                                          "perdita_media": "{:.0%}".format, "p_caso": "{:.0%}".format}))

    seq = sequenziale(oos)
    print("\n=== Uso reale: una operazione alla volta per mercato, 5.000 € ciascuna ===")
    anno = seq.groupby(["asset", "anno"]).agg(operazioni=("euro", "size"),
                                              successo=("success", "mean"),
                                              euro=("euro", "sum")).reset_index()
    print(anno.to_string(index=False, formatters={"successo": "{:.0%}".format, "euro": "{:+,.0f}".format}))
    for name, s in seq.groupby("asset"):
        curva = s.euro.cumsum()
        dd = (curva - curva.cummax()).min()
        print(f"{name}: {len(s)} operazioni, successo {s.success.mean():.0%}, "
              f"totale {s.euro.sum():+,.0f} €, peggior operazione {s.euro.min():+,.0f} €, "
              f"massimo calo dal picco {dd:+,.0f} €")

    stats.to_csv(os.path.join(OUT, "tva_tutte_le_combinazioni.csv"), index=False)
    scelte.to_csv(os.path.join(OUT, "tva_scelte_walkforward.csv"), index=False)
    seq.drop(columns=["Index"], errors="ignore").to_csv(os.path.join(OUT, "tva_operazioni.csv"), index=False)


if __name__ == "__main__":
    main()
