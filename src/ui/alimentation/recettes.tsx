import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { depot } from '@/data';
import { alimentation } from '@/data/alimentation';
import {
  adapterAuxBesoins,
  adapterAuxRegimes,
  calculerBesoins,
  cibleDuRepas,
  convientAuRegime,
  entreeRecette,
  MOMENTS,
  momentSelonHeure,
  objectifsDuJour,
  recettesPourLeClient,
  regimesDeLaRecette,
  totalRecette,
} from '@/domain/alimentation';
import { jourLocal } from '@/domain/crm';
import { formaterNombre } from '@/domain/suivi';
import type { MomentRepas, Recette } from '@/domain/types';
import { nouvelId } from '@/lib/identifiant';
import { useCharger } from '@/lib/useCharger';

import { Bouton, Carte, Chargement, Erreur, Pastille, Puce, Puces, SousTitre, Texte } from '../composants';
import { couleurs, espace } from '../theme';
import { libelleRegime, LigneMacros } from './commun';
import { EditeurRecette } from './editeur-recette';
import { chargerProfil } from './profil';

const nouvelleRecette = (clientId?: string): Recette => ({
  id: nouvelId(),
  clientId,
  titre: '',
  portions: 1,
  ingredients: [],
  statut: 'brouillon',
  regimesConfirmes: [],
});

function CarteRecette({ r, note, onPress }: { r: Recette; note?: string; onPress: () => void }) {
  const regimes = regimesDeLaRecette(r);
  return (
    <Pressable accessibilityRole="button" onPress={onPress}>
      <Carte>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: espace(2) }}>
          <SousTitre>{r.titre}</SousTitre>
          {r.tempsMin ? <Texte doux style={{ fontSize: 13 }}>{r.tempsMin} min</Texte> : null}
        </View>
        <LigneMacros m={totalRecette(r).parPortion} />
        {regimes.length > 0 && <Texte doux style={{ fontSize: 13 }}>{regimes.map(libelleRegime).join(' · ')}</Texte>}
        {note && <Texte style={{ fontSize: 13, color: couleurs.orange }}>{note}</Texte>}
      </Carte>
    </Pressable>
  );
}

async function chargerPourClient(clientId: string) {
  const [donnees, plan, banque, perso] = await Promise.all([
    chargerProfil(clientId),
    depot.planNutrition(clientId),
    alimentation.banqueRecettes(),
    alimentation.recettesPerso(clientId),
  ]);
  const besoins = calculerBesoins(donnees.profil, jourLocal(new Date()), donnees.dernierPoids).besoins;
  return { profil: donnees.profil, objectifs: objectifsDuJour(plan, besoins), banque: banque.filter((r) => r.statut === 'approuvee'), perso };
}

type Donnees = Awaited<ReturnType<typeof chargerPourClient>>;

