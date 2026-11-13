// Accès aux données du lot 5 : profil alimentaire (api/nutritionProfile), semaine choisie (api/mealPlan),
// journal et recettes personnelles (api/personalFood), produits Open Food Facts (api/searchFoods, api/lookupFood).
// En démo, tout reste sur cet appareil et suit les mêmes règles que les fonctions SQL.
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { SupabaseClient } from '@supabase/supabase-js';

import { blankPreferences, calculate, nutritionToday, preferences, target, type Preferences, type Target } from '@/domain/nutrition/calcul';
import { diary, foodSearchQuery, library, namedProducts, parseProduct, type Entry, type NamedProduct, type PersonalRecipe } from '@/domain/nutrition/personnel';
import { type Plan } from '@/domain/nutrition/recettes';
import { nouvelId } from '@/lib/identifiant';

import { CLIENTS_DEMO } from './demo';
import { depot } from './index';
import { supabase } from './supabase';

/** nutritionOutput d'origine. */
export interface DonneesNutrition {
  profilId: string;
  nom: string;
  version: string;
  dateNaissance: string | null;
  preferences: Preferences;
  /** `true` dès que le client a enregistré son profil (le coach ne fixe pas d'objectifs avant). */
  enregistre: boolean;
  objectifCoach: Target | null;
  calcul: ReturnType<typeof calculate>;
}
export type ActionProfil = 'preferences' | 'coach' | 'auto';
export type ProduitOff = NonNullable<ReturnType<typeof parseProduct>>;

export interface DepotNutrition {
  profil(clientId: string): Promise<DonneesNutrition>;
  enregistrerProfil(
    clientId: string,
    action: ActionProfil,
    valeurs: { preferences?: Preferences; objectif?: Target },
    version: string,
    envoiId: string,
  ): Promise<DonneesNutrition>;
  semaine(clientId: string, semaine: string): Promise<{ plan: Plan; version: string }>;
  enregistrerSemaine(clientId: string, semaine: string, plan: Plan, version: string, envoiId: string): Promise<{ plan: Plan; version: string }>;
  personnel(clientId: string, kind: 'recipes' | 'diary', date: string): Promise<{ recipes: PersonalRecipe[]; entries: Entry[]; version: number }>;
  enregistrerPersonnel(
    clientId: string,
    kind: 'recipes' | 'diary',
    date: string,
    contenu: PersonalRecipe[] | Entry[],
    version: number,
    envoiId: string,
  ): Promise<{ recipes: PersonalRecipe[]; entries: Entry[]; version: number }>;
}

export const SEMAINE_MODIFIEE = 'Le planning a été modifié. Actualisez avant de réessayer.';
export const PROFIL_MODIFIE = 'Le profil a changé. Actualisez avant de réessayer.';
export const PERSONNEL_MODIFIE = 'Ces données ont changé. Actualisez avant de réessayer.';

const planVide = (): Plan => Array.from({ length: 7 }, () => []);

/** nutritionRead : le poids de la dernière mesure remplace celui du profil (la taille n'est pas dans Mesures ici). */
function lecture(clientId: string, nom: string, ligne: LigneProfil | undefined, poidsMesure: number | null): DonneesNutrition {
  const prefs = ligne?.preferences ? preferences.parse(ligne.preferences) : blankPreferences();
  if (poidsMesure !== null && poidsMesure > 0 && poidsMesure <= 500) prefs.poids = poidsMesure;
  return {
    profilId: clientId,
    nom,
    version: ligne?.version ?? '',
    dateNaissance: null,
    preferences: prefs,
    enregistre: !!ligne?.preferences,
    objectifCoach: ligne?.objectifs ? target.parse(ligne.objectifs) : null,
    calcul: calculate(prefs),
  };
}
interface LigneProfil {
  preferences: unknown;
  objectifs: unknown;
  version: string;
  envoiId: string;
}

function verifierObjectif(o: Target | undefined) {
  if (!o) throw new Error('Objectifs incomplets');
  target.parse(o);
}

