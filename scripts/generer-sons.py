"""Fabrique les sonneries du minuteur (assets/sons/*.wav) : python3 scripts/generer-sons.py

Chaque sonnerie existe en deux fichiers : « gong.wav » seule, et « gong_bips.wav » qui commence par les bips
3, 2, 1 (une seconde d'écart) puis enchaîne la sonnerie. La notification de fin de phase est programmée 3 secondes
avant la fin avec ce second fichier : téléphone verrouillé, le client entend le décompte puis la sonnerie.
Noms en minuscules et tirets bas : Android n'accepte pas d'autres caractères pour ses sons.
"""
import os
import wave

import numpy as np

TAUX = 22050
DOSSIER = os.path.join(os.path.dirname(__file__), '..', 'assets', 'sons')


def ton(freq, duree, vol=0.3, forme='sine', attaque=0.005, fin=None, declin=None):
    t = np.arange(int(TAUX * duree)) / TAUX
    f = freq if fin is None else freq * (fin / freq) ** (t / duree)
    phase = 2 * np.pi * np.cumsum(f) / TAUX
    if forme == 'sine':
        s = np.sin(phase)
    elif forme == 'triangle':
        s = 2 / np.pi * np.arcsin(np.sin(phase))
    else:
        s = np.sign(np.sin(phase)) * 0.6
    env = np.minimum(1, t / attaque) * np.exp(-t / (declin or duree / 4))
    return s * env * vol


def mixer(*morceaux):
    """morceaux : (debut en secondes, signal)."""
    n = max(int(d * TAUX) + len(s) for d, s in morceaux)
    out = np.zeros(n)
    for d, s in morceaux:
        i = int(d * TAUX)
        out[i:i + len(s)] += s
    return out


SONNERIES = {
    'gong': lambda: mixer((0, ton(110, 2.2, .55, declin=.8)), (0, ton(221, 1.8, .25, declin=.5)), (0, ton(331, 1.2, .14, declin=.35)),
                          (0, ton(523, .6, .06, 'triangle', declin=.15))),
    'sifflet': lambda: mixer(*[(i * .09, ton(2900, .09, .12, 'square', declin=.05)) for i in range(3)],
                             (.3, ton(3000, .55, .35, fin=2950, declin=.4))),
    'cloche': lambda: mixer((0, ton(880, 1.6, .4, declin=.5)), (0, ton(1760, 1, .16, declin=.3)), (0, ton(2637, .6, .09, declin=.15))),
    'boxe': lambda: mixer(*[(d, ton(1318, .8, .32, 'triangle', declin=.25)) for d in (0, .35, .7)],
                          *[(d, ton(2637, .4, .1, declin=.1)) for d in (0, .35, .7)]),
    'digital': lambda: mixer(*[(d, ton(2093, .1, .18, 'square', declin=.2)) for d in (0, .15, .3, .6, .75, .9)]),
}

BIP = ton(880, .16, .45, declin=.12)


def ecrire(nom, s):
    s = s / max(1e-9, np.abs(s).max()) * 0.9
    with wave.open(os.path.join(DOSSIER, nom + '.wav'), 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(TAUX)
        w.writeframes((s * 32767).astype('<i2').tobytes())


os.makedirs(DOSSIER, exist_ok=True)
ecrire('bip', BIP)
for nom, f in SONNERIES.items():
    son = f()
    ecrire(nom, son)
    ecrire(nom + '_bips', mixer((0, BIP), (1, BIP), (2, BIP), (3, son)))
