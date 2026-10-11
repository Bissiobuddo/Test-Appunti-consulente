"""
Strategia "PSV" — vendita di Put Spread con filtro di Volatilità — sull'S&P 500.

Perché può funzionare: le opzioni sull'S&P 500 sono in media "care". La
volatilità implicita (VIX) è stata quasi sempre più alta di quella che poi si è
realizzata davvero (premio per il rischio di volatilità). Chi VENDE protezione
incassa questo premio. Il prezzo da pagare è che vince spesso poco e,
raramente, perde molto. Per questo si usa uno spread (put venduta + put
comprata più in basso), che fissa la perdita massima e azzera il rischio di
margin call.

Regole (parametri scelti walk-forward, anno per anno, solo col passato):
  - ingresso: si vende una put a distanza z volatilità implicite sotto il
    prezzo (scadenza circa 3 settimane = 15 sedute) e si compra una put
    larga W% più in basso;
  - filtri possibili: trend (indice sopra la media a 200 giorni), VIX non in
    esplosione, VIX abbastanza alto da pagare un premio decente;
  - uscita: a scadenza, oppure prima se si incassa il tp% del premio (presa di
    profitto), oppure se lo spread arriva a valere sl volte il premio (stop).

Le opzioni sono prezzate con Black-Scholes usando il VIX del giorno più uno
skew (le put lontane costano più del VIX), e si pagano costi di
denaro/lettera a ogni apertura e chiusura. Il rendimento è misurato sul
capitale a rischio (perdita massima dello spread), cioè sui tuoi 5.000 €.

Uso:  python3 opzioni.py
"""
from __future__ import annotations

import itertools
import os

import numpy as np
import pandas as pd
from scipy.special import ndtr

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "data")
OUT = os.path.join(HERE, "results")

H = 15                    # sedute fino alla scadenza (3 settimane)
# Ipotesi sul prezzo delle opzioni. "base" è già prudente; "pessimista" serve
# a controllare che il risultato non dipenda da ipotesi troppo favorevoli.
#   atm:   vol implicita ATM a 3 settimane = atm * VIX (il VIX include lo skew ed è
#          di solito un po' sopra la vol ATM)
#   skew:  aumento relativo della vol implicita per ogni "sigma" di distanza
#   costo: denaro/lettera per transazione, in frazione della larghezza dello spread
IPOTESI = {
    "base": dict(atm=0.90, skew=0.15, costo=0.03),
    "pessimista": dict(atm=0.80, skew=0.10, costo=0.05),
    "ottimista": dict(atm=1.00, skew=0.20, costo=0.02),
}
TASSO = 0.02
CAPITALE = 5000
Z = [0.75, 1.0, 1.25, 1.5, 2.0]
W = [0.02, 0.03, 0.05]
TP = [0.5, 0.75, 1.0]     # 1.0 = si tiene fino a scadenza
SL = [2.0, 3.0, np.inf]
FILTRI = ["nessuno", "trend", "vix_calmo", "trend_vix_calmo", "vix_ricco"]
HIT_MIN = 0.85
PRIMO_ANNO_TEST = 1995


def carica() -> pd.DataFrame:
    s = pd.read_csv(os.path.join(DATA, "spx.csv"), index_col="date", parse_dates=True)
    v = pd.read_csv(os.path.join(DATA, "vix.csv"), index_col="date", parse_dates=True)
    df = s[["close"]].rename(columns={"close": "S"}).join(v.close.rename("vix"), how="inner")
    df["sma200"] = df.S.rolling(200).mean()
    df["vix_media"] = df.vix.rolling(20).mean()
    return df.dropna()


def put(S, K, T, vol):
    T = np.maximum(T, 1e-6)
    sq = vol * np.sqrt(T)
    d1 = (np.log(S / K) + (TASSO + 0.5 * vol**2) * T) / sq
    d2 = d1 - sq
    return K * np.exp(-TASSO * T) * ndtr(-d2) - S * ndtr(-d1)