function DetailRecette({ recette, donnees, clientId, onFermer, onModifier }: {
  recette: Recette;
  donnees: Donnees;
  clientId: string;
  onFermer: () => void;
  onModifier?: () => void;
}) {
  const regimes = donnees.profil?.regimes ?? [];
  const aAdapter = regimes.filter((g) => !convientAuRegime(recette, g));
  const parRegime = aAdapter.length ? adapterAuxRegimes(recette, aAdapter) : undefined;
  const [moment, setMoment] = useState<MomentRepas>(momentSelonHeure(new Date()));
  const [ajuster, setAjuster] = useState(!!donnees.objectifs);
  const [ajoute, setAjoute] = useState(false);
  const [erreur, setErreur] = useState<string>();

  const base = parRegime && parRegime.impossibles.length === 0 ? parRegime.recette : recette;
  const ajustee = ajuster && donnees.objectifs ? adapterAuxBesoins(base, cibleDuRepas(donnees.objectifs, moment)) : undefined;
  const affichee = ajustee?.recette ?? base;
  const portions = ajustee ? 1 : base.portions;

  async function ajouter() {
    setErreur(undefined);
    try {
      await alimentation.ajouterRepas([
        { ...entreeRecette(affichee, 1, { id: nouvelId(), clientId, date: jourLocal(new Date()), moment }), libelle: recette.titre, recetteId: recette.id },
      ]);
      setAjoute(true);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Ajout impossible');
    }
  }

  return (
    <View style={{ gap: espace(4) }}>
      <Bouton variante="discret" libelle="← Toutes les recettes" onPress={onFermer} />
      <Carte>
        <SousTitre>{recette.titre}</SousTitre>
        {recette.description && <Texte doux style={{ fontSize: 14 }}>{recette.description}</Texte>}
        <Texte doux style={{ fontSize: 13 }}>
          {recette.tempsMin ? `${recette.tempsMin} min · ` : ''}
          {regimesDeLaRecette(recette).map(libelleRegime).join(' · ') || 'Aucun régime particulier'}
        </Texte>
      </Carte>

      {parRegime && (
        <Carte style={{ borderColor: couleurs.orange }}>
          <SousTitre>Adaptée à ton régime</SousTitre>
          {parRegime.adaptations.map((a, i) => (
            <Texte key={i} style={{ fontSize: 14 }}>
              {a.avant.nom} ({formaterNombre(a.avant.quantiteG)} g) → {a.apres.nom} ({formaterNombre(a.apres.quantiteG)} g)
            </Texte>
          ))}
          {parRegime.impossibles.length > 0 && (
            <Texte style={{ fontSize: 14, color: couleurs.rouge }}>À revoir avec ton coach : {parRegime.impossibles.join(', ')}.</Texte>
          )}
        </Carte>
      )}

      <Carte>
        {donnees.objectifs ? (
          <>
            <Puces>
              <Puce libelle="Adaptée à mes besoins" actif={ajuster} onPress={() => setAjuster(true)} />
              <Puce libelle="Recette d’origine" actif={!ajuster} onPress={() => setAjuster(false)} />
            </Puces>
            {ajuster && (
              <Puces>
                {MOMENTS.map((m) => (
                  <Puce key={m.cle} libelle={m.libelle} actif={moment === m.cle} onPress={() => setMoment(m.cle)} />
                ))}
              </Puces>
            )}
          </>
        ) : (
          <Texte doux style={{ fontSize: 13 }}>Remplis ton profil pour adapter les quantités à tes besoins.</Texte>
        )}
        <Texte style={{ fontSize: 14 }}>
          {ajustee ? `Ta portion ${MOMENTS.find((m) => m.cle === moment)!.au} :` : `Pour ${portions} portion${portions > 1 ? 's' : ''} :`}
        </Texte>
        {affichee.ingredients.map((i, n) => (
          <View key={n} style={{ flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: couleurs.bordure, paddingTop: espace(1.5) }}>
            <Texte style={{ fontSize: 15, flex: 1 }}>{i.nom}</Texte>
            <Texte style={{ fontSize: 15 }}>{formaterNombre(i.quantiteG)} g</Texte>
          </View>
        ))}
        <Texte doux style={{ fontSize: 13 }}>Une portion :</Texte>
        <LigneMacros m={totalRecette(affichee).parPortion} />
        {ajustee && donnees.objectifs && (
          <Texte doux style={{ fontSize: 12 }}>
            Cible du repas : <LigneMacros m={cibleDuRepas(donnees.objectifs, moment)} taille={12} />
          </Texte>
        )}
      </Carte>

      {recette.etapes && (
        <Carte>
          <SousTitre>Préparation</SousTitre>
          <Texte>{recette.etapes}</Texte>
        </Carte>
      )}
      {erreur && <Erreur message={erreur} />}
      {ajoute ? (
        <Texte style={{ color: couleurs.vert }}>Ajoutée à ton journal du jour.</Texte>
      ) : (
        <Bouton libelle={`Ajouter ${MOMENTS.find((m) => m.cle === moment)!.au} d’aujourd’hui`} onPress={ajouter} />
      )}
      {onModifier && <Bouton variante="discret" libelle="Modifier ma recette" onPress={onModifier} />}
    </View>
  );
}

/** Côté client : la banque du coach filtrée selon son régime, et ses propres recettes. */
export function RecettesClient({ clientId }: { clientId: string }) {
  const { donnee, erreur, recharger } = useCharger(() => chargerPourClient(clientId), `recettes-${clientId}`);
  const [ouverte, setOuverte] = useState<Recette>();
  const [edition, setEdition] = useState<Recette>();
  const [toutes, setToutes] = useState(false);

  if (erreur) return <Erreur message={erreur} />;
  if (!donnee) return <Chargement />;

  if (edition) {
    return (
      <EditeurRecette
        recette={edition}
        auteur={{ clientId }}
        onAnnuler={() => setEdition(undefined)}
        onEnregistrer={async (r) => {
          await alimentation.enregistrerRecette({ ...r, clientId, statut: 'brouillon' });
          setEdition(undefined);
          setOuverte(undefined);
          recharger();
        }}
      />
    );
  }
  if (ouverte) {
    return (
      <DetailRecette
        recette={ouverte}
        donnees={donnee}
        clientId={clientId}
        onFermer={() => setOuverte(undefined)}
        onModifier={ouverte.clientId ? () => setEdition(ouverte) : undefined}
      />
    );
  }

  const pourMoi = recettesPourLeClient(donnee.banque, donnee.profil);
  const liste = toutes ? donnee.banque.map((r) => ({ recette: r, adaptation: undefined, convient: true })) : pourMoi;
  const regimes = donnee.profil?.regimes ?? [];

  return (
    <View style={{ gap: espace(4) }}>
      <SousTitre>Mes recettes</SousTitre>
      {donnee.perso.length === 0 && <Texte doux style={{ fontSize: 14 }}>Enregistre tes plats habituels pour les ajouter en un geste.</Texte>}
      {donnee.perso.map((r) => (
        <CarteRecette key={r.id} r={r} onPress={() => setOuverte(r)} />
      ))}
      <Bouton variante="secondaire" libelle="Créer une recette" onPress={() => setEdition(nouvelleRecette(clientId))} />

      <SousTitre>Recettes de ton coach</SousTitre>
      {regimes.length > 0 && (
        <Puces>
          <Puce libelle={`Pour moi (${regimes.map(libelleRegime).join(', ')})`} actif={!toutes} onPress={() => setToutes(false)} />
          <Puce libelle="Toutes" actif={toutes} onPress={() => setToutes(true)} />
        </Puces>
      )}
      {donnee.banque.length === 0 && <Texte doux style={{ fontSize: 14 }}>Ton coach n’a pas encore publié de recettes.</Texte>}
      {donnee.banque.length > 0 && liste.length === 0 && (
        <Texte doux style={{ fontSize: 14 }}>Aucune recette ne correspond à ton régime et à tes exclusions pour l’instant.</Texte>
      )}
      {liste.map(({ recette, adaptation }) => (
        <CarteRecette
          key={recette.id}
          r={recette}
          note={adaptation ? `Adaptable : ${adaptation.adaptations.map((a) => `${a.avant.nom} → ${a.apres.nom}`).join(', ')}` : undefined}
          onPress={() => setOuverte(recette)}
        />
      ))}
    </View>
  );
}

