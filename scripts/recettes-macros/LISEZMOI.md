# Macros des recettes importées

Relie chaque ingrédient des 200 recettes Zite à un aliment de la base (Ciqual, `src/data/aliments-base.json`) et le pèse en grammes.

- `carte_base.py`, `regles.py` → `appliquer_regles.py` écrit `codes.json` (clé d'aliment de l'export → code Ciqual).
- `calcul.py` : code et grammes d'un ingrédient. Le texte anglais d'origine passe en premier quand la clé de l'export est trompeuse.
- `source.py`, `compare.py` : relisent la quantité dans le texte d'origine, qui corrige les quantités mal lues à l'import.
- `bilan.py` : compare le calcul aux macros publiées.
- `python3 sql.py <fichier.sql>` écrit le SQL et applique le même changement aux JSON du dépôt ; `python3 ecarts.py <fichier.md>` liste les recettes à vérifier.

Les poudres protéinées n'existent pas dans Ciqual : leurs valeurs viennent de l'écart entre les versions « + protéines » publiées et leur version de base.
