#!/usr/bin/env bash
# Lance les parcours de .maestro/parcours/ sur l'appareil déjà démarré (émulateur Android ou simulateur iPhone),
# une fois en mode clair puis une fois en mode sombre. Captures et rapports dans resultats/<appareil>-<mode>/.
# Usage : scripts/parcours-maestro.sh <nom-appareil> <android|ios>
set -u
APPAREIL="$1"; PLATEFORME="$2"
RACINE="$(cd "$(dirname "$0")/.." && pwd)"
MAESTRO="$HOME/.maestro/bin/maestro"
ECHECS=0
for MODE in clair sombre; do
  if [ "$PLATEFORME" = android ]; then
    adb shell cmd uimode night "$([ $MODE = sombre ] && echo yes || echo no)"
  else
    xcrun simctl ui booted appearance "$([ $MODE = sombre ] && echo dark || echo light)"
  fi
  SORTIE="$RACINE/resultats/$APPAREIL-$MODE"
  mkdir -p "$SORTIE"
  for PARCOURS in "$RACINE"/.maestro/parcours/[0-9]*.yaml; do
    NOM="$(basename "$PARCOURS" .yaml)"
    # Les captures (takeScreenshot) sont écrites dans le dossier courant.
    if (cd "$SORTIE" && "$MAESTRO" test "$PARCOURS" --format junit --output "$SORTIE/$NOM.xml" --test-output-dir "$SORTIE/$NOM-details" > "$SORTIE/$NOM.log" 2>&1); then
      echo "$APPAREIL $MODE $NOM : ok" | tee -a "$RACINE/resultats/resume.txt"
    else
      echo "$APPAREIL $MODE $NOM : ÉCHEC" | tee -a "$RACINE/resultats/resume.txt"
      tail -25 "$SORTIE/$NOM.log"
      ECHECS=$((ECHECS + 1))
    fi
  done
done
exit $ECHECS