// ---------- Démo ----------

const CLE = 'coachos.demo.nutrition';
interface Etat {
  profils: Record<string, LigneProfil>;
  semaines: Record<string, { plan: Plan; version: string; envoiId: string }>;
  personnel: Record<string, { donnees: unknown[]; version: number; envoiId: string }>;
}
async function lire(): Promise<Etat> {
  try {
    const brut = await AsyncStorage.getItem(CLE);
    if (brut) return JSON.parse(brut) as Etat;
  } catch {
    // Stockage indisponible : on repart de zéro.
  }
  return { profils: {}, semaines: {}, personnel: {} };
}
const sauver = (e: Etat) => AsyncStorage.setItem(CLE, JSON.stringify(e));
const nomDemo = (clientId: string) => {
  const c = CLIENTS_DEMO.find((x) => x.id === clientId);
  return c ? `${c.prenom} ${c.nom}` : 'Client';
};
async function poidsDemo(clientId: string) {
  const jour = nutritionToday();
  return (await depot.mensurations(clientId)).find((m) => m.date <= jour && m.poidsKg !== undefined)?.poidsKg ?? null;
}

export const nutritionDemo: DepotNutrition = {
  async profil(clientId) {
    return lecture(clientId, nomDemo(clientId), (await lire()).profils[clientId], await poidsDemo(clientId));
  },

  async enregistrerProfil(clientId, action, valeurs, version, envoiId) {
    const e = await lire();
    const ligne = e.profils[clientId];
    if (ligne?.envoiId === envoiId) return this.profil(clientId);
    if ((ligne?.version ?? '') !== version) throw new Error(PROFIL_MODIFIE);
    const nouvelle = new Date().toISOString();
    if (action === 'preferences') {
      if (!valeurs.preferences) throw new Error('Profil alimentaire incomplet');
      const prefs = { ...preferences.parse(valeurs.preferences) };
      const ancien = (ligne?.preferences ?? {}) as Partial<Preferences>;
      prefs.ageSaisiLe = prefs.age !== null ? (ancien.age === prefs.age && ancien.ageSaisiLe ? ancien.ageSaisiLe : nutritionToday()) : '';
      const poids = await poidsDemo(clientId);
      if (prefs.poids !== null && prefs.poids !== poids)
        await depot.ajouterMensuration({ id: nouvelId(), clientId, date: nutritionToday(), poidsKg: prefs.poids });
      e.profils[clientId] = { preferences: prefs, objectifs: ligne?.objectifs ?? null, version: nouvelle, envoiId };
    } else {
      if (!ligne?.preferences) throw new Error('Le client doit d’abord enregistrer son profil alimentaire.');
      if (action === 'coach') verifierObjectif(valeurs.objectif);
      e.profils[clientId] = { ...ligne, objectifs: action === 'auto' ? null : valeurs.objectif!, version: nouvelle, envoiId };
    }
    await sauver(e);
    return this.profil(clientId);
  },

  async semaine(clientId, semaine) {
    const s = (await lire()).semaines[`${clientId}|${semaine}`];
    return { plan: s?.plan ?? planVide(), version: s?.version ?? '' };
  },

  async enregistrerSemaine(clientId, semaine, plan, version, envoiId) {
    const e = await lire();
    const cle = `${clientId}|${semaine}`;
    const s = e.semaines[cle];
    if (s?.envoiId === envoiId) return { plan: s.plan, version: s.version };
    if ((s?.version ?? '') !== version) throw new Error(SEMAINE_MODIFIEE);
    e.semaines[cle] = { plan, version: new Date().toISOString(), envoiId };
    await sauver(e);
    return { plan, version: e.semaines[cle].version };
  },

  async personnel(clientId, kind, date) {
    const p = (await lire()).personnel[`${clientId}|${kind}|${kind === 'recipes' ? 'library' : date}`];
    return {
      recipes: kind === 'recipes' && p ? library.parse(p.donnees) : [],
      entries: kind === 'diary' && p ? diary.parse(p.donnees) : [],
      version: p?.version ?? 0,
    };
  },

  async enregistrerPersonnel(clientId, kind, date, contenu, version, envoiId) {
    const e = await lire();
    const cle = `${clientId}|${kind}|${kind === 'recipes' ? 'library' : date}`;
    const p = e.personnel[cle];
    if (p?.envoiId === envoiId) return this.personnel(clientId, kind, date);
    if ((p?.version ?? 0) !== version) throw new Error(PERSONNEL_MODIFIE);
    const donnees = kind === 'recipes' ? library.parse(contenu) : diary.parse(contenu);
    e.personnel[cle] = { donnees, version: (p?.version ?? 0) + 1, envoiId };
    await sauver(e);
    return this.personnel(clientId, kind, date);
  },
};

