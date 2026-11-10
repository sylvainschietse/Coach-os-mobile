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
    f = np.full_like(t, freq) if fin is None else freq * (fin / freq) ** (t / duree)
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


def cloche_note(freq, duree, vol, declin):
    """Une note de cloche : fondamentale et partiels de cloche, tous dans les fréquences qu'un haut-parleur de
    téléphone ou d'enceinte Bluetooth restitue bien (pas de basse sous 400 Hz, qui disparaît sur ces haut-parleurs)."""
    return mixer((0, ton(freq, duree, vol, declin=declin)), (0, ton(freq * 2.0, duree * .8, vol * .5, declin=declin * .6)),
                 (0, ton(freq * 3.01, duree * .6, vol * .3, declin=declin * .4)), (0, ton(freq * 4.2, duree * .4, vol * .15, declin=declin * .25)))


# Sonneries de 1 à 2,5 s, fortes et dans les médiums-aigus : elles s'entendent sur le haut-parleur, au casque et en voiture.
SONNERIES = {
    'gong': lambda: mixer((0, cloche_note(440, 2.4, .6, .9)), (0, ton(587, 2.0, .35, declin=.7)), (0, ton(1174, 1.2, .2, declin=.35)),
                          (0, ton(2349, .3, .15, 'square', declin=.06))),
    'sifflet': lambda: mixer(*[(i * .09, ton(2900, .09, .12, 'square', declin=.05)) for i in range(3)],
                             (.3, ton(3000, .7, .35, fin=2950, declin=.5))),
    'cloche': lambda: mixer((0, cloche_note(1046, 1.8, .6, .6)), (.45, cloche_note(1318, 1.4, .45, .5))),
    'boxe': lambda: mixer(*[(d, cloche_note(1568, .9, .6, .3)) for d in (0, .3, .6, .9)]),
    'digital': lambda: mixer(*[(d, ton(2637, .12, .35, 'square', declin=.4)) for d in (0, .16, .32, .64, .8, .96)]),
}

# Bip du décompte : un quart de seconde, son riche (carré) pour bien percer.
BIP = ton(1000, .25, .5, 'square', declin=.4)
# Silence joué en boucle pendant le minuteur : garde le haut-parleur ou la liaison Bluetooth éveillés,
# sinon l'enceinte coupe le début des bips.
SILENCE = np.zeros(TAUX)


def ecrire(nom, s):
    if np.abs(s).max() > 0:
        # Normalisé puis légèrement compressé : plus fort à l'oreille sans saturer.
        s = s / np.abs(s).max()
        s = np.tanh(2.2 * s) / np.tanh(2.2) * 0.95
    with wave.open(os.path.join(DOSSIER, nom + '.wav'), 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(TAUX)
        w.writeframes((s * 32767).astype('<i2').tobytes())


os.makedirs(DOSSIER, exist_ok=True)
ecrire('bip', BIP)
ecrire('silence', SILENCE)
for nom, f in SONNERIES.items():
    son = f()
    ecrire(nom, son)
    ecrire(nom + '_bips', mixer((0, BIP), (1, BIP), (2, BIP), (3, son)))
