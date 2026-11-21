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
    [ "$PLATEFORME" = android ] && adb shell am broadcast -a android.intent.action.CLOSE_SYSTEM_DIALOGS > /dev/null
    # Les captures (takeScreenshot) sont écrites dans le dossier courant.
    if (cd "$SORTIE" && "$MAESTRO" test "$PARCOURS" --format junit --output "$SORTIE/$NOM.xml" --test-output-dir "$SORTIE/$NOM-details" > "$SORTIE/$NOM.log" 2>&1); then
      echo "$APPAREIL $MODE $NOM : ok" | tee -a "$RACINE/resultats/resume.txt"
    else
      echo "$APPAREIL $MODE $NOM : ÉCHEC" | tee -a "$RACINE/resultats/resume.txt"
      tail -25 "$SORTIE/$NOM.log"
      # Ce que l'écran montrait au moment de l'échec, pour comprendre sans les pièces jointes.
      echo "Textes à l'écran :"; "$MAESTRO" hierarchy 2>/dev/null | grep -oE '"(text|accessibilityText)" : "[^"]+"' | head -60
      # iPhone : la capture d'écran réduite, en base64 dans le journal (les pièces jointes ne sont pas toujours lisibles).
      if [ "$PLATEFORME" = ios ]; then
        xcrun simctl io booted screenshot --type=jpeg /tmp/echec.jpg > /dev/null 2>&1 \
          && sips -Z 700 -s formatOptions 40 /tmp/echec.jpg > /dev/null 2>&1 \
          && echo "CAPTURE-BASE64 $APPAREIL-$MODE-$NOM $(base64 < /tmp/echec.jpg | tr -d '\n')"
      fi
      ECHECS=$((ECHECS + 1))
    fi
  done
done
exit $ECHECS
