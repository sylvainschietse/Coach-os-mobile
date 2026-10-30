// Plan alimentaire de la semaine : le coach choisit les recettes de chaque jour, le client le consulte.
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { alimentation } from '@/data/alimentation';
import { nutrition } from '@/data/nutrition';
import { plansRepas } from '@/data/plan-repas';
import { MOMENTS, rechercherRecettes, totalRecette } from '@/domain/alimentation';
import { jourLocal } from '@/domain/crm';
import { macros } from '@/domain/nutrition/calcul';
import {
  changerPortions,
  dateDuJour,
  decalerSemaine,
  ecartJour,
  JOURS,
  lundiDe,
  nbRepas,
  planVide,
  repasDepuisRecette,
  totalJour,
  type PlanRepas,
} from '@/domain/plan-repas';
import type { Macros, MomentRepas, Recette } from '@/domain/types';
import { nouvelId } from '@/lib/identifiant';
import { useCharger } from '@/lib/useCharger';

import { BoutonContour } from '../coque';
import { Bouton, Carte, ChampTexte, Chargement, Erreur, Puce, Puces, Texte } from '../composants';
import { couleurs, espace, polices } from '../theme';
import { LigneMacros } from './commun';

const PORTIONS = [0.25, 0.5, 0.75, 1, 1.5, 2, 2.5, 3, 4];
const ordreMoment = (m: MomentRepas) => MOMENTS.findIndex((x) => x.cle === m);
const libelleMoment = (m: MomentRepas) => MOMENTS.find((x) => x.cle === m)!.libelle;
const portionsLisibles = (p: number) => `${String(p).replace('.', ',')} portion${p > 1 ? 's' : ''}`;
const dateLongue = (jour: string) =>
  new Date(`${jour}T12:00:00Z`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', timeZone: 'UTC' });
const horodatage = (iso: string) =>
  new Date(iso).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' });

// Cible du jour : objectifs du coach ou estimation du profil alimentaire (lot 5, NutritionProfile d'origine).
async function chargerContexte(clientId: string, coach: boolean) {
  const [profil, banque, perso] = await Promise.all([
    nutrition.profil(clientId),
    coach ? alimentation.banqueRecettes() : Promise.resolve([]),
    coach ? alimentation.recettesPerso(clientId) : Promise.resolve([]),
  ]);
  const cible = profil.objectifCoach || profil.calcul.cible;
  const g = cible ? macros(cible) : null;
  const objectifs =
    cible && g ? { source: profil.objectifCoach ? ('coach' as const) : ('calcul' as const), kcal: cible.calories, proteines: g.proteines, glucides: g.glucides, lipides: g.lipides } : undefined;
  return { objectifs, recettes: [...banque, ...perso] };
}

/** `modifiable` : le coach compose et enregistre ; sinon lecture seule (client). */
export function PlanSemaine({ clientId, modifiable }: { clientId: string; modifiable: boolean }) {
  const [semaine, setSemaine] = useState(() => lundiDe(jourLocal(new Date())));
  const contexte = useCharger(() => chargerContexte(clientId, modifiable), `plan-ctx-${clientId}`);
  const charge = useCharger(async () => ({ semaine, plan: await plansRepas.plan(clientId, semaine) }), `plan-${clientId}-${semaine}`);
  // Tant que la semaine affichée n'est pas celle relue, on attend : pas de plan vide affiché par erreur.
  const lu = charge.donnee?.semaine === semaine ? charge.donnee : undefined;
  // Une édition ne vaut que pour le plan relu dont elle part : changer de semaine ou relire l'écarte.
  const [edition, setEdition] = useState<{ source: typeof lu; plan: PlanRepas; enregistre?: boolean }>();
  const [envoi, setEnvoi] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; texte: string }>();
  const [ajoutJour, setAjoutJour] = useState<number>();

  const base = lu ? (lu.plan ?? planVide(clientId, semaine)) : undefined;
  const enCours = edition && edition.source === lu ? edition : undefined;
  const brouillon = enCours?.plan ?? base;
  const modifie = !!enCours && !enCours.enregistre;

  const changer = (f: (p: PlanRepas) => PlanRepas) => {
    if (!brouillon) return;
    setEdition({ source: lu, plan: f(brouillon) });
    setMessage(undefined);
  };
  const changerJour = (i: number, f: (j: PlanRepas['jours'][number]) => PlanRepas['jours'][number]) =>
    changer((p) => ({ ...p, jours: p.jours.map((j, k) => (k === i ? f(j) : j)) }));

  async function enregistrer() {
    if (!brouillon) return;
    setEnvoi(true);
    setMessage(undefined);
    try {
      const enregistre = await plansRepas.enregistrer(brouillon);
      setEdition({ source: lu, plan: enregistre, enregistre: true });
      // On relit le plan enregistré : ce qui s'affiche ensuite vient de la base, pas du brouillon.
      charge.recharger();
      setMessage({ ok: true, texte: `Plan enregistré le ${horodatage(enregistre.version!)}.` });
    } catch (e) {
      // Le brouillon est conservé : rien n'est perdu après une erreur.
      setMessage({ ok: false, texte: e instanceof Error ? e.message : 'Enregistrement impossible.' });
    } finally {
      setEnvoi(false);
    }
  }

  const naviguer = (n: number) => {
    setAjoutJour(undefined);
    setMessage(undefined);
    setSemaine((s) => decalerSemaine(s, n));
  };
  const objectifs = contexte.donnee?.objectifs;

  return (
    <View style={{ gap: espace(4) }}>
      <View style={{ gap: espace(2) }}>
        <Text style={{ fontFamily: polices.texteGras, fontSize: 16, color: couleurs.texte }}>Semaine du {dateLongue(semaine)}</Text>
        <View style={{ flexDirection: 'row', gap: espace(2) }}>
          <BoutonContour libelle="← Semaine précédente" onPress={() => naviguer(-1)} desactive={modifie} />
          <BoutonContour libelle="Suivante →" onPress={() => naviguer(1)} desactive={modifie} />
        </View>
      </View>
      {modifie && (
        <Texte style={{ fontSize: 13, color: couleurs.orange }}>Modifications non enregistrées : enregistrez ou annulez avant de changer de semaine.</Texte>
      )}
      {objectifs && (
        <Texte doux style={{ fontSize: 13 }}>
          Cible du jour ({objectifs.source === 'coach' ? 'fixée par le coach' : 'calculée depuis le profil'}) : {Math.round(objectifs.kcal)} kcal · P{' '}
          {Math.round(objectifs.proteines)} g · G {Math.round(objectifs.glucides)} g · L {Math.round(objectifs.lipides)} g
        </Texte>
      )}
      {charge.erreur && (
        <Carte style={{ borderColor: couleurs.rouge }}>
          <Texte>{charge.erreur}</Texte>
          <BoutonContour libelle="Réessayer" onPress={charge.recharger} />
        </Carte>
      )}
      {!brouillon && !charge.erreur && <Chargement />}
      {brouillon && !modifiable && !lu?.plan && (
        <Texte doux>Votre coach n’a pas encore préparé de plan pour cette semaine.</Texte>
      )}
      {brouillon &&
        (modifiable || lu?.plan) &&
        brouillon.jours.map((jour, i) => {
          const total = totalJour(jour);
          const ecart = ecartJour(total, objectifs);
          return (
            <Carte key={i}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: espace(2) }}>
                <Text style={{ fontFamily: polices.titre, fontSize: 22, letterSpacing: 0.8, color: couleurs.texte }}>{JOURS[i]}</Text>
                <Texte doux style={{ fontSize: 13 }}>{dateLongue(dateDuJour(semaine, i))}</Texte>
              </View>
              {!jour.length && <Texte doux style={{ fontSize: 14 }}>Aucun repas prévu.</Texte>}
              {[...jour]
                .sort((a, b) => ordreMoment(a.moment) - ordreMoment(b.moment))
                .map((r) => (
                  <View key={r.id} style={{ borderTopWidth: 1, borderTopColor: couleurs.bordure, paddingTop: espace(2), gap: espace(1) }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: espace(2) }}>
                      <View style={{ flexShrink: 1 }}>
                        <Text style={{ fontSize: 11, fontFamily: polices.texteGras, letterSpacing: 1, textTransform: 'uppercase', color: couleurs.rouge }}>
                          {libelleMoment(r.moment)}
                        </Text>
                        <Texte style={{ fontSize: 15 }}>{r.titre}</Texte>
                      </View>
                      {modifiable && (
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={`Retirer ${r.titre}`}
                          onPress={() => changerJour(i, (j) => j.filter((x) => x.id !== r.id))}
                          style={{ padding: 6 }}
                        >
                          <Text style={{ color: couleurs.texteDoux, fontSize: 18 }}>×</Text>
                        </Pressable>
                      )}
                    </View>
                    {modifiable ? (
                      <Puces>
                        {PORTIONS.map((p) => (
                          <Puce
                            key={p}
                            libelle={String(p).replace('.', ',')}
                            actif={r.portions === p}
                            onPress={() => changerJour(i, (j) => j.map((x) => (x.id === r.id ? changerPortions(x, p) : x)))}
                          />
                        ))}
                      </Puces>
                    ) : (
                      <Texte doux style={{ fontSize: 13 }}>{portionsLisibles(r.portions)}</Texte>
                    )}
                    <LigneMacros m={r.macros} taille={13} />
                  </View>
                ))}
              {!!jour.length && (
                <View style={{ borderTopWidth: 1, borderTopColor: couleurs.bordure, paddingTop: espace(2) }}>
                  <Texte style={{ fontSize: 14, fontFamily: polices.texteGras }}>Total du jour</Texte>
                  <LigneMacros m={total} taille={13} />
                  {ecart && (
                    <Texte doux style={{ fontSize: 13 }}>
                      {ecart.kcal === 0 ? 'Pile sur la cible.' : `${ecart.kcal > 0 ? '+' : ''}${ecart.kcal} kcal par rapport à la cible (${ecart.pourcent > 0 ? '+' : ''}${ecart.pourcent} %).`}
                    </Texte>
                  )}
                </View>
              )}
              {modifiable &&
                (ajoutJour === i ? (
                  <ChoixRecettePlan
                    recettes={contexte.donnee?.recettes}
                    erreur={contexte.erreur}
                    onAnnuler={() => setAjoutJour(undefined)}
                    onChoisir={(recette, moment, portions, varianteId) => {
                      changerJour(i, (j) => [...j, repasDepuisRecette(recette, { id: nouvelId(), moment, portions, varianteId })]);
                      setAjoutJour(undefined);
                    }}
                  />
                ) : (
                  <BoutonContour libelle="+ Ajouter un repas" onPress={() => setAjoutJour(i)} />
                ))}
            </Carte>
          );
        })}
      {modifiable && brouillon && (
        <View style={{ gap: espace(2) }}>
          {message && <Texte style={{ color: message.ok ? couleurs.vert : couleurs.rouge, fontSize: 14 }}>{message.texte}</Texte>}
          {!message && brouillon.version && !modifie && (
            <Texte doux style={{ fontSize: 13 }}>
              Enregistré le {horodatage(brouillon.version)} · {nbRepas(brouillon)} repas.
            </Texte>
          )}
          <Bouton libelle="Enregistrer le plan" onPress={enregistrer} chargement={envoi} desactive={!modifie} />
          {modifie && (
            <Bouton
              variante="discret"
              libelle="Annuler les modifications"
              onPress={() => {
                setEdition(undefined);
                setMessage(undefined);
              }}
            />
          )}
        </View>
      )}
    </View>
  );
}

