# Relit la quantité dans le texte d'origine (anglais) : « 2 x 400g cans », « 1½ tbsp », « 10 strawberries (approx 175g) »…
import re
FR = {'½': .5, '¼': .25, '¾': .75, '⅓': 1/3, '⅔': 2/3, '&frac12;': .5, '1⁄2': .5, '1⁄4': .25}
NB = r"(\d+(?:\.\d+)?(?:\s*[½¼¾⅓⅔])?|[½¼¾⅓⅔])"
def nombre(t):
    t = t.strip(); v = 0
    for k, x in FR.items():
        if k in t: v += x; t = t.replace(k, '')
    t = t.strip()
    return v + (float(t) if t else 0)
def lire(o):
    """→ (grammes, 'g'|'ml') pour la recette entière, ou (quantité, 'piece'|'tbsp'|'tsp'|'cup'), ou None."""
    s = o.replace('&frac12;', '½').replace('1⁄2', '½').replace('1⁄4', '¼').strip()
    s = re.sub(r"^(about|approx\.?|around|just under|generous|large|small)\s+", '', s, flags=re.I)
    m = re.match(r"(\d+(?:\.\d+)?)\s*cm\s+(piece|chunk)", s)
    if m: return float(m.group(1)), 'cm'
    # nombre × contenant de N g/ml : « 2 x 400g cans », « ½ x 250g pouch »
    m = re.match(NB + r"\s*x\s*(\d+(?:\.\d+)?)\s*(g|ml|kg|l)\b", s)
    if m: return nombre(m.group(1)) * float(m.group(2)) * (1000 if m.group(3) in ('kg', 'l') else 1), 'g' if m.group(3) in ('g', 'kg') else 'ml'
    m = re.match(NB + r"\s+[^()]*?(?:about |approx\.? )?(\d+(?:\.\d+)?)\s*(g|ml) each", s)
    if m: return nombre(m.group(1)) * float(m.group(2)), m.group(3)
    # poids explicite entre parenthèses quand la quantité est en pièces : « 10 strawberries (approx 175g) », « 3 rashers (100g) »
    m = re.match(NB + r"\s+[^()]*?\((?:about |approx\.? |around )?(\d+(?:\.\d+)?)\s*(g|ml)\b[^)]*(?:total)?[^)]*\)", s)
    if m and not re.search(r'each', m.group(0)): return float(m.group(2)), m.group(3)
    m = re.match(NB + r"\s*-?\s*(?:" + NB + r")?\s*(kg|g|ml|l|litres?|cl)\b(?!\w)", s)
    if m:
        a = nombre(m.group(1)); b = m.group(2)
        q = (a + nombre(b)) / 2 if b else a
        u = m.group(3)
        if u == 'kg': return q * 1000, 'g'
        if u in ('l', 'litre', 'litres'): return q * 1000, 'ml'
        if u == 'cl': return q * 10, 'ml'
        return q, u
    m = re.match(NB + r"\s*-?\s*(?:" + NB + r")?\s*(tbsp|tablespoons?|tsp|teaspoons?|cups?)\b", s, re.I)
    if m:
        a = nombre(m.group(1)); b = m.group(2); q = (a + nombre(b)) / 2 if b else a
        u = m.group(3).lower()
        return q, 'tbsp' if u.startswith('tab') or u == 'tbsp' else 'tsp' if u.startswith('t') else 'cup'
    m = re.match(NB + r"\s*(pounds?|lbs?|oz|ounces?)\b", s, re.I)
    if m:
        q = nombre(m.group(1)); return (q * 453.6 if m.group(2).lower().startswith(('p', 'l')) else q * 28.35), 'g'
    m = re.match(NB + r"\s+(\d+(?:\.\d+)?)-ounce", s)
    if m: return nombre(m.group(1)) * float(m.group(2)) * 28.35, 'g'
    m = re.match(NB + r"\s*-?\s*(?:" + NB + r")?\s", s)
    if m and not re.search(r'\beach\b', s):
        t = re.search(r"(?:about|approx\.?|you need|around)\s*(\d+(?:\.\d+)?)\s*(g|ml)\b", s)
        if t: return float(t.group(1)), t.group(2)
    if m:
        a = nombre(m.group(1)); b = m.group(2); return ((a + nombre(b)) / 2 if b else a), 'piece'
    return None
