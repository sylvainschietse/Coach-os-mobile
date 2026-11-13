import { router, useFocusEffect } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { depot } from '@/data';
import { dupliquerSeance, formaterDate } from '@/domain/programmes';
import type { SeanceResume } from '@/domain/types';
import { nouvelId } from '@/lib/identifiant';
import { useCharger } from '@/lib/useCharger';

import { Bouton, Carte, Chargement, Erreur, Pastille, Puce, SousTitre, Texte } from '../composants';
import { ChoixProgrammeClient } from '../entrainement/choix-programme-client';
import { couleurs, espace } from '../theme';

function CarteSeance({ s, onChange }: { s: SeanceResume; onChange: () => void }) {
  const [confirmer, setConfirmer] = useState(false);
  const [erreur, setErreur] = useState<string>();

  async function agir(action: () => Promise<void>) {
    setErreur(undefined);
    try {
      await action();
      onChange();
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Action impossible');
    }
  }

  return (
    <Carte>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: espace(2) }}>
        <View style={{ flex: 1 }}>
          <SousTitre>{s.titre}</SousTitre>
        </View>
        {s.derniereRealisation ? <Pastille libelle="Faite" couleur={couleurs.vert} /> : <Pastille libelle="À faire" couleur={couleurs.rouge} />}
      </View>
      <Texte doux style={{ fontSize: 14 }}>
        {[s.datePrevue ? `Prévue le ${formaterDate(s.datePrevue)}` : 'Sans date', `${s.nbExercices} exercices`].join(' · ')}
      </Texte>
      <View style={{ flexDirection: 'row', gap: espace(2), flexWrap: 'wrap' }}>
        <Puce libelle="Modifier" onPress={() => router.push({ pathname: '/coach/seance/[id]', params: { id: s.id } })} />
        <Puce
          libelle="Dupliquer"
          onPress={() =>
            agir(async () => {
              const complete = await depot.seance(s.id);
              await depot.enregistrerSeance(dupliquerSeance(complete, complete.clientId ?? '', nouvelId, `${complete.titre} (copie)`));
            })
          }
        />
        {!confirmer && <Puce libelle="Masquer" onPress={() => setConfirmer(true)} />}
      </View>
      {confirmer && (
        <View style={{ gap: espace(2) }}>
          <Texte style={{ fontSize: 14 }}>
            La séance disparaît de l’app du client. Ce qu’il a déjà fait reste dans son historique.
          </Texte>
          <View style={{ flexDirection: 'row', gap: espace(2) }}>
            <Puce libelle="Masquer la séance" actif onPress={() => agir(() => depot.archiverSeance(s.id))} />
            <Puce libelle="Annuler" onPress={() => setConfirmer(false)} />
          </View>
        </View>
      )}
      {erreur && <Erreur message={erreur} />}
    </Carte>
  );
}

/** Côté coach : les séances d'un client, et les moyens d'en créer (à la main, ou en lui attribuant un programme). */
export function SeancesClientCoach({ clientId, coachId }: { clientId: string; coachId: string }) {
  const seances = useCharger(() => depot.seancesDuClient(clientId), clientId);
  useFocusEffect(seances.recharger);

  return (
    <View style={{ gap: espace(3) }}>
      <Bouton libelle="Nouvelle séance" onPress={() => router.push({ pathname: '/coach/seance/[id]', params: { id: 'nouvelle', clientId } })} />
      <ChoixProgrammeClient coachId={coachId} clientId={clientId} />
      {seances.erreur && <Erreur message={seances.erreur} onReessayer={seances.recharger} />}
      {!seances.donnee && !seances.erreur && <Chargement />}
      {seances.donnee?.length === 0 && <Texte doux>Aucune séance pour l’instant.</Texte>}
      {seances.donnee?.map((s) => <CarteSeance key={s.id} s={s} onChange={seances.recharger} />)}
    </View>
  );
}
