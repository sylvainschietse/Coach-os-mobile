import { router, useFocusEffect } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { depot } from '@/data';
import { dupliquerSeance, formaterDate, lireDate } from '@/domain/programmes';
import type { SeanceResume } from '@/domain/types';
import { nouvelId } from '@/lib/identifiant';
import { useCharger } from '@/lib/useCharger';

import { Bouton, Carte, Chargement, ChampTexte, Erreur, Pastille, Puce, Puces, SousTitre, Texte } from '../composants';
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

/** Côté coach : les séances d'un client, et les moyens d'en créer (à la main ou depuis un programme). */
export function SeancesClientCoach({ clientId, coachId }: { clientId: string; coachId: string }) {
  const seances = useCharger(() => depot.seancesDuClient(clientId), clientId);
  const modeles = useCharger(() => depot.modeles(coachId), coachId);
  const [modele, setModele] = useState<string>();
  const [debut, setDebut] = useState('');
  const [message, setMessage] = useState<string>();
  const [erreur, setErreur] = useState<string>();
  const [enCours, setEnCours] = useState(false);
  useFocusEffect(seances.recharger);
  useFocusEffect(modeles.recharger);

  async function attribuer() {
    const choisi = modeles.donnee?.find((m) => m.id === modele);
    if (!choisi) return;
    const date = debut.trim() ? lireDate(debut) : undefined;
    if (debut.trim() && !date) {
      setErreur('Date illisible : écris-la comme 26/10.');
      return;
    }
    setErreur(undefined);
    setEnCours(true);
    try {
      await depot.attribuerModele(coachId, choisi, clientId, date);
      setMessage(`« ${choisi.titre} » attribué : ${choisi.seances.length} séance${choisi.seances.length > 1 ? 's' : ''} ajoutée${choisi.seances.length > 1 ? 's' : ''}.`);
      setModele(undefined);
      setDebut('');
      seances.recharger();
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Attribution impossible');
    } finally {
      setEnCours(false);
    }
  }

  return (
    <View style={{ gap: espace(3) }}>
      <Bouton libelle="Nouvelle séance" onPress={() => router.push({ pathname: '/coach/seance/[id]', params: { id: 'nouvelle', clientId } })} />
      {modeles.donnee && modeles.donnee.length > 0 && (
        <Carte>
          <SousTitre>Depuis un programme</SousTitre>
          <Puces>
            {modeles.donnee.map((m) => (
              <Puce key={m.id} libelle={m.titre} actif={modele === m.id} onPress={() => setModele(modele === m.id ? undefined : m.id)} />
            ))}
          </Puces>
          {modele && (
            <>
              <ChampTexte libelle="Première séance le (facultatif)" valeur={debut} onChange={setDebut} placeholder="27/10" />
              <Bouton variante="secondaire" libelle="Attribuer au client" onPress={attribuer} chargement={enCours} />
            </>
          )}
          {message && <Texte style={{ color: couleurs.vert }}>{message}</Texte>}
          {erreur && <Erreur message={erreur} />}
        </Carte>
      )}
      {seances.erreur && <Erreur message={seances.erreur} onReessayer={seances.recharger} />}
      {!seances.donnee && !seances.erreur && <Chargement />}
      {seances.donnee?.length === 0 && <Texte doux>Aucune séance pour l’instant.</Texte>}
      {seances.donnee?.map((s) => <CarteSeance key={s.id} s={s} onChange={seances.recharger} />)}
    </View>
  );
}