function ChoixRecettePlan({
  recettes,
  erreur,
  onChoisir,
  onAnnuler,
}: {
  recettes?: Recette[];
  erreur: string | null;
  onChoisir: (r: Recette, moment: MomentRepas, portions: number, varianteId?: string) => void;
  onAnnuler: () => void;
}) {
  const [moment, setMoment] = useState<MomentRepas>('dejeuner');
  const [recherche, setRecherche] = useState('');
  const [choisie, setChoisie] = useState<Recette>();
  const [variante, setVariante] = useState<string>();
  const [portions, setPortions] = useState(1);

  if (erreur) return <Erreur message={erreur} />;
  if (!recettes) return <Chargement />;
  const trouvees = rechercherRecettes(recettes, recherche);
  const liste = recettes.filter((r) => !r.archive && trouvees.has(r.id)).slice(0, 12);
  const macros = (r: Recette): Macros => totalRecette(r).parPortion;

  return (
    <View style={{ gap: espace(3), borderWidth: 1, borderColor: couleurs.bordure, borderRadius: 12, padding: espace(3), backgroundColor: couleurs.fond }}>
      <Puces>
        {MOMENTS.map((m) => (
          <Puce key={m.cle} libelle={m.libelle} actif={moment === m.cle} onPress={() => setMoment(m.cle)} />
        ))}
      </Puces>
      {!choisie ? (
        <>
          <ChampTexte libelle="Chercher une recette" valeur={recherche} onChange={setRecherche} placeholder="poulet, overnight, salade…" />
          {liste.map((r) => (
            <Pressable key={r.id} accessibilityRole="button" onPress={() => setChoisie(r)} style={{ paddingVertical: espace(1.5), borderBottomWidth: 1, borderBottomColor: couleurs.bordure }}>
              <Texte style={{ fontSize: 15 }}>
                {r.titre}
                {r.clientId ? ' · recette du client' : r.statut === 'brouillon' ? ' · brouillon (invisible du client)' : ''}
              </Texte>
              <LigneMacros m={macros(r)} taille={12} />
            </Pressable>
          ))}
          {!liste.length && <Texte doux style={{ fontSize: 14 }}>Aucune recette ne correspond.</Texte>}
        </>
      ) : (
        <>
          <Texte style={{ fontFamily: polices.texteGras }}>{choisie.titre}</Texte>
          {!!choisie.variantes?.length && (
            <Puces>
              <Puce libelle="Recette d’origine" actif={!variante} onPress={() => setVariante(undefined)} />
              {choisie.variantes.map((v) => (
                <Puce key={v.id} libelle={v.libelle} actif={variante === v.id} onPress={() => setVariante(v.id)} />
              ))}
            </Puces>
          )}
          <Texte doux style={{ fontSize: 13 }}>Portions</Texte>
          <Puces>
            {PORTIONS.map((p) => (
              <Puce key={p} libelle={String(p).replace('.', ',')} actif={portions === p} onPress={() => setPortions(p)} />
            ))}
          </Puces>
          <Bouton libelle={`Ajouter au ${libelleMoment(moment).toLowerCase()}`} onPress={() => onChoisir(choisie, moment, portions, variante)} />
          <BoutonContour libelle="← Autre recette" onPress={() => setChoisie(undefined)} />
        </>
      )}
      <BoutonContour libelle="Fermer" onPress={onAnnuler} />
    </View>
  );
}
