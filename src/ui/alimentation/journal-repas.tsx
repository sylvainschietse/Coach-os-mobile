import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { depot } from '@/data';
import { alimentation } from '@/data/alimentation';
import { calculerBesoins, entreeAliment, entreeRecette, macrosPour, MOMENTS, momentSelonHeure, objectifsDuJour, totauxDuJour, arrondirMacros } from '@/domain/alimentation';
import { ajouterJours, jourLocal } from '@/domain/crm';
import { formaterDate } from '@/domain/programmes';
import { formaterNombre } from '@/domain/suivi';
import type { EntreeRepas, MomentRepas } from '@/domain/types';
import { nouvelId } from '@/lib/identifiant';
import { useCharger } from '@/lib/useCharger';

import { Bouton, Carte, Chargement, Erreur, Puce, Puces, SousTitre, Texte } from '../composants';
import { couleurs, espace } from '../theme';
import { ChoixAliment } from './choix-aliment';
import { Jauges, LigneMacros } from './commun';
import { PhotoRepas } from './photo';
import { chargerProfil } from './profil';

async function charger(clientId: string) {
  const depuis = ajouterJours(jourLocal(new Date()), -30);
  const [plan, profil, repas, banque, perso] = await Promise.all([
    depot.planNutrition(clientId),
    chargerProfil(clientId),
    alimentation.repas(clientId, depuis),
    alimentation.banqueRecettes(),
    alimentation.recettesPerso(clientId),
  ]);
  const besoins = calculerBesoins(profil.profil, jourLocal(new Date()), profil.dernierPoids).besoins;
  return { objectifs: objectifsDuJour(plan, besoins), repas, recettes: [...perso, ...banque.filter((r) => r.statut === 'approuvee')] };
}

const jourLisible = (jour: string) => {
  const aujourdhui = jourLocal(new Date());
  if (jour === aujourdhui) return 'Aujourd’hui';
  if (jour === ajouterJours(aujourdhui, -1)) return 'Hier';
  return formaterDate(jour);
};

