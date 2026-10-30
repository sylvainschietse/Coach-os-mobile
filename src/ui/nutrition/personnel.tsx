// PersonalFood.tsx d'origine (N04, N05) : « Mon journal alimentaire » par jour et par repas, comparé aux objectifs,
// et « Mes recettes personnelles » dont les macros par portion se calculent depuis les ingrédients.
// Aliments : Ciqual, produits de marque et code-barres Open Food Facts, ou saisie de l'étiquette.
import { Plus, RefreshCw, Trash2 } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';

import { nutrition, produitParCode, type DonneesNutrition } from '@/data/nutrition';
import { macros } from '@/domain/nutrition/calcul';
import type { CiqualFood } from '@/domain/nutrition/ciqual';
import { foodMeasures, measuredAmount } from '@/domain/nutrition/mesures';
import { food, foodTotal, recipeFood, type Entry, type PersonalRecipe } from '@/domain/nutrition/personnel';
import { brouillonsOuverts, ecrireBrouillon, lireBrouillon } from '@/lib/brouillon';
import { nouvelId } from '@/lib/identifiant';

import { BoutonContour, Selecteur, TitreDisplay } from '../coque';
import { Cellule, Grille, Modale, Repliable, Saisie } from '../crm/dossier';
import { Action, Confirmation, Etat, ts } from '../entrainement/commun';
import { couleurs, polices } from '../theme';
import { Bloc, doux, Lien } from './commun';
import { RechercheAliment } from './recherche-aliment';
import { ScannerCode } from './scanner-code';

type Form = {
  name: string;
  barcode: string;
  basis: 'g' | 'ml' | 'portion';
  source: 'manual' | 'off' | 'recipe' | 'ciqual';
  reference?: string;
  note?: string;
  kcal: string;
  protein: string;
  carbs: string;
  fat: string;
};
const blank = (): Form => ({ name: '', barcode: '', basis: 'g', source: 'manual', kcal: '', protein: '', carbs: '', fat: '' });
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(new Date());
const round = (n: number) => Number(n.toFixed(1));
const mealNames = ['Petit déjeuner', 'Déjeuner', 'Dîner', 'Collation'] as const;
const nutrientLabels = [
  ['kcal', 'Calories', 'kcal'],
  ['protein', 'Protéines', 'g'],
  ['carbs', 'Glucides', 'g'],
  ['fat', 'Lipides', 'g'],
] as const;
const BASES = [
  { cle: 'g', libelle: 'Pour 100 g' },
  { cle: 'ml', libelle: 'Pour 100 ml' },
  { cle: 'portion', libelle: 'Pour 1 portion' },
] as const;
const num = (t: string) => Number(t.replace(',', '.'));
const jourValide = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && new Date(`${s}T12:00:00Z`).toISOString().slice(0, 10) === s;

type Brouillon = {
  f: Form;
  amount: string;
  name: string;
  servings: string;
  steps: string;
  ingredients: Entry[];
  editing: string;
  measure: string;
  measureSize: string;
};

function LigneAliment({ e, desactive, onRetirer }: { e: Entry; desactive: boolean; onRetirer: () => void }) {
  const t = foodTotal([e]);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, borderRadius: 12, borderWidth: 1, borderColor: couleurs.bordure, backgroundColor: couleurs.carte, padding: 12 }}>
      <View style={{ flexShrink: 1, gap: 2 }}>
        <Text style={ts.titreChamp}>{e.food.name}</Text>
        <Text style={doux}>
          {e.measure ? e.measureCount + ' × ' + e.measure + ' · ' : ''}
          {round(e.amount)} {e.food.basis === 'portion' ? 'portion(s)' : e.food.basis} · {round(t.kcal)} kcal · P {round(t.protein)} g · G {round(t.carbs)} g · L{' '}
          {round(t.fat)} g
        </Text>
        {e.food.source === 'ciqual' && <Lien petit url="https://doi.org/10.57745/RDMHWY">{`Source : Anses · Ciqual 2025 · ${e.food.reference}`}</Lien>}
        {!!e.food.note && <Text style={[doux, { fontSize: 11 }]}>{e.food.note}</Text>}
        {e.food.source === 'off' && !!e.food.barcode && <Lien petit url={'https://world.openfoodfacts.org/product/' + e.food.barcode}>Source : Open Food Facts</Lien>}
      </View>
      <Action variante="fantome" icone={Trash2} nom={'Retirer ' + e.food.name} desactive={desactive} onPress={onRetirer} />
    </View>
  );
}