// ---------- Supabase ----------

const erreur = (e: { message: string } | null) => {
  if (e) throw new Error(e.message);
};

export function creerNutritionSupabase(db: SupabaseClient): DepotNutrition {
  return {
    async profil(clientId) {
      const jour = nutritionToday();
      const [client, ligne, mesure] = await Promise.all([
        db.from('clients').select('prenom, nom').eq('id', clientId).maybeSingle(),
        db.from('profils_alimentaires').select('preferences, objectifs, version, envoi_id').eq('client_id', clientId).maybeSingle(),
        db
          .from('mensurations')
          .select('poids_kg')
          .eq('client_id', clientId)
          .not('poids_kg', 'is', null)
          .lte('date', jour)
          .order('date', { ascending: false })
          .order('created_at', { ascending: false })
          .limit(1),
      ]);
      erreur(client.error);
      erreur(ligne.error);
      erreur(mesure.error);
      const l = ligne.data as { preferences: unknown; objectifs: unknown; version: string; envoi_id: string } | null;
      const nom = client.data ? `${client.data.prenom ?? ''} ${client.data.nom ?? ''}`.trim() : '';
      const poids = mesure.data?.[0]?.poids_kg;
      return lecture(
        clientId,
        nom,
        l ? { preferences: l.preferences, objectifs: l.objectifs, version: l.version, envoiId: l.envoi_id } : undefined,
        poids === undefined || poids === null ? null : Number(poids),
      );
    },

    async enregistrerProfil(clientId, action, valeurs, version, envoiId) {
      if (action === 'preferences') preferences.parse(valeurs.preferences);
      if (action === 'coach') verifierObjectif(valeurs.objectif);
      const { error } = await db.rpc('enregistrer_profil_alimentaire', {
        p_client: clientId,
        p_action: action,
        p_preferences: valeurs.preferences ?? null,
        p_objectif: valeurs.objectif ?? null,
        p_version: version,
        p_envoi: envoiId,
      });
      erreur(error);
      return this.profil(clientId);
    },

    async semaine(clientId, semaine) {
      const { data, error } = await db.from('plans_alimentaires').select('plan, version').eq('client_id', clientId).eq('semaine', semaine).maybeSingle();
      erreur(error);
      return { plan: (data?.plan as Plan) ?? planVide(), version: data?.version ?? '' };
    },

    async enregistrerSemaine(clientId, semaine, plan, version, envoiId) {
      const { data, error } = await db.rpc('enregistrer_plan_alimentaire', {
        p_client: clientId,
        p_semaine: semaine,
        p_plan: plan,
        p_version: version,
        p_envoi: envoiId,
      });
      erreur(error);
      return { plan, version: data as string };
    },

    async personnel(clientId, kind, date) {
      const { data, error } = await db
        .from('alimentation_personnelle')
        .select('donnees, version')
        .eq('client_id', clientId)
        .eq('type', kind)
        .eq('cle', kind === 'recipes' ? 'library' : date)
        .maybeSingle();
      erreur(error);
      return {
        recipes: kind === 'recipes' && data ? library.parse(data.donnees) : [],
        entries: kind === 'diary' && data ? diary.parse(data.donnees) : [],
        version: data?.version ?? 0,
      };
    },

    async enregistrerPersonnel(clientId, kind, date, contenu, version, envoiId) {
      const donnees = kind === 'recipes' ? library.parse(contenu) : diary.parse(contenu);
      const { data, error } = await db.rpc('enregistrer_alimentation_personnelle', {
        p_client: clientId,
        p_type: kind,
        p_date: kind === 'diary' ? date : null,
        p_donnees: donnees,
        p_version: version,
        p_envoi: envoiId,
      });
      erreur(error);
      return {
        recipes: kind === 'recipes' ? (donnees as PersonalRecipe[]) : [],
        entries: kind === 'diary' ? (donnees as Entry[]) : [],
        version: data as number,
      };
    },
  };
}

