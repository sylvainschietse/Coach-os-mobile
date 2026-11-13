import json, os, re, unicodedata
from poids import P, r as RECETTES
from regles import REGLES
from resoudre import par_code
codes = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'codes.json')))
n = lambda t: unicodedata.normalize('NFD', t.lower().replace('œ', 'oe')).encode('ascii', 'ignore').decode()
DOUTEUX = {'other:1', 'other:0', 'other:tranches', 'other:litre/1', 'other:- 1', 'other:de grosses poignees'}
PIECE = {'egg': 55, 'lime': 45, 'lemon': 60, 'protein:chickenRaw': 150, 'protein:chickenThighRaw': 100, 'protein:salmonSmoked': 25, 'ginger': 15, 'coriander': 20,
         'parsley': 20, 'thyme': 1, 'spice:cinnamon': 3}
# Priorité au texte d'origine (anglais) quand la clé d'aliment de l'export est trompeuse
# Poudres protéinées : pas dans Ciqual, valeurs déduites des versions « + protéines » publiées (écart avec la version de base, pour 20 g)
par_code['etiquette:whey'] = {'code': 'etiquette:whey', 'name': 'Whey vanille (étiquette Myprotein)', 'kcal': 379.0, 'protein': 72.0, 'carbs': 8.9, 'fat': 5.9}
par_code['etiquette:soja'] = {'code': 'etiquette:soja', 'name': 'Isolat de soja (étiquette Myprotein)', 'kcal': 349.0, 'protein': 78.0, 'carbs': 7.5, 'fat': 0.8}
ORIG = [(r'soy protein powder', 'etiquette:soja'), (r'^(?!.*hemp).*(whey|protein powder)', 'etiquette:whey'), (r'\b(stock|bouillon)\b.*\bmade with|\d\s*(ml|l|litres?)\b.*\b(stock|bouillon)', None), (r'rice wine vinegar|vinegar', '11018'), (r'brandy|cognac', '1023'),
        (r'^[\d\s½¼¾⅓.]*(cups?|ml|l|litres?|tbsp|tsp)?\s*(of )?(cold |hot |boiling |warm |tap )?water\b|ice cubes', '18066'), (r'tortilla|wraps?\b', '7815'), (r'edamame|light coconut milk|reduced-fat coconut', 'inconnu'), (r'(straight-to-wok|ready-to-(cook|eat)|fresh)[^,]*(udon|noodles)|cooked (noodles|spaghetti|pasta)', '9811'), (r'cranberry juice', '2381'), (r'fennel', '20028'), (r'parsnip', '20181'), (r'beetroot', '20003'), (r'(mixed|pumpkin|three)[- ]seed', '15064'), (r'filo', '23445'), (r'meatballs', '25163'), (r'pineapple', '13002'), (r'half-fat cr[eè]me fra[iî]che', '19431'), (r'almond extract|baby corn|bombay mix|sun-?dried tomato|soya bean', 'inconnu'),
        (r'(can|cans|tin|jar)\b[^,]*\b(butter|cannellini|white|haricot|lima|flageolet) beans|(butter|cannellini|white) beans[^,]*(drained|rinsed)', '20511'),
        (r'(can|cans|tin|jar)\b[^,]*\b(kidney|black|pinto|borlotti|mixed) beans|(kidney|black|pinto|borlotti|mixed) beans[^,]*(drained|rinsed)', '20524'),
        (r'(pouch|cooked)[^,]*(freekeh|spelt|farro|bulgur|mixed grains)', '9081'),
        (r'(cooked|steamed|pouch|microwave)[^,]*brown rice|wholegrain rice', '9103'), (r'(cooked|steamed|pouch|microwave)[^,]*rice|rice[^,]*(pouch|cooked)', '9104')]
STOCK = [(r'beef|lamb', '25930'), (r'chicken|fish|turkey', '25947'), (r'', '25948')]
def code_de(i):
    o = (i.get('original') or '').lower()
    for rx, c in ORIG:
        if re.search(rx, o):
            if c == 'inconnu': return None
            if c: return c
            return next(c for r2, c in STOCK if re.search(r2, o))
    k = i['foodKey']
    if k in codes and k not in DOUTEUX: return codes[k]
    x = n(i['label'])
    return next((c for rx, c in REGLES if re.search(rx, x)), None)
