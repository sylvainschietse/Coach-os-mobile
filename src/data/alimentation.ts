// Alimentation : profil, base d'aliments et codes-barres, recettes, journal des repas, photo des repas.
// Comme le reste des données : démo sur l'appareil sans Supabase, sinon la base (règles d'accès côté serveur).
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { SupabaseClient } from '@supabase/supabase-js';

import { lireProduitOff } from '@/domain/alimentation';
import type { Aliment, Contient, EntreeRepas, Ingredient, ProfilNutrition, Recette, Regime } from '@/domain/types';
import { nouvelId } from '@/lib/identifiant';

import alimentsBase from './aliments-base.json';
import { PROFILS_DEMO, RECETTES_DEMO, REPAS_DEMO } from './demo';
import { supabase } from './supabase';

/** Ce que la photo d'un repas laisse estimer : à vérifier par le client avant d'enregistrer. */
export interface EstimationPhoto {
  aliments: (Omit<Ingredient, 'contient' | 'alimentId'> & { confiance: 'haute' | 'moyenne' | 'basse' })[];
  remarque?: string;
}

export interface DepotAlimentation {
  profil(clientId: string): Promise<ProfilNutrition | null>;
  enregistrerProfil(p: ProfilNutrition): Promise<void>;
  /** Tous les aliments visibles : base commune, ceux du coach, ceux du client. */
  aliments(): Promise<Aliment[]>;
  /** Dans la base d'abord, sinon Open Food Facts ; le produit trouvé y est ajouté pour les prochains. */
  alimentParCode(code: string, coachId?: string): Promise<Aliment | null>;
  /** clientId : aliment personnel du client ; sinon aliment du coach. */
  ajouterAliment(a: Omit<Aliment, 'id' | 'source'>, auteur: { clientId: string } | { coachId: string }): Promise<Aliment>;
  /** Banque du coach : toutes pour le coach, les approuvées pour un client. */
  banqueRecettes(): Promise<Recette[]>;
  recettesPerso(clientId: string): Promise<Recette[]>;
  enregistrerRecette(r: Recette, coachId?: string): Promise<void>;
  repas(clientId: string, depuis: string): Promise<EntreeRepas[]>;
  ajouterRepas(entrees: EntreeRepas[]): Promise<void>;
  supprimerRepas(id: string): Promise<void>;
  analyserPhoto(imageBase64: string, typeMime: string): Promise<EstimationPhoto>;
}

const URL_OFF = 'https://world.openfoodfacts.org/api/v2/product/';
const CHAMPS_OFF = 'code,product_name,product_name_fr,brands,serving_quantity,serving_size,allergens_tags,ingredients_analysis_tags,nutriments';

async function chercherSurOff(code: string): Promise<Omit<Aliment, 'id'> | null> {
  try {
    const reponse = await fetch(`${URL_OFF}${encodeURIComponent(code)}.json?fields=${CHAMPS_OFF}`);
    if (reponse.status === 404) return null;
    if (!reponse.ok) throw new Error();
    return lireProduitOff(code, await reponse.json()) ?? null;
  } catch {
    throw new Error('Open Food Facts ne répond pas. Vérifie ta connexion, ou saisis l’aliment à la main.');
  }
}

// ——— Démo ———

function stocke<T>(cle: string, initiale: T[]) {
  const nom = `coachos.demo.${cle}`;
  return {
    async lire(): Promise<T[]> {
      try {
        const brut = await AsyncStorage.getItem(nom);
        if (brut) return JSON.parse(brut) as T[];
      } catch {
        // Stockage indisponible : on repart des données fictives.
      }
      return initiale;
    },
    sauver: (liste: T[]) => AsyncStorage.setItem(nom, JSON.stringify(liste)),
  };
}

const profilsDemo = stocke<ProfilNutrition>('profils-nutrition', PROFILS_DEMO);
const alimentsDemo = stocke<Aliment>('aliments', []);
const recettesDemo = stocke<Recette>('recettes', RECETTES_DEMO);
const repasDemo = stocke<EntreeRepas>('repas', REPAS_DEMO);