/** Le journal des repas : le client ajoute ce qu'il mange (recherche, scan, photo, recettes), les macros se calculent. */
export function JournalRepas({ clientId, saisie, coachId }: { clientId: string; saisie: boolean; coachId?: string }) {
  const { donnee, erreur, recharger } = useCharger(() => charger(clientId), `repas-${clientId}`);
  const [jour, setJour] = useState(jourLocal(new Date()));
  const [ajout, setAjout] = useState<{ moment: MomentRepas; mode: 'aliment' | 'photo' }>();
  const [erreurAjout, setErreurAjout] = useState<string>();
  const [confirmer, setConfirmer] = useState<string>();

  if (erreur) return <Erreur message={erreur} />;
  if (!donnee) return <Chargement />;
  const { total, parMoment } = totauxDuJour(donnee.repas, jour);
  const aujourdhui = jourLocal(new Date());

  async function ajouter(entrees: EntreeRepas[]) {
    setErreurAjout(undefined);
    try {
      await alimentation.ajouterRepas(entrees);
      setAjout(undefined);
      recharger();
    } catch (e) {
      setErreurAjout(e instanceof Error ? e.message : 'Enregistrement impossible');
    }
  }

  const base = (moment: MomentRepas) => ({ id: nouvelId(), clientId, date: jour, moment });

  return (
    <View style={{ gap: espace(4) }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Jour précédent" hitSlop={10} onPress={() => setJour(ajouterJours(jour, -1))}>
          <Texte style={{ fontSize: 22 }}>‹</Texte>
        </Pressable>
        <SousTitre>{jourLisible(jour)}</SousTitre>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Jour suivant"
          hitSlop={10}
          disabled={jour >= aujourdhui}
          onPress={() => setJour(ajouterJours(jour, 1))}
        >
          <Texte style={{ fontSize: 22, opacity: jour >= aujourdhui ? 0.2 : 1 }}>›</Texte>
        </Pressable>
      </View>

      <Carte>
        {donnee.objectifs ? (
          <>
            <Jauges mange={total} objectif={donnee.objectifs} />
            <Texte doux style={{ fontSize: 12 }}>
              {donnee.objectifs.source === 'coach' ? 'Objectifs fixés par ton coach.' : 'Objectifs calculés à partir du profil.'}
            </Texte>
          </>
        ) : (
          <>
            <LigneMacros m={total} taille={15} />
            <Texte doux style={{ fontSize: 13 }}>
              {saisie ? 'Remplis ton profil (onglet Profil) pour voir tes objectifs du jour.' : 'Ni plan du coach ni profil complet : pas d’objectif à comparer.'}
            </Texte>
          </>
        )}
      </Carte>

      {erreurAjout && <Erreur message={erreurAjout} />}

      {parMoment.map((m) => (
        <Carte key={m.cle}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <SousTitre>{m.libelle}</SousTitre>
            {m.entrees.length > 0 && <Texte doux style={{ fontSize: 14 }}>{formaterNombre(Math.round(m.total.kcal))} kcal</Texte>}
          </View>
          {m.entrees.length === 0 && <Texte doux style={{ fontSize: 14 }}>Rien de noté.</Texte>}
          {m.entrees.map((e) => (
            <View key={e.id} style={{ borderTopWidth: 1, borderTopColor: couleurs.bordure, paddingTop: espace(2), gap: espace(0.5) }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: espace(2) }}>
                <Texte style={{ fontSize: 15, flex: 1 }}>
                  {e.libelle}
                  <Texte doux style={{ fontSize: 13 }}>
                    {e.quantiteG ? ` · ${formaterNombre(e.quantiteG)} g` : e.portions ? ` · ${formaterNombre(e.portions)} portion${e.portions > 1 ? 's' : ''}` : ''}
                    {e.source === 'photo' ? ' · estimé sur photo' : e.source === 'scan' ? ' · scanné' : ''}
                  </Texte>
                </Texte>
                {saisie &&
                  (confirmer === e.id ? (
                    <Pressable
                      accessibilityRole="button"
                      hitSlop={8}
                      onPress={async () => {
                        await alimentation.supprimerRepas(e.id);
                        setConfirmer(undefined);
                        recharger();
                      }}
                    >
                      <Texte style={{ fontSize: 13, color: couleurs.rouge }}>Confirmer</Texte>
                    </Pressable>
                  ) : (
                    <Pressable accessibilityRole="button" hitSlop={8} onPress={() => setConfirmer(e.id)}>
                      <Texte doux style={{ fontSize: 13 }}>Retirer</Texte>
                    </Pressable>
                  ))}
              </View>
              <LigneMacros m={e} taille={13} />
            </View>
          ))}
          {saisie && ajout?.moment !== m.cle && (
            <Puces>
              <Puce libelle="+ Aliment ou recette" onPress={() => setAjout({ moment: m.cle, mode: 'aliment' })} />
              <Puce libelle="Photo" onPress={() => setAjout({ moment: m.cle, mode: 'photo' })} />
            </Puces>
          )}
          {saisie && ajout?.moment === m.cle && ajout.mode === 'aliment' && (
            <ChoixAliment
              titre={`Ajouter ${m.au}`}
              auteur={{ clientId }}
              coachId={coachId}
              recettes={donnee.recettes}
              onFermer={() => setAjout(undefined)}
              onChoisir={(a, g, source) => ajouter([entreeAliment(a, g, { ...base(m.cle), source })])}
              onChoisirRecette={(r, p) => ajouter([entreeRecette(r, p, base(m.cle))])}
            />
          )}
          {saisie && ajout?.moment === m.cle && ajout.mode === 'photo' && (
            <PhotoRepas
              onFermer={() => setAjout(undefined)}
              onValider={(aliments) =>
                ajouter(
                  aliments.map((a) => ({
                    ...base(m.cle),
                    id: nouvelId(),
                    source: 'photo' as const,
                    libelle: a.nom,
                    quantiteG: a.quantiteG,
                    ...arrondirMacros(macrosPour(a, a.quantiteG)),
                  })),
                )
              }
            />
          )}
        </Carte>
      ))}
      {saisie && !ajout && jour === aujourdhui && (
        <Bouton
          variante="secondaire"
          libelle={`Ajouter ${MOMENTS.find((x) => x.cle === momentSelonHeure(new Date()))!.au}`}
          onPress={() => setAjout({ moment: momentSelonHeure(new Date()), mode: 'aliment' })}
        />
      )}
    </View>
  );
}
