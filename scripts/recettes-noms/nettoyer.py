import json, re, sys
import os
RACINE = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..')
R = json.load(open(RACINE + '/src/data/nutrition/recipes.json'))

UNITES = r"(?:cuill[eè]res? (?:à|a) (?:caf[eé]|soupe)|c\. à (?:café|soupe)|gousses?|g|ml|kg|l|litres?|piments?)"
NUM = r"\d+(?:[,.]\d+)?"

def nettoyer(t):
    s = t.strip()
    # fragments impériaux en tête : « / 18 fl oz de », « /1 lb 2 oz de », « (6 onces) de », « /30 ml d'»
    s = re.sub(r"^/\s*(?:\d+\s*(?:lb|fl oz|oz|ml|g)\s*)+(?:paquet de |bocal de )?", "", s, flags=re.I)
    s = re.sub(r"^/\s*bocal de \d+\s*oz\s*", "", s, flags=re.I)
    s = re.sub(r"^\(\d+ onces?\)\s*", "", s)
    s = re.sub(r"^-\s*" + NUM + r"\s*(?:litres?|l)?\s*", "", s)
    s = re.sub(r"^-\s*\d+\s+", "", s)
    # fourchettes de quantité en tête : « 1-2 cuillères à café de », « 2-3 gousses d'ail »
    s = re.sub(r"^" + NUM + r"\s*(?:-|à)\s*" + NUM + r"\s*(?:cuill[eè]res? (?:à|a) (?:caf[eé]|soupe)|g\b|ml\b)?\s*(?:de |d'|d’)?", "", s)
    s = re.sub(r"^cm morceau de ", "morceau de ", s)
    s = re.sub(r"^emballer (?:les |la |le )?", "", s)
    s = re.sub(r"^(?:de l'|de l’|de la |des |du |de (?=(?:grosses|généreuses) ))", "", s)
    s = re.sub(r"^de (?!l'|l’|la )(?=\w)", "", s) if not re.match(r"^de (?:grosses|généreuses)", s) else s
    s = re.sub(r"^(?:d'|d’)", "", s)
    # parenthèses de conseil, de marque ou de rappel : rien qui aide à faire les courses
    conseils = r"\((?:[^()]*(?:voir|selon (?:la|le|votre)|Belazu|choisissez|recherchez|essayez|vérifiez|marque|c'est bien|ne pas secouer|poids net|si vous|un mélange de vert|idéalement|pour le rendre|de préférence|nous avons|fait avec)[^()]*)\)"
    s = re.sub(r"\s*" + conseils, "", s)
    s = re.sub(r",?\s*selon (?:le degré|la température) [^,()]*", "", s)
    s = re.sub(r"\s*\(facultatif\)|,?\s*\(?facultatif\)?$|\s+en option$", "", s)
    s = re.sub(r"\s+et un (?:peu|supplément)(?: plus)? (?:pour|si) [^,()]*$", "", s)
    s = re.sub(r",?\s+(?:et |plus )?un peu plus pour [^,()]*$", "", s)
    s = re.sub(r"\s+provenant d'une source durable", "", s)
    s = re.sub(r"\s{2,}", " ", s).strip(" ,;")
    return s[:1].upper() + s[1:] if s else s

if __name__ == '__main__':
    labels = sorted({i['label'].strip() for y in R for v in y['variants'] for i in v['ingredients']})
    for l in labels:
        n = nettoyer(l)
        print(f"{n}\t{l}")