/** Côté coach : la banque de recettes, brouillons compris. */
export function BanqueRecettes({ coachId }: { coachId: string }) {
  const { donnee, erreur, recharger } = useCharger(() => alimentation.banqueRecettes(), `banque-${coachId}`);
  const [edition, setEdition] = useState<Recette>();
  const [archiver, setArchiver] = useState<string>();

  if (edition) {
    return (
      <EditeurRecette
        recette={edition}
        auteur={{ coachId }}
        coachId={coachId}
        onAnnuler={() => setEdition(undefined)}
        onEnregistrer={async (r) => {
          await alimentation.enregistrerRecette(r, coachId);
          setEdition(undefined);
          recharger();
        }}
      />
    );
  }

  const approuvees = donnee?.filter((r) => r.statut === 'approuvee').length ?? 0;
  return (
    <View style={{ gap: espace(4) }}>
      <Texte doux style={{ fontSize: 14 }}>
        Tes clients voient les recettes approuvées, filtrées selon leur régime et adaptées à leurs besoins. {donnee ? `${approuvees} approuvée${approuvees > 1 ? 's' : ''} sur ${donnee.length}.` : ''}
      </Texte>
      <Bouton libelle="Nouvelle recette" onPress={() => setEdition(nouvelleRecette())} />
      {erreur && <Erreur message={erreur} />}
      {!donnee && !erreur && <Chargement />}
      {donnee?.map((r) => (
        <Carte key={r.id}>
          <Pressable accessibilityRole="button" onPress={() => setEdition(r)} style={{ gap: espace(1) }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: espace(2) }}>
              <SousTitre>{r.titre}</SousTitre>
              <Pastille libelle={r.statut === 'approuvee' ? 'Approuvée' : 'Brouillon'} couleur={r.statut === 'approuvee' ? couleurs.vert : couleurs.texteDoux} />
            </View>
            <LigneMacros m={totalRecette(r).parPortion} />
            <Texte doux style={{ fontSize: 13 }}>
              {r.ingredients.length} ingrédient{r.ingredients.length > 1 ? 's' : ''} · {r.portions} portion{r.portions > 1 ? 's' : ''}
              {regimesDeLaRecette(r).length ? ` · ${regimesDeLaRecette(r).map(libelleRegime).join(', ')}` : ''}
            </Texte>
          </Pressable>
          {archiver === r.id ? (
            <View style={{ flexDirection: 'row', gap: espace(4) }}>
              <Pressable
                accessibilityRole="button"
                onPress={async () => {
                  await alimentation.enregistrerRecette({ ...r, archive: true }, coachId);
                  setArchiver(undefined);
                  recharger();
                }}
              >
                <Texte style={{ fontSize: 13, color: couleurs.rouge }}>Confirmer l’archivage</Texte>
              </Pressable>
              <Pressable accessibilityRole="button" onPress={() => setArchiver(undefined)}>
                <Texte doux style={{ fontSize: 13 }}>Annuler</Texte>
              </Pressable>
            </View>
          ) : (
            <Pressable accessibilityRole="button" onPress={() => setArchiver(r.id)}>
              <Texte doux style={{ fontSize: 13 }}>Archiver</Texte>
            </Pressable>
          )}
        </Carte>
      ))}
    </View>
  );
}
