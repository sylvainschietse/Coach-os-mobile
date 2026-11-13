# Liste des recettes dont les macros publiées s'écartent de plus de 30 % du calcul ingrédient par ingrédient.  python3 ecarts.py <fichier.md>
import statistics, sys
from construire import ecarts

L = ecarts()
e = [abs(l['ecart']) for l in L]
orig = sorted([l for l in L if l['version'] == 'original' and abs(l['ecart']) >= 0.3], key=lambda l: l['ecart'])
autres = {l['recette'] for l in L if l['version'] != 'original' and abs(l['ecart']) >= 0.3} - {l['recette'] for l in orig}
md = f"""# Recettes : macros publiées à vérifier

Calcul refait ingrédient par ingrédient avec la table Ciqual (valeurs pour 100 g × grammes par portion), comparé aux calories publiées par portion.

Sur {len(L)} versions de recettes, l'écart médian est de {round(statistics.median(e) * 100)} %. {sum(x < .15 for x in e)} versions sont à moins de 15 %, {sum(.15 <= x < .3 for x in e)} entre 15 et 30 %, et {sum(x >= .3 for x in e)} à 30 % ou plus.

Un écart ne prouve pas que la valeur publiée est fausse : le calcul suppose des poids moyens (une pièce, une cuillère) et la table Ciqual n'a pas tous les produits (lait de coco allégé, edamame, extrait de vanille…). Les écarts de plus de 30 % méritent en revanche un coup d'œil, la recette d'origine à côté.

Les macros publiées restent celles affichées dans l'app : rien n'est changé tant que Sylvain n'a pas tranché.

## Version principale, écart de 30 % ou plus ({len(orig)} recettes)

| Recette | Publié (kcal) | Calculé (kcal) | Écart | Protéines publiées | Protéines calculées |
|---|---:|---:|---:|---:|---:|
""" + '\n'.join(f"| {l['recette']} | {l['publie']} | {l['calcule']} | {l['ecart'] * 100:+.0f} % | {l['protPublie']:g} g | {l['protCalcule']:g} g |" for l in orig) + f"""

## Seulement dans une variante (végétarienne, végane ou + protéines)

{', '.join(sorted(autres)) or 'Aucune.'}
"""
open(sys.argv[1], 'w').write(md)
print(len(orig), len(autres))