const remplacer = async <T>(s: ReturnType<typeof stocke<T>>, x: T, meme: (a: T) => boolean) =>
  s.sauver([...(await s.lire()).filter((y) => !meme(y)), x]);

const depotDemo: DepotAlimentation = {
  async profil(clientId) {
    return (await profilsDemo.lire()).find((p) => p.clientId === clientId) ?? null;
  },
  enregistrerProfil: (p) => remplacer(profilsDemo, { ...p, majLe: new Date().toISOString() }, (x) => x.clientId === p.clientId),
  async aliments() {
    return [...(alimentsBase as Aliment[]), ...(await alimentsDemo.lire())];
  },
  async alimentParCode(code) {
    const connu = (await alimentsDemo.lire()).find((a) => a.codeBarres === code);
    if (connu) return connu;
    const trouve = await chercherSurOff(code);
    if (!trouve) return null;
    const aliment = { ...trouve, id: nouvelId() };
    await alimentsDemo.sauver([...(await alimentsDemo.lire()), aliment]);
    return aliment;
  },
  async ajouterAliment(a, auteur) {
    const aliment: Aliment = { ...a, id: nouvelId(), ...('clientId' in auteur ? { source: 'client', clientId: auteur.clientId } : { source: 'coach' }) };
    await alimentsDemo.sauver([...(await alimentsDemo.lire()), aliment]);
    return aliment;
  },
  async banqueRecettes() {
    return (await recettesDemo.lire()).filter((r) => !r.clientId && !r.archive);
  },
  async recettesPerso(clientId) {
    return (await recettesDemo.lire()).filter((r) => r.clientId === clientId && !r.archive);
  },
  enregistrerRecette: (r) => remplacer(recettesDemo, r, (x) => x.id === r.id),
  async repas(clientId, depuis) {
    return (await repasDemo.lire()).filter((e) => e.clientId === clientId && e.date >= depuis);
  },
  async ajouterRepas(entrees) {
    await repasDemo.sauver([...(await repasDemo.lire()), ...entrees]);
  },
  async supprimerRepas(id) {
    await repasDemo.sauver((await repasDemo.lire()).filter((e) => e.id !== id));
  },
  async analyserPhoto() {
    throw new Error('L’analyse des photos fonctionne avec un compte Coach OS, pas en démo.');
  },
};

// ——— Supabase ———

type AlimentBase = {
  id: string;
  client_id: string | null;
  source: Aliment['source'];
  nom: string;
  marque: string | null;
  code_barres: string | null;
  categorie: string | null;
  kcal: number | string;
  proteines: number | string;
  glucides: number | string;
  lipides: number | string;
  fibres: number | string | null;
  portion_g: number | string | null;
  portion_libelle: string | null;
  contient: Contient[];
};

const n = (v: number | string | null) => (v === null || v === undefined ? undefined : Number(v));
const ou = <T>(v: T | null) => (v === null ? undefined : v);

const versAliment = (a: AlimentBase): Aliment => ({
  id: a.id,
  nom: a.nom,
  marque: ou(a.marque),
  codeBarres: ou(a.code_barres),
  categorie: ou(a.categorie),
  kcal: Number(a.kcal),
  proteines: Number(a.proteines),
  glucides: Number(a.glucides),
  lipides: Number(a.lipides),
  fibres: n(a.fibres),
  portionG: n(a.portion_g),
  portionLibelle: ou(a.portion_libelle),
  contient: a.contient ?? [],
  source: a.source,
  clientId: ou(a.client_id),
});

const versLigneAliment = (a: Omit<Aliment, 'id'>) => ({
  nom: a.nom.trim(),
  marque: a.marque ?? null,
  code_barres: a.codeBarres ?? null,
  categorie: a.categorie ?? null,
  kcal: a.kcal,
  proteines: a.proteines,
  glucides: a.glucides,
  lipides: a.lipides,
  fibres: a.fibres ?? null,
  portion_g: a.portionG ?? null,
  portion_libelle: a.portionLibelle ?? null,
  contient: a.contient,
  source: a.source,
});

