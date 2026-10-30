// Onglet Nutrition du coach : ses recettes, les clients suivis en alimentation, et pour chacun
// le plan de la semaine, les objectifs, les repas notés et le profil.
import { useFocusEffect } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { depot } from '@/data';
import { nutrition } from '@/data/nutrition';
import { plansRepas } from '@/data/plan-repas';
import type { ClientResume } from '@/domain/types';
import { useCharger } from '@/lib/useCharger';

import { BoutonContour, EnTeteRubrique, LibelleSection, SousNav, Vide, type OngletDef } from '../coque';
import { Carte, Chargement, Erreur, Pastille, SousTitre, Texte } from '../composants';
import { couleurs, espace, polices } from '../theme';
import { NutritionProfil } from '../nutrition/nutrition';
import { AnalyseAssiette } from './analyse-assiette';
import { BanqueRecettes } from './recettes';

type Rubrique = 'clients' | 'recettes' | 'photo';
const RUBRIQUES: OngletDef<Rubrique>[] = [
  { cle: 'clients', libelle: 'Clients suivis' },
  { cle: 'recettes', libelle: 'Mes recettes' },
  { cle: 'photo', libelle: 'Photo d’assiette' },
];

export interface SuiviAlimentaire {
  client: ClientResume;
  objectifsKcal?: number;
  profil: boolean;
  /** Lundi de la dernière semaine planifiée. */
  derniereSemaine?: string;
}

/** Un client a un suivi alimentaire dès que le coach a fixé ses objectifs, planifié une semaine, ou qu'il a rempli son profil. */
export async function chargerSuivis(coachId: string): Promise<SuiviAlimentaire[]> {
  const clients = await depot.clientsDuCoach(coachId);
  const [semaines, profils] = await Promise.all([plansRepas.semaines(clients.map((c) => c.id)), Promise.all(clients.map((c) => nutrition.profil(c.id)))]);
  return clients.map((client, i) => ({
    client,
    objectifsKcal: profils[i].objectifCoach?.calories,
    profil: profils[i].enregistre,
    derniereSemaine: semaines[client.id]?.[0],
  }));
}

export const aUnSuivi = (s: SuiviAlimentaire) => !!(s.objectifsKcal || s.profil || s.derniereSemaine);

const lundiLisible = (jour: string) =>
  new Date(`${jour}T12:00:00Z`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', timeZone: 'UTC' });

export function NutritionCoach({
  coachId,
  clientId,
  onClient,
}: {
  coachId: string;
  /** Client ouvert : vit dans l'adresse pour que Retour revienne à la liste. */
  clientId?: string;
  onClient: (id: string | undefined) => void;
}) {
  const [rubrique, setRubrique] = useState<Rubrique>('clients');
  const suivis = useCharger(() => chargerSuivis(coachId), `suivis-alim-${coachId}`);
  useFocusEffect(suivis.recharger);

  const ouvert = clientId ? suivis.donnee?.find((s) => s.client.id === clientId) : undefined;
  if (clientId)
    return ouvert ? (
      <FicheNutrition
        suivi={ouvert}
        coachId={coachId}
        onRetour={() => {
          onClient(undefined);
          suivis.recharger();
        }}
      />
    ) : suivis.erreur ? (
      <Erreur message={suivis.erreur} onReessayer={suivis.recharger} />
    ) : (
      <Chargement />
    );

  return (
    <View style={{ gap: espace(5) }}>
      <EnTeteRubrique kicker="Alimentation" titre="Nutrition" sousTitre="Vos recettes et les plans alimentaires de vos clients." />
      <SousNav nom="Rubriques Nutrition coach" onglets={RUBRIQUES} valeur={rubrique} onChange={setRubrique} />
      {rubrique === 'recettes' && <BanqueRecettes coachId={coachId} />}
      {rubrique === 'clients' && <ListeSuivis suivis={suivis} onOuvrir={onClient} />}
      {rubrique === 'photo' && <AnalyseAssiette />}
    </View>
  );
}

function ListeSuivis({ suivis, onOuvrir }: { suivis: ReturnType<typeof useCharger<SuiviAlimentaire[]>>; onOuvrir: (id: string) => void }) {
  if (suivis.erreur)
    return (
      <Carte style={{ borderColor: couleurs.rouge }}>
        <Texte>{suivis.erreur}</Texte>
        <BoutonContour libelle="Réessayer" onPress={suivis.recharger} />
      </Carte>
    );
  if (!suivis.donnee) return <Chargement />;
  const avec = suivis.donnee.filter(aUnSuivi);
  const sans = suivis.donnee.filter((s) => !aUnSuivi(s));
  return (
    <View style={{ gap: espace(3) }}>
      <LibelleSection>{`Avec un suivi alimentaire · ${avec.length}`}</LibelleSection>
      {!avec.length && <Vide titre="Aucun client suivi en nutrition" texte="Ouvrez un client ci-dessous pour lui fixer des objectifs ou préparer sa semaine." />}
      {avec.map((s) => (
        <Pressable key={s.client.id} accessibilityRole="button" onPress={() => onOuvrir(s.client.id)}>
          <Carte>
            <SousTitre>
              {s.client.prenom} {s.client.nom}
            </SousTitre>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: espace(2) }}>
              {s.objectifsKcal ? <Pastille libelle={`Objectifs · ${s.objectifsKcal} kcal`} couleur={couleurs.rouge} /> : null}
              {s.derniereSemaine ? <Pastille libelle={`Plan · semaine du ${lundiLisible(s.derniereSemaine)}`} couleur={couleurs.secondaire} /> : null}
              {s.profil ? <Pastille libelle="Profil renseigné" couleur={couleurs.vert} /> : null}
            </View>
          </Carte>
        </Pressable>
      ))}
      {!!sans.length && (
        <>
          <LibelleSection>{`Sans suivi alimentaire · ${sans.length}`}</LibelleSection>
          {sans.map((s) => (
            <Pressable key={s.client.id} accessibilityRole="button" onPress={() => onOuvrir(s.client.id)}>
              <Carte style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: espace(2) }}>
                <Texte>
                  {s.client.prenom} {s.client.nom}
                </Texte>
                <Text style={{ fontFamily: polices.texteMoyen, fontSize: 14, color: couleurs.rouge }}>Démarrer le suivi →</Text>
              </Carte>
            </Pressable>
          ))}
        </>
      )}
    </View>
  );
}

function FicheNutrition({ suivi, coachId, onRetour }: { suivi: SuiviAlimentaire; coachId: string; onRetour: () => void }) {
  return (
    <View style={{ gap: espace(4) }}>
      <BoutonContour libelle="← Tous les clients" onPress={onRetour} />
      <EnTeteRubrique kicker="Nutrition" titre={`${suivi.client.prenom} ${suivi.client.nom}`.trim()} />
      <NutritionDuClient clientId={suivi.client.id} coachId={coachId} />
    </View>
  );
}

/** Le dossier nutrition d'un client (aussi ouvert depuis la fiche Contact, rubrique Nutrition). */
export function NutritionDuClient({ clientId: id, coachId }: { clientId: string; coachId: string }) {
  return (
    <View style={{ gap: espace(4) }}>
      {/* ContactNutrition d'origine : profil, objectifs à ajuster, recettes, semaine, journal et recettes du client. */}
      <NutritionProfil key={id} clientId={id} coach />
    </View>
  );
}