def iv(S, K, T, vix, ip):
    """Vol implicita con skew: le put più lontane hanno vol più alta."""
    v = ip["atm"] * vix / 100
    x = np.log(S / K) / (v * np.sqrt(np.maximum(T, 1e-6)))
    return v * (1 + ip["skew"] * np.clip(x, 0, 4))


def filtro(df: pd.DataFrame, nome: str) -> np.ndarray:
    trend = df.S > df.sma200
    calmo = df.vix <= 1.1 * df.vix_media
    ricco = df.vix >= 15
    return np.asarray({"nessuno": pd.Series(True, index=df.index), "trend": trend,
                       "vix_calmo": calmo, "trend_vix_calmo": trend & calmo,
                       "vix_ricco": ricco & calmo}[nome], bool)


def simula(df: pd.DataFrame, z: float, w: float, tp: float, sl: float, nome: str,
           ip: dict) -> pd.DataFrame:
    S = df.S.values
    vix = df.vix.values
    days = (df.index - df.index[0]).days.values
    idx = np.flatnonzero(filtro(df, nome))
    idx = idx[idx + H < len(S)]
    steps = np.arange(0, H + 1)
    rows = idx[:, None] + steps[None, :]
    T = (days[idx + H][:, None] - days[rows]) / 365.0
    S0, T0, v0 = S[idx], T[:, 0], vix[idx]
    K1 = S0 * np.exp(-z * v0 / 100 * np.sqrt(T0))
    K2 = K1 - w * S0
    St, vt = S[rows], vix[rows]
    val = (put(St, K1[:, None], T, iv(St, K1[:, None], T, vt, ip))
           - put(St, K2[:, None], T, iv(St, K2[:, None], T, vt, ip)))
    width = K1 - K2
    val[:, -1] = np.clip(K1[:, None] - St[:, -1:], 0, width[:, None])[:, 0]  # scadenza: intrinseco
    credito = val[:, 0] - ip["costo"] * width
    ok = credito > 0.02 * width          # premio troppo basso: non si entra
    mark = val[:, 1:]
    tp_hit = mark <= (1 - tp) * credito[:, None] if tp < 1 else np.zeros_like(mark, bool)
    sl_hit = mark >= sl * credito[:, None] if np.isfinite(sl) else np.zeros_like(mark, bool)
    tp_hit[:, -1] = sl_hit[:, -1] = False                    # a scadenza vale l'intrinseco
    big = H + 1
    t_tp = np.where(tp_hit.any(1), tp_hit.argmax(1), big)
    t_sl = np.where(sl_hit.any(1), sl_hit.argmax(1), big)
    t_exit = np.minimum(np.minimum(t_tp, t_sl), H - 1)
    r = np.arange(len(idx))
    uscita = mark[r, t_exit]
    costo_uscita = np.where(t_exit < H - 1, ip["costo"] * width, 0.0)
    pnl = credito - uscita - costo_uscita
    rischio = width - credito
    out = pd.DataFrame(dict(entrata=idx, uscita=idx + 1 + t_exit, data=df.index[idx],
                            data_uscita=df.index[idx + 1 + t_exit], S=S0, K1=K1, K2=K2,
                            vix=v0, credito=credito, ret=pnl / rischio,
                            credito_su_rischio=credito / rischio))
    out = out[ok]
    out["anno"] = out.data.dt.year
    return out


def riassunto(t: pd.DataFrame) -> pd.Series:
    perdite = t.ret[t.ret <= 0]
    return pd.Series(dict(n=len(t), p=(t.ret > 0).mean(), p_5=(t.ret >= 0.05).mean(),
                          ev=t.ret.mean(), guadagno_tipico=t.ret[t.ret > 0].median(),
                          perdita_media=perdite.mean() if len(perdite) else 0.0,
                          peggiore=t.ret.min()))


def sequenziale(t: pd.DataFrame) -> pd.DataFrame:
    righe, libero = [], -1
    for row in t.sort_values("entrata").itertuples():
        if row.entrata > libero:
            righe.append(row)
            libero = row.uscita
    s = pd.DataFrame(righe).drop(columns=["Index"])
    s["euro"] = s.ret * CAPITALE
    return s