type RecetteBase = {
  id: string;
  client_id: string | null;
  titre: string;
  description: string | null;
  portions: number;
  temps_min: number | null;
  etapes: string | null;
  ingredients: Ingredient[];
  statut: Recette['statut'];
  regimes_confirmes: Regime[];
  archive: boolean;
};

const versRecette = (r: RecetteBase): Recette => ({
  id: r.id,
  clientId: ou(r.client_id),
  titre: r.titre,
  description: ou(r.description),
  portions: r.portions,
  tempsMin: ou(r.temps_min),
  etapes: ou(r.etapes),
  ingredients: r.ingredients ?? [],
  statut: r.statut,
  regimesConfirmes: r.regimes_confirmes ?? [],
  archive: r.archive,
});

type RepasBase = {
  id: string;
  client_id: string;
  date: string;
  moment: EntreeRepas['moment'];
  libelle: string;
  quantite_g: number | string | null;
  portions: number | string | null;
  kcal: number | string;
  proteines: number | string;
  glucides: number | string;
  lipides: number | string;
  aliment_id: string | null;
  recette_id: string | null;
  source: EntreeRepas['source'];
};

function creerDepotSupabase(db: SupabaseClient): DepotAlimentation {
  const verifier = <T>({ data, error }: { data: T; error: { message: string } | null }) => {
    if (error) throw new Error(error.message);
    return data;
  };
  let coachDuClient: Promise<string | null> | undefined;
  const monCoach = () =>
    (coachDuClient ??= Promise.resolve(db.rpc('coach_de_mon_client')).then(({ data }) => (data as string | null) ?? null));

  return {
    async profil(clientId) {
      const p = verifier(await db.from('profils_nutrition').select('*').eq('client_id', clientId).maybeSingle()) as Record<string, never> | null;
      if (!p) return null;
      return {
        clientId,
        sexe: ou(p.sexe),
        naissance: ou(p.naissance),
        tailleCm: n(p.taille_cm),
        poidsKg: n(p.poids_kg),
        activite: ou(p.activite),
        objectif: ou(p.objectif),
        regimes: p.regimes ?? [],
        exclusions: ou(p.exclusions),
        majLe: p.updated_at,
      };
    },

    async enregistrerProfil(p) {
      verifier(
        await db.from('profils_nutrition').upsert({
          client_id: p.clientId,
          sexe: p.sexe ?? null,
          naissance: p.naissance ?? null,
          taille_cm: p.tailleCm ?? null,
          poids_kg: p.poidsKg ?? null,
          activite: p.activite ?? null,
          objectif: p.objectif ?? null,
          regimes: p.regimes,
          exclusions: p.exclusions ?? null,
          updated_at: new Date().toISOString(),
        }),
      );
    },

    async aliments() {
      const tous: AlimentBase[] = [];
      for (let debut = 0; ; debut += 1000) {
        const page = verifier(await db.from('aliments').select('*').eq('archive', false).order('nom').range(debut, debut + 999)) as AlimentBase[];
        tous.push(...page);
        if (page.length < 1000) break;
      }
      return tous.map(versAliment);
    },

    async alimentParCode(code, coachId) {
      const lire = async () =>
        (verifier(await db.from('aliments').select('*').eq('code_barres', code).limit(1)) as AlimentBase[]).map(versAliment)[0] ?? null;
      const connu = await lire();
      if (connu) return connu;
      const trouve = await chercherSurOff(code);
      if (!trouve) return null;
      const coach = coachId ?? (await monCoach());
      if (!coach) return { ...trouve, id: `off-${code}` };
      const { data, error } = await db
        .from('aliments')
        .insert({ ...versLigneAliment(trouve), coach_id: coach, client_id: null })
        .select('*')
        .single();
      // Un autre client vient de l'ajouter : on relit.
      if (error) return (await lire()) ?? { ...trouve, id: `off-${code}` };
      return versAliment(data as AlimentBase);
    },

    async ajouterAliment(a, auteur) {
      const ligne: Record<string, unknown> =
        'clientId' in auteur
          ? { ...versLigneAliment({ ...a, source: 'client' }), coach_id: await monCoach(), client_id: auteur.clientId }
          : { ...versLigneAliment({ ...a, source: 'coach' }), coach_id: auteur.coachId, client_id: null };
      return versAliment(verifier(await db.from('aliments').insert(ligne).select('*').single()) as AlimentBase);
    },

    async banqueRecettes() {
      const lignes = verifier(await db.from('recettes').select('*').is('client_id', null).eq('archive', false).order('titre')) as RecetteBase[];
      return lignes.map(versRecette);
    },

    async recettesPerso(clientId) {
      const lignes = verifier(await db.from('recettes').select('*').eq('client_id', clientId).eq('archive', false).order('titre')) as RecetteBase[];
      return lignes.map(versRecette);
    },

    async enregistrerRecette(r, coachId) {
      verifier(
        await db.from('recettes').upsert({
          id: r.id,
          coach_id: coachId ?? (await monCoach()),
          client_id: r.clientId ?? null,
          titre: r.titre.trim(),
          description: r.description ?? null,
          portions: r.portions,
          temps_min: r.tempsMin ?? null,
          etapes: r.etapes ?? null,
          ingredients: r.ingredients,
          statut: r.clientId ? 'brouillon' : r.statut,
          regimes_confirmes: r.regimesConfirmes,
          archive: r.archive ?? false,
          updated_at: new Date().toISOString(),
        }),
      );
    },

    async repas(clientId, depuis) {
      const lignes = verifier(
        await db.from('repas').select('*').eq('client_id', clientId).gte('date', depuis).order('created_at'),
      ) as RepasBase[];
      return lignes.map((e) => ({
        id: e.id,
        clientId: e.client_id,
        date: e.date,
        moment: e.moment,
        libelle: e.libelle,
        quantiteG: n(e.quantite_g),
        portions: n(e.portions),
        kcal: Number(e.kcal),
        proteines: Number(e.proteines),
        glucides: Number(e.glucides),
        lipides: Number(e.lipides),
        alimentId: ou(e.aliment_id),
        recetteId: ou(e.recette_id),
        source: e.source,
      }));
    },

    async ajouterRepas(entrees) {
      verifier(
        await db.from('repas').insert(
          entrees.map((e) => ({
            id: e.id,
            client_id: e.clientId,
            date: e.date,
            moment: e.moment,
            libelle: e.libelle.slice(0, 300),
            quantite_g: e.quantiteG ?? null,
            portions: e.portions ?? null,
            kcal: e.kcal,
            proteines: e.proteines,
            glucides: e.glucides,
            lipides: e.lipides,
            // Un produit Open Food Facts pas encore dans la base n'a pas d'identifiant.
            aliment_id: e.alimentId && !e.alimentId.startsWith('off-') ? e.alimentId : null,
            recette_id: e.recetteId ?? null,
            source: e.source,
          })),
        ),
      );
    },

    async supprimerRepas(id) {
      verifier(await db.from('repas').delete().eq('id', id));
    },

    async analyserPhoto(imageBase64, typeMime) {
      const { data, error } = await db.functions.invoke<EstimationPhoto & { erreur?: string }>('analyser-repas', {
        body: { image: imageBase64, type: typeMime },
      });
      if (error || !data || data.erreur) {
        const corps = await (error as { context?: Response } | null)?.context?.json?.().catch(() => null);
        throw new Error(data?.erreur ?? corps?.erreur ?? 'L’analyse de la photo n’a pas abouti. Ajoute tes aliments à la main.');
      }
      return data;
    },
  };
}

export const alimentation: DepotAlimentation = supabase ? creerDepotSupabase(supabase) : depotDemo;