# Poids d'une pièce selon le texte d'origine, quand le catalogue n'en donne pas (grammes, valeurs usuelles)
PIECE_ORIG = [(r'loaf', 400), (r'brioche', 35), (r'slices?[^,]*bread|bread slice', 40), (r'rolls?\b', 60), (r'pitta|pita|flatbread', 60), (r'small[^,]*tortilla', 30),
              (r'tortilla|wrap', 45), (r'nests?[^,]*noodles', 60), (r'heaped tbsp', 22), (r'heaped tsp', 3), (r'stock cube', 10), (r'prosciutto', 15),
              (r'bird.s eye|thai chill', 3), (r'chilli|chillies|jalape', 15), (r'shallot', 30), (r'baby[^,]*pak choi|baby[^,]*bok', 60), (r'pak choi|bok choi', 120),
              (r'small fennel', 150), (r'fennel', 250), (r'little gem|baby gem', 80), (r'romaine', 200), (r'beetroot', 80), (r'passion fruit', 18), (r'dates?\b', 8),
              (r'clementine', 60), (r'olives?', 4), (r'walnuts?', 4), (r'handfuls?[^,]*(spinach|kale|rocket)', 30), (r'handfuls?[^,]*mushroom', 40),
              (r'parsnip', 150), (r'seaweed thin|nori', 3), (r'sachet[^,]*seasoning', 30), (r'bunch[^,]*dill', 20), (r'pack[^,]*basil', 30),
              (r'bay lea|star anise|rosemary|sage sprig', 0.3), (r'cans?\b', 240)]
def poids_piece(i):
    o = (i.get('original') or '').lower()
    return next((w for rx, w in PIECE_ORIG if re.search(rx, o)), None)
def grammes(i):
    u, a, p = i['amountUnit'], i['amount'], P.get(i['foodKey'], {})
    if i.get('proteinRef') and i.get('proteinGrams'): return i['proteinGrams']
    if a is None: return None
    if u in ('g', 'ml'): return a
    if u == 'c. à soupe' and 'protein powder' in (i.get('original') or ''): return a * 8
    if u == 'c. à soupe': return a * (p.get('tbsp') or 15)
    if u == 'c. à café': return a * (p.get('tbsp') or 15) / 3
    if u == 'tasse (240 ml)': return a * 240
    if u == 'pièce':
        if p.get('piece'): return a * p['piece']
        if i['foodKey'] in PIECE: return a * PIECE[i['foodKey']]
        w = poids_piece(i)
        return a * w if w else None
    if u == 'boîte': return a * 240
    return None
def macros(i):
    c, g = code_de(i), grammes(i)
    if not c or g is None: return None
    f = par_code[c]
    return {'g': g, 'code': c, 'kcal': f['kcal'] * g / 100, 'p': (f['protein'] or 0) * g / 100, 'c': (f['carbs'] or 0) * g / 100, 'f': (f['fat'] or 0) * g / 100}
if __name__ == '__main__':
    lignes = []
    for y in RECETTES:
        for v in y['variants']:
            tot = {'kcal': 0, 'p': 0, 'c': 0, 'f': 0}; inconnus = 0
            for i in v['ingredients']:
                m = macros(i)
                if m is None:
                    if i['amountUnit'] != 'selon goût': inconnus += 1
                    continue
                for k in tot: tot[k] += m[k]
            pub = v['macros']
            ecart = (tot['kcal'] - pub['kcal']) / max(pub['kcal'], 1)
            lignes.append((ecart, y['name'], v['id'], round(tot['kcal']), pub['kcal'], round(tot['p'], 1), pub['protein'], inconnus))
    lignes.sort()
    import statistics
    e = [abs(l[0]) for l in lignes]
    print(len(lignes), 'versions ; écart médian', round(statistics.median(e) * 100), '% ; <15 %:', sum(x < .15 for x in e), '; >30 %:', sum(x > .3 for x in e))
    for l in lignes[:12] + lignes[-15:]: print(f"{l[0]*100:+.0f}% {l[1]} / {l[2]} : {l[3]} vs {l[4]} kcal, P {l[5]} vs {l[6]}, sans valeur {l[7]}")