def walk_forward(df: pd.DataFrame, ip: dict):
    """Ogni anno sceglie la regola migliore usando solo le operazioni già chiuse
    negli anni precedenti, e la applica all'anno successivo."""
    tutte = []
    for z, w, tp, sl, f in itertools.product(Z, W, TP, SL, FILTRI):
        t = simula(df, z, w, tp, sl, f, ip)
        t["combo"] = f"z={z} W={w:.0%} tp={tp:.0%} sl={sl} {f}"
        tutte.append(t)
    g = pd.concat(tutte, ignore_index=True)
    oos, scelte = [], []
    for y in range(PRIMO_ANNO_TEST, df.index[-1].year + 1):
        passato = g[g.data_uscita < pd.Timestamp(year=y, month=1, day=1)]
        st = passato.groupby("combo").apply(riassunto, include_groups=False)
        st = st[(st.n >= 100) & (st.p >= HIT_MIN)]
        if st.empty:
            scelte.append(dict(anno=y, regola="(nessuna regola valida: fermo)", p_in=np.nan, ev_in=np.nan))
            continue
        best = st.sort_values("ev", ascending=False).index[0]
        scelte.append(dict(anno=y, regola=best, p_in=st.loc[best, "p"], ev_in=st.loc[best, "ev"]))
        oos.append(g[(g.anno == y) & (g.combo == best)])
    return g, pd.DataFrame(scelte), pd.concat(oos, ignore_index=True)


def stampa_totale(titolo: str, oos: pd.DataFrame, seq: pd.DataFrame):
    tot = riassunto(oos)
    curva = seq.euro.cumsum()
    print(f"{titolo}: in guadagno {tot.p:.0%} | almeno +5% {tot.p_5:.0%} | medio {tot.ev:+.1%} | "
          f"tipico {tot.guadagno_tipico:+.1%} | perdita media {tot.perdita_media:+.0%} || "
          f"uso reale: {len(seq)} op., {seq.euro.sum():+,.0f} € in {seq.anno.nunique()} anni, "
          f"calo max {(curva - curva.cummax()).min():+,.0f} €")


def main():
    os.makedirs(OUT, exist_ok=True)
    df = carica()
    print(f"Dati: S&P 500 + VIX dal {df.index[0].date()} al {df.index[-1].date()}")
    pct = "{:.0%}".format

    g, scelte, oos = walk_forward(df, IPOTESI["base"])
    g.groupby("combo").apply(riassunto, include_groups=False).sort_values("ev", ascending=False) \
        .to_csv(os.path.join(OUT, "psv_tutte_le_combinazioni.csv"))
    print("\n=== Regola scelta ogni anno usando solo gli anni precedenti ===")
    print(scelte.to_string(index=False, formatters={"p_in": pct, "ev_in": "{:.1%}".format}))

    seq = sequenziale(oos)
    print("\n=== Uso reale: un'operazione alla volta, 5.000 € a rischio ciascuna ===")
    anni = seq.groupby("anno").agg(operazioni=("euro", "size"),
                                   in_guadagno=("ret", lambda r: (r > 0).mean()),
                                   euro=("euro", "sum"), peggiore=("euro", "min"))
    print(anni.to_string(formatters={"in_guadagno": pct, "euro": "{:+,.0f}".format,
                                     "peggiore": "{:+,.0f}".format}))
    print()
    stampa_totale("BASE      ", oos, seq)
    scelte.to_csv(os.path.join(OUT, "psv_scelte_walkforward.csv"), index=False)
    seq.to_csv(os.path.join(OUT, "psv_operazioni.csv"), index=False)

    for nome in ("pessimista", "ottimista"):
        _, _, o = walk_forward(df, IPOTESI[nome])
        stampa_totale(nome.upper().ljust(10), o, sequenziale(o))


if __name__ == "__main__":
    main()