export const nutrition: DepotNutrition = supabase ? creerNutritionSupabase(supabase) : nutritionDemo;

// ---------- Open Food Facts (lu directement depuis l'appareil, comme le reste de l'app) ----------

const produits = new Map<string, { time: number; value: ProduitOff | null }>();
const recherches = new Map<string, { time: number; products: NamedProduct[] }>();
const HEURE = 3600000;
function delai(ms: number) {
  const c = new AbortController();
  setTimeout(() => c.abort(), ms);
  return c.signal;
}

/** lookupFood d'origine : fiche produit par code-barres ; `null` si le produit est absent de la base. */
export async function produitParCode(barcode: string): Promise<ProduitOff | null> {
  if (!/^(?:\d{8}|\d{12}|\d{13}|\d{14})$/.test(barcode)) throw new Error('Saisissez les 8, 12, 13 ou 14 chiffres du code-barres.');
  const cache = produits.get(barcode);
  if (cache && Date.now() - cache.time < HEURE) return cache.value;
  let r: Response;
  try {
    r = await fetch(
      `https://world.openfoodfacts.org/api/v2/product/${barcode}.json?fields=product_name,product_name_fr,generic_name_fr,brands,nutriments,nutrition_data_per,ingredients_text,ingredients_text_fr,allergens`,
      { signal: delai(12000) },
    );
  } catch {
    throw new Error('Base produits indisponible. Vous pouvez saisir cet aliment manuellement.');
  }
  if (r.status === 404) return null;
  if (r.status === 429) throw new Error('La base produits est momentanément très sollicitée. Réessayez plus tard ou saisissez les valeurs de l’étiquette.');
  if (!r.ok) throw new Error('Base produits indisponible. Vous pouvez saisir cet aliment manuellement.');
  const value = parseProduct(await r.json(), barcode);
  if (produits.size > 500) produits.clear();
  produits.set(barcode, { time: Date.now(), value });
  return value;
}

/** searchFoods d'origine : produits de marque par nom ou marque, reliés à leur code-barres. */
export async function rechercherProduits(query: string, france: boolean): Promise<NamedProduct[]> {
  const q = foodSearchQuery(query, france);
  const cache = recherches.get(q);
  if (cache && Date.now() - cache.time < HEURE) return cache.products;
  let r: Response;
  try {
    r = await fetch('https://search.openfoodfacts.org/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ q, langs: ['fr', 'en'], page_size: 12, fields: ['code', 'product_name', 'brands', 'quantity'], boost_phrase: true }),
      signal: delai(15000),
    });
  } catch {
    throw new Error('Recherche de marques indisponible. Utilisez Ciqual ou le code-barres.');
  }
  if (r.status === 429) throw new Error('La recherche de marques est momentanément limitée. Réessayez plus tard ; Ciqual et la saisie manuelle restent disponibles.');
  if (!r.ok) throw new Error('Recherche de marques indisponible. Utilisez Ciqual ou le code-barres.');
  const payload = await r.json();
  if (payload.errors?.length) throw new Error('La recherche n’a pas abouti. Précisez le nom du produit.');
  const products = namedProducts(payload);
  if (recherches.size > 200) recherches.clear();
  recherches.set(q, { time: Date.now(), products });
  return products;
}