export function PersonnelNutrition({ data, vue }: { data: DonneesNutrition; vue: 'journal' | 'personnelles' }) {
  const [foodOpen, setFoodOpen] = useState(false);
  const [date, setDate] = useState(today);
  const [saisieDate, setSaisieDate] = useState(today);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [recipes, setRecipes] = useState<PersonalRecipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [measure, setMeasure] = useState('');
  const [measureSize, setMeasureSize] = useState('');
  const [barcode, setBarcode] = useState('');
  const [f, setF] = useState<Form>(blank);
  const [amount, setAmount] = useState('100');
  const [meal, setMeal] = useState<Entry['meal']>('Déjeuner');
  const [sourceInfo, setSourceInfo] = useState<{ url: string; ingredients: string; allergens: string } | null>(null);
  const [name, setName] = useState('');
  const [servings, setServings] = useState('1');
  const [steps, setSteps] = useState('');
  const [ingredients, setIngredients] = useState<Entry[]>([]);
  const [editing, setEditing] = useState('');
  const [confirmer, setConfirmer] = useState<{ titre: string; texte: string; action: string; suite: () => Promise<void> | void } | null>(null);
  const [jeton, setJeton] = useState(0);
  const versions = useRef({ recipes: 0, diary: 0 });
  const working = useRef(false);
  const lookup = useRef(0);
  const draftLoaded = useRef(false);
  const availableMeasures = foodMeasures(f.name, f.basis);
  const selectedMeasure = availableMeasures.find((m) => m.id === measure);
  const resetMeasure = () => {
    setMeasure('');
    setMeasureSize('');
  };
  const draftKey = `coachos-personal-food:${data.profilId}:${vue}`;

  useEffect(() => {
    let actif = true;
    const recherche = lookup;
    (async () => {
      try {
        const [a, b] = await Promise.all([nutrition.personnel(data.profilId, 'recipes', date), nutrition.personnel(data.profilId, 'diary', date)]);
        if (!actif) return;
        setRecipes(a.recipes);
        setEntries(b.entries);
        versions.current = { recipes: a.version, diary: b.version };
        setError('');
      } catch (e) {
        if (actif) setError(e instanceof Error ? e.message : 'Chargement impossible');
      } finally {
        if (actif) setLoading(false);
      }
    })();
    return () => {
      actif = false;
      recherche.current++;
    };
  }, [data.profilId, date, jeton]);
  const load = () => {
    setLoading(true);
    setError('');
    setJeton((j) => j + 1);
  };

  // Brouillon de la saisie en cours (aliment ou recette), relu à l'ouverture.
  useEffect(() => {
    let actif = true;
    draftLoaded.current = false;
    lireBrouillon<Brouillon>(draftKey).then((saved) => {
      if (!actif) return;
      if (saved) {
        setF(saved.f || blank());
        setMeasure(saved.measure || '');
        setMeasureSize(saved.measureSize || '');
        setAmount(saved.amount || '100');
        setName(saved.name || '');
        setServings(saved.servings || '1');
        setSteps(saved.steps || '');
        setIngredients(saved.ingredients || []);
        setEditing(saved.editing || '');
        if (saved.f?.name || saved.f?.barcode) setFoodOpen(true);
        brouillonsOuverts.add(draftKey);
      }
      draftLoaded.current = true;
    });
    return () => {
      actif = false;
      brouillonsOuverts.delete(draftKey);
    };
  }, [draftKey]);
  // Chaque changement de la saisie met le brouillon à jour (l'effet d'origine, appelé ici à chaque modification).
  const garder = (b: Partial<Brouillon>) => {
    if (!draftLoaded.current) return;
    const s: Brouillon = { f, amount, name, servings, steps, ingredients, editing, measure, measureSize, ...b };
    const dirty = !!(s.f.name || s.f.barcode || s.name || s.ingredients.length || s.steps);
    ecrireBrouillon(draftKey, dirty ? s : null);
  };
  const majF = (x: Form) => {
    setF(x);
    garder({ f: x });
  };

  const save = async (kind: 'recipes' | 'diary', content: PersonalRecipe[] | Entry[]) => {
    if (working.current || loading) return false;
    working.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const result = await nutrition.enregistrerPersonnel(data.profilId, kind, date, content, versions.current[kind], nouvelId());
      versions.current[kind] = result.version;
      if (kind === 'recipes') setRecipes(result.recipes);
      else setEntries(result.entries);
      setNotice('Enregistré');
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Enregistrement impossible');
      return false;
    } finally {
      working.current = false;
      setBusy(false);
    }
  };

  const find = async (code = barcode) => {
    resetMeasure();
    const normalized = code.replace(/\s/g, '');
    setBarcode(normalized);
    setError('');
    setNotice('');
    setSourceInfo(null);
    majF({ ...blank(), barcode: normalized });
    if (!/^(?:\d{8}|\d{12}|\d{13}|\d{14})$/.test(normalized)) {
      setError('Saisissez les 8, 12, 13 ou 14 chiffres du code-barres.');
      return;
    }
    const token = ++lookup.current;
    setBusy(true);
    try {
      const p = await produitParCode(normalized);
      if (token !== lookup.current) return;
      if (!p) {
        setNotice('Produit absent de la base : renseignez son nom et les valeurs de son étiquette.');
        return;
      }
      majF({
        name: p.name + (p.brand ? ' · ' + p.brand : ''),
        barcode: normalized,
        basis: p.basis,
        source: 'off',
        kcal: p.kcal === null ? '' : String(round(p.kcal)),
        protein: p.protein === null ? '' : String(p.protein),
        carbs: p.carbs === null ? '' : String(p.carbs),
        fat: p.fat === null ? '' : String(p.fat),
      });
      setSourceInfo({ url: p.sourceUrl, ingredients: p.ingredients, allergens: p.allergens });
      setAmount('100');
      setNotice('Produit trouvé. Vérifiez les valeurs et l’unité sur l’étiquette avant de l’ajouter.');
    } catch (e) {
      if (token === lookup.current) setError(e instanceof Error ? e.message : 'Recherche indisponible');
    } finally {
      if (token === lookup.current) setBusy(false);
    }
  };

  const makeEntry = (): Entry => {
    if ((['kcal', 'protein', 'carbs', 'fat'] as const).some((k) => !f[k].trim()))
      throw Error('Renseignez les quatre valeurs nutritionnelles : une valeur manquante ne vaut pas zéro.');
    const n = num(amount);
    if (!Number.isFinite(n) || n <= 0 || n > 10000) throw Error('Quantité invalide');
    const parsed = food.safeParse({ ...f, kcal: num(f.kcal), protein: num(f.protein), carbs: num(f.carbs), fat: num(f.fat) });
    if (!parsed.success)
      throw Error(
        parsed.error.issues.some((i) => i.path[0] === 'name') ? 'Indiquez le nom de l’aliment.' : 'Chaque valeur nutritionnelle est comprise entre 0 et 2 000.',
      );
    return {
      id: nouvelId(),
      food: parsed.data,
      amount: selectedMeasure ? measuredAmount(n, num(measureSize)) : n,
      meal,
      ...(selectedMeasure ? { measure: selectedMeasure.label, measureCount: n, measureSize: num(measureSize) } : {}),
    };
  };
  const fermerAliment = () => {
    majF(blank());
    resetMeasure();
    setSourceInfo(null);
    setFoodOpen(false);
  };
  const add = async () => {
    setError('');
    try {
      const e = makeEntry();
      if (vue === 'personnelles') {
        const suivants = [...ingredients, e];
        setIngredients(suivants);
        setF(blank());
        resetMeasure();
        setSourceInfo(null);
        setFoodOpen(false);
        garder({ ingredients: suivants, f: blank(), measure: '', measureSize: '' });
      } else if (await save('diary', [...entries, e])) fermerAliment();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Aliment invalide');
    }
  };
  const pickRecipe = (recipe: PersonalRecipe) => {
    setFoodOpen(true);
    resetMeasure();
    const value = recipeFood(recipe);
    majF({ ...value, kcal: String(value.kcal), protein: String(value.protein), carbs: String(value.carbs), fat: String(value.fat) });
    setAmount('1');
    setSourceInfo(null);
  };
  const clearRecipe = () => {
    setFoodOpen(false);
    setName('');
    setServings('1');
    setSteps('');
    setIngredients([]);
    setEditing('');
    setF(blank());
    resetMeasure();
    setSourceInfo(null);
    ecrireBrouillon(draftKey, null);
  };
  const pickCiqual = (value: CiqualFood) => {
    resetMeasure();
    lookup.current++;
    setBusy(false);
    setError('');
    majF({
      name: value.name,
      barcode: '',
      source: 'ciqual',
      reference: value.code,
      note: value.notes.join(' · '),
      basis: 'g',
      kcal: value.kcal === null ? '' : String(value.kcal),
      protein: value.protein === null ? '' : String(value.protein),
      carbs: value.carbs === null ? '' : String(value.carbs),
      fat: value.fat === null ? '' : String(value.fat),
    });
    setAmount('100');
    setSourceInfo(null);
    setNotice(
      'Aliment Ciqual sélectionné. Quantité en grammes de partie comestible, dans l’état indiqué.' +
        (value.notes.length ? ' Certaines valeurs sont à vérifier ou compléter.' : ''),
    );
  };

  const totalJour = foodTotal(entries);
  const cible = data.objectifCoach || data.calcul.cible;
  const goals = cible ? macros(cible) : null;

  return (
    <View style={{ gap: 20 }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <View style={{ flexShrink: 1 }}>
          <TitreDisplay taille={24}>{vue === 'journal' ? 'Mon journal alimentaire' : 'Mes recettes personnelles'}</TitreDisplay>
          <Text style={[ts.texte, { marginTop: 4, color: couleurs.texteDoux }]}>
            {vue === 'journal'
              ? 'Notez ce que vous avez mangé et comparez votre journée à vos objectifs.'
              : 'Ajoutez vos ingrédients et le nombre de portions : les macros se calculent automatiquement.'}
          </Text>
        </View>
        <BoutonContour icone={RefreshCw} nom="Actualiser" desactive={loading || busy} onPress={load} />
      </View>
      {!foodOpen && <Etat erreur={error || undefined} message={notice || undefined} />}
      {vue === 'journal' && (
        <>
          <Saisie
            libelle="Date du journal"
            placeholder="AAAA-MM-JJ"
            valeur={saisieDate}
            desactive={busy}
            aide={jourValide(saisieDate) ? undefined : 'Date au format AAAA-MM-JJ.'}
            onChange={(t) => {
              setSaisieDate(t);
              if (jourValide(t) && t !== date) {
                setLoading(true);
                setDate(t);
              }
            }}
          />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {nutrientLabels.map(([k, label, unit]) => {
              const goal = k === 'kcal' ? cible?.calories : k === 'protein' ? goals?.proteines : k === 'carbs' ? goals?.glucides : goals?.lipides;
              return (
                <View key={k} style={{ width: '48%', flexGrow: 1, borderRadius: 12, borderWidth: 1, borderColor: couleurs.bordure, backgroundColor: 'rgba(195,24,30,0.05)', padding: 12 }}>
                  <Text style={doux}>{label}</Text>
                  <Text style={{ marginTop: 4, fontFamily: polices.texteGras, fontSize: 20, color: couleurs.texte }}>
                    {round(totalJour[k])} {unit}
                  </Text>
                  {goal !== undefined && (
                    <>
                      <Text style={doux}>
                        Objectif : {goal} {unit}
                      </Text>
                      <Text style={[doux, { marginTop: 4 }]}>
                        {totalJour[k] <= goal ? 'Restant : ' : 'Au-dessus : '}
                        {round(Math.abs(goal - totalJour[k]))} {unit}
                      </Text>
                      <View
                        accessibilityRole="progressbar"
                        accessibilityLabel={label + ' par rapport à l’objectif'}
                        style={{ marginTop: 8, height: 8, borderRadius: 4, backgroundColor: couleurs.discret, overflow: 'hidden' }}
                      >
                        <View style={{ height: 8, width: `${Math.min(100, (totalJour[k] / (goal || 1)) * 100)}%`, backgroundColor: couleurs.rouge }} />
                      </View>
                    </>
                  )}
                </View>
              );
            })}
          </View>
        </>
      )}
      {vue === 'personnelles' && (
        <Bloc>
          <Saisie
            libelle="Nom de ma recette"
            max={200}
            valeur={name}
            onChange={(t) => {
              setName(t);
              garder({ name: t });
            }}
          />
          <Saisie
            libelle="Nombre de portions obtenues"
            type="nombre"
            valeur={servings}
            onChange={(t) => {
              setServings(t);
              garder({ servings: t });
            }}
          />
          <Saisie
            libelle="Étapes de préparation"
            long
            max={10000}
            valeur={steps}
            onChange={(t) => {
              setSteps(t);
              garder({ steps: t });
            }}
          />
          <Text style={doux}>Saisissez les quantités utilisées pour toute la recette, en précisant cru ou cuit dans le nom de l’aliment.</Text>
          {ingredients.map((e) => (
            <LigneAliment
              key={e.id}
              e={e}
              desactive={busy || loading}
              onRetirer={() => {
                const suivants = ingredients.filter((i) => i.id !== e.id);
                setIngredients(suivants);
                garder({ ingredients: suivants });
              }}
            />
          ))}
          {ingredients.length > 0 && num(servings) > 0 && (
            <Text style={ts.titreChamp}>
              Par portion : {round(foodTotal(ingredients).kcal / num(servings))} kcal · P {round(foodTotal(ingredients).protein / num(servings))} g · G{' '}
              {round(foodTotal(ingredients).carbs / num(servings))} g · L {round(foodTotal(ingredients).fat / num(servings))} g
            </Text>
          )}
        </Bloc>
      )}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12, borderRadius: 14, borderWidth: 1, borderColor: couleurs.bordure, backgroundColor: couleurs.carte, padding: 12 }}>
        <Text style={doux}>{vue === 'journal' ? 'Aliments enregistrés pour cette journée' : 'Composition de votre recette'}</Text>
        <Action icone={Plus} libelle={vue === 'journal' ? 'Ajouter un aliment' : 'Ajouter un ingrédient'} desactive={busy || loading} onPress={() => setFoodOpen(true)} />
      </View>
      {foodOpen && (
        <Modale
          titre={vue === 'journal' ? 'Ajouter à ma journée' : 'Ajouter un ingrédient'}
          onFermer={() => {
            if (!busy) setFoodOpen(false);
          }}
        >
          <Text style={doux}>Choisissez l’aliment, vérifiez sa quantité, puis validez.</Text>
          <Etat erreur={error || undefined} message={notice || undefined} />
          <RechercheAliment onBarcode={(code) => find(code)} disabled={busy || loading} onSelect={pickCiqual} />
          <ScannerCode
            onCode={(code) => {
              if (!busy) find(code);
            }}
          />
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Saisie libelle="Code-barres" type="nombre" max={20} placeholder="Chiffres sous le code-barres" valeur={barcode} onChange={setBarcode} />
            </View>
            <Action libelle="Rechercher" desactive={busy || loading} onPress={() => !busy && find()} />
          </View>
          <Text style={doux}>
            Vous pouvez aussi saisir directement un aliment et ses valeurs ci-dessous. Pour les aliments frais, utilisez une référence nutritionnelle
            correspondant à leur état cru ou cuit.
          </Text>
          {f.source === 'ciqual' && (
            <Text style={doux}>
              Référence Ciqual {f.reference} · pour 100 g. {f.note || 'Valeurs moyennes de référence.'}
            </Text>
          )}
          <Saisie
            libelle="Aliment"
            max={200}
            placeholder="Ex. riz cru, yaourt nature…"
            valeur={f.name}
            onChange={(t) => {
              resetMeasure();
              majF({ ...f, name: t });
            }}
          />
          <View style={{ borderRadius: 12, borderWidth: 1, borderColor: couleurs.bordure, padding: 12 }}>
            <Repliable
              key={f.source === 'manual' || [f.kcal, f.protein, f.carbs, f.fat].some((x) => !x) ? 'ouvert' : 'ferme'}
              ouvert={f.source === 'manual' || [f.kcal, f.protein, f.carbs, f.fat].some((x) => !x)}
              resume={<Text style={ts.titreChamp}>Vérifier ou modifier les valeurs nutritionnelles</Text>}
            >
              <View style={{ gap: 12 }}>
                {f.source === 'ciqual' ? (
                  <View style={{ gap: 4 }}>
                    <Text style={ts.titreChamp}>Valeurs de référence</Text>
                    <Text style={ts.texte}>Pour 100 g</Text>
                  </View>
                ) : (
                  <Selecteur
                    libelle="Valeurs de référence"
                    options={[...BASES]}
                    valeur={f.basis}
                    onChange={(b) => {
                      resetMeasure();
                      majF({ ...f, basis: b });
                    }}
                  />
                )}
                <Grille>
                  {nutrientLabels.map(([k, label, unit]) => (
                    <Cellule key={k}>
                      <Saisie libelle={`${label} (${unit})`} type="nombre" valeur={f[k]} onChange={(t) => majF({ ...f, [k]: t })} />
                    </Cellule>
                  ))}
                </Grille>
              </View>
            </Repliable>
          </View>
          {sourceInfo && (
            <Repliable resume={<Text style={doux}>Informations du produit</Text>}>
              <View style={{ gap: 8 }}>
                <Text style={[doux, { color: couleurs.texte }]}>{sourceInfo.ingredients || 'Ingrédients non renseignés dans la base.'}</Text>
                <Text style={[doux, { color: couleurs.texte }]}>Allergènes déclarés : {sourceInfo.allergens || 'non renseignés ; vérifiez l’étiquette'}</Text>
                <Lien url={sourceInfo.url}>Voir la fiche Open Food Facts</Lien>
              </View>
            </Repliable>
          )}
          {availableMeasures.length > 0 && (
            <Selecteur
              libelle="Unité pratique"
              options={[{ cle: '', libelle: `Quantité en ${f.basis}` }, ...availableMeasures.map((x) => ({ cle: x.id, libelle: x.label }))]}
              valeur={measure}
              onChange={(id) => {
                const next = availableMeasures.find((x) => x.id === id);
                setMeasure(id);
                setMeasureSize(next ? String(next.size) : '');
                setAmount(next ? '1' : String(selectedMeasure ? num(amount) * num(measureSize) : 100));
                garder({ measure: id, measureSize: next ? String(next.size) : '' });
              }}
            />
          )}
          {selectedMeasure && (
            <View style={{ borderRadius: 12, borderWidth: 1, borderColor: couleurs.bordure, backgroundColor: 'rgba(237,239,242,0.4)', padding: 12, gap: 8 }}>
              <Saisie
                libelle={`1 ${selectedMeasure.label.toLowerCase()} = (${selectedMeasure.approx ? 'estimation ajustable' : 'volume défini'})`}
                type="nombre"
                valeur={measureSize}
                onChange={(t) => {
                  setMeasureSize(t);
                  garder({ measureSize: t });
                }}
              />
              <Text style={doux}>
                {f.basis} par unité. Adaptez au format réel, à votre cuillère ou au poids mesuré.{' '}
                {selectedMeasure.approx ? 'Le calcul sera une estimation tant que ce poids n’est pas vérifié.' : ''}
              </Text>
              <Text style={ts.texte}>
                Quantité calculée : {round(num(amount) * num(measureSize))} {f.basis}
              </Text>
            </View>
          )}
          <Grille>
            <Cellule>
              <Saisie
                libelle={`${vue === 'journal' ? 'Quantité consommée' : 'Quantité pour la recette'} (${selectedMeasure ? 'nombre d’unités' : f.basis === 'portion' ? 'portions' : f.basis})`}
                type="nombre"
                valeur={amount}
                onChange={(t) => {
                  setAmount(t);
                  garder({ amount: t });
                }}
              />
            </Cellule>
            {vue === 'journal' && (
              <Cellule>
                <Selecteur libelle="Repas" options={mealNames.map((x) => ({ cle: x, libelle: x }))} valeur={meal} onChange={setMeal} />
              </Cellule>
            )}
          </Grille>
          <Action icone={Plus} libelle={vue === 'journal' ? 'Ajouter à ma journée' : 'Ajouter cet ingrédient'} desactive={busy || loading} chargement={busy} onPress={add} />
        </Modale>
      )}
      {vue === 'personnelles' && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          <Action
            libelle={editing ? 'Enregistrer les modifications' : 'Enregistrer ma recette'}
            desactive={busy || loading || !ingredients.length || !name.trim()}
            onPress={async () => {
              setError('');
              try {
                const recipe: PersonalRecipe = { id: editing || nouvelId(), name: name.trim(), servings: num(servings), steps, ingredients };
                if (!Number.isFinite(recipe.servings) || recipe.servings <= 0 || recipe.servings > 100) throw Error('Nombre de portions invalide');
                if (await save('recipes', [...recipes.filter((r) => r.id !== recipe.id), recipe])) clearRecipe();
              } catch (e) {
                setError(e instanceof Error ? e.message : 'Recette invalide');
              }
            }}
          />
          <Action
            variante="contour"
            libelle="Vider le brouillon"
            onPress={() => setConfirmer({ titre: 'Vider le brouillon', texte: 'Vider le brouillon de cette recette ?', action: 'Vider', suite: clearRecipe })}
          />
        </View>
      )}
      {loading ? (
        <Text style={ts.texte}>Chargement…</Text>
      ) : vue === 'journal' ? (
        <View style={{ gap: 16 }}>
          {mealNames.map((m) => (
            <View key={m} style={{ borderRadius: 16, borderWidth: 1, borderColor: couleurs.bordure, backgroundColor: couleurs.carte, padding: 16, gap: 8 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <Text style={ts.titre}>{m}</Text>
                <Action
                  petit
                  variante="fantome"
                  icone={Plus}
                  libelle="Ajouter"
                  nom={`Ajouter · ${m}`}
                  desactive={busy || loading}
                  onPress={() => {
                    setMeal(m);
                    setFoodOpen(true);
                  }}
                />
              </View>
              {entries
                .filter((e) => e.meal === m)
                .map((e) => (
                  <LigneAliment key={e.id} e={e} desactive={busy || loading} onRetirer={() => save('diary', entries.filter((i) => i.id !== e.id))} />
                ))}
              {!entries.some((e) => e.meal === m) && <Text style={doux}>Aucun aliment enregistré.</Text>}
            </View>
          ))}
        </View>
      ) : null}
      <View style={{ gap: 12 }}>
        <Text style={ts.titre}>{vue === 'journal' ? 'Utiliser une recette personnelle' : 'Mes recettes enregistrées'}</Text>
        {recipes.map((r) => {
          const p = recipeFood(r);
          return (
            <Bloc key={r.id} style={{ gap: 8 }}>
              <Text style={ts.titre}>{r.name}</Text>
              <Text style={doux}>
                {r.servings} portion(s) · {round(p.kcal)} kcal · P {round(p.protein)} g · G {round(p.carbs)} g · L {round(p.fat)} g par portion
              </Text>
              <Repliable resume={<Text style={ts.texte}>Ingrédients et préparation</Text>}>
                <View style={{ gap: 4 }}>
                  {r.ingredients.map((i) => (
                    <Text key={i.id} style={ts.texte}>
                      {round(i.amount)} {i.food.basis} · {i.food.name}
                    </Text>
                  ))}
                  <Text style={[ts.texte, { marginTop: 8 }]}>{r.steps || 'Étapes non renseignées.'}</Text>
                </View>
              </Repliable>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {vue === 'journal' ? (
                  <Action petit variante="contour" libelle="Choisir cette recette" onPress={() => pickRecipe(r)} />
                ) : (
                  <>
                    <Action
                      petit
                      variante="contour"
                      libelle="Modifier"
                      onPress={() => {
                        setEditing(r.id);
                        setName(r.name);
                        setServings(String(r.servings));
                        setSteps(r.steps);
                        setIngredients(r.ingredients);
                        garder({ editing: r.id, name: r.name, servings: String(r.servings), steps: r.steps, ingredients: r.ingredients });
                      }}
                    />
                    <Action
                      petit
                      variante="fantome"
                      libelle="Supprimer"
                      desactive={busy}
                      onPress={() =>
                        setConfirmer({
                          titre: 'Supprimer la recette',
                          texte: `Supprimer la recette « ${r.name} » ?`,
                          action: 'Supprimer',
                          suite: async () => {
                            if (!(await save('recipes', recipes.filter((x) => x.id !== r.id)))) throw new Error('Suppression impossible');
                          },
                        })
                      }
                    />
                  </>
                )}
              </View>
            </Bloc>
          );
        })}
        {!recipes.length && <Text style={[ts.texte, { color: couleurs.texteDoux }]}>Créez votre première recette dans « Mes recettes ».</Text>}
      </View>
      <View style={{ gap: 2 }}>
        <Text style={doux}>
          Valeurs estimées selon les quantités et les étiquettes. Vérifiez les données et les allergènes. Produits : Open Food Facts · base sous licence ODbL.
          Aliments courants : Anses, Ciqual 2025 (Licence Ouverte Etalab 2.0). Les recettes personnelles restent privées.
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 12 }}>
          <Lien petit url="https://world.openfoodfacts.org">Open Food Facts</Lien>
          <Lien petit url="https://opendatacommons.org/licenses/odbl/1-0/">licence ODbL</Lien>
        </View>
      </View>
      {confirmer && (
        <Confirmation
          titre={confirmer.titre}
          texte={confirmer.texte}
          action={confirmer.action}
          danger={confirmer.action === 'Supprimer'}
          onConfirmer={confirmer.suite}
          onFermer={() => setConfirmer(null)}
        />
      )}
    </View>
  );
}
