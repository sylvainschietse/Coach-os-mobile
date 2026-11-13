// Dossier coach « Séances libres des clients » : toutes les activités ajoutées par les clients hors programme, les plus
// récentes d'abord, filtrables par client. Une séance de musculation détaillée peut devenir un modèle de la
// bibliothèque (« Mes créations ») en un geste, pour l'attribuer ensuite à n'importe quel client.
import { useMemo, useState } from 'react';
import { Text, View } from 'react-native';

import { depot } from '@/data';
import { activites } from '@/data/activites';
import { entrainement } from '@/data/entrainement';
import { seanceDepuisActivite, titreActivite, type Activite } from '@/domain/activites';
import { jourParis } from '@/domain/entrainement';
import { nouvelId } from '@/lib/identifiant';
import { messageErreur, useCharger } from '@/lib/useCharger';

import { Choix } from '../crm/dossier';
import { DetailActiviteLibre, resumeActivite } from '../suivi/activite-libre';
import { couleurs } from '../theme';
import { Action, Etat, jourCourt, Ligne, ts } from './commun';

const TOUS = '';

/** Assez d'exercices de la bibliothèque pour faire une séance. */
export const peutDevenirModele = (a: Activite) => (a.exercices ?? []).some((x) => !!x.exerciceId);

/** Crée la séance seule « Séance seule · titre » dans la bibliothèque du coach ; renvoie l'id du programme créé. */
export async function enregistrerCommeModele(coachId: string, a: Activite, prenom?: string) {
  const catalogue = await depot.catalogue();
  const programmeId = nouvelId();
  const { seance, ignores } = seanceDepuisActivite(a, catalogue, nouvelId, programmeId);
  if (!seance.blocs[0].lignes.length) throw new Error('Aucun exercice de la bibliothèque dans cette séance : impossible d’en faire un modèle.');
  const origine = `Séance libre de ${prenom ?? 'un client'} du ${jourCourt(jourParis(a.debut))}.`;
  seance.consignes = [origine, seance.consignes].filter(Boolean).join('\n\n');
  await entrainement.enregistrerProgramme(
    coachId,
    { id: programmeId, titre: `Séance seule · ${seance.titre}`, statut: 'Brouillon', version: 'coachos-single', seanceSeule: true },
    [seance],
  );
  return { programmeId, ignores };
}

function Carte({ a, client, coachId, onModele }: { a: Activite; client?: string; coachId: string; onModele: (programmeId: string) => void }) {
  const [ouvert, setOuvert] = useState(false);
  const [enCours, setEnCours] = useState(false);
  const [etat, setEtat] = useState<{ message?: string; erreur?: string }>({});

  async function enModele() {
    setEnCours(true);
    setEtat({});
    try {
      const r = await enregistrerCommeModele(coachId, a, client);
      setEtat({
        message: `Modèle « ${titreActivite(a)} » ajouté à Mes créations.${r.ignores.length ? ` Hors bibliothèque, notés dans les consignes : ${r.ignores.join(', ')}.` : ''}`,
      });
      onModele(r.programmeId);
    } catch (e) {
      setEtat({ erreur: messageErreur(e) });
    } finally {
      setEnCours(false);
    }
  }

  return (
    <View style={[ts.carte, { gap: 8 }]}>
      <View style={{ gap: 2 }}>
        <Text style={ts.kicker}>
          {client ?? 'Client'} · {jourCourt(jourParis(a.debut))}
        </Text>
        <Text style={ts.titre}>{titreActivite(a)}</Text>
        <Text style={ts.doux}>{resumeActivite(a)}</Text>
      </View>
      {ouvert && <DetailActiviteLibre a={a} />}
      <Ligne>
        <Action petit variante="contour" libelle={ouvert ? 'Masquer le détail' : 'Voir le détail'} onPress={() => setOuvert(!ouvert)} />
        {peutDevenirModele(a) && <Action petit libelle="Enregistrer comme modèle" onPress={enModele} chargement={enCours} />}
      </Ligne>
      <Etat {...etat} />
    </View>
  );
}

export function SeancesLibresClients({ coachId, onOuvrirModele }: { coachId: string; onOuvrirModele: (programmeId: string) => void }) {
  const donnees = useCharger(async () => {
    const [liste, clients] = await Promise.all([activites.libresDuCoach(coachId, 300), depot.clientsDuCoach(coachId)]);
    return { liste, noms: new Map(clients.map((c) => [c.id, [c.prenom, c.nom].filter(Boolean).join(' ')])) };
  }, `libres-coach-${coachId}`);
  const [client, setClient] = useState(TOUS);
  const [muscu, setMuscu] = useState(false);
  const [modeleCree, setModeleCree] = useState<string>();

  const noms = donnees.donnee?.noms;
  const options = useMemo(() => [...new Set((donnees.donnee?.liste ?? []).map((a) => noms?.get(a.clientId) ?? ''))].filter(Boolean).sort(), [donnees.donnee, noms]);
  const liste = (donnees.donnee?.liste ?? []).filter(
    (a) => (!client || noms?.get(a.clientId) === client) && (!muscu || (a.exercices?.length ?? 0) > 0),
  );

  return (
    <View style={{ gap: 12 }}>
      <Text style={ts.titreSection}>Séances libres des clients</Text>
      <Text style={ts.doux}>
        Ce que tes clients ont fait en plus de leur programme : cours collectifs, sports, séances de musculation à eux. Une séance détaillée peut devenir un
        modèle de ta bibliothèque.
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        <View style={{ flexGrow: 1, flexBasis: 200, minWidth: 0 }}>
          <Choix libelle="Client" sansLibelle choix={options} valeur={client || undefined} vide="Client : tous" onChange={(v) => setClient(v ?? TOUS)} />
        </View>
        <Action petit variante={muscu ? 'plein' : 'contour'} libelle="Avec exercices détaillés" onPress={() => setMuscu(!muscu)} />
      </View>
      {modeleCree && (
        <Ligne>
          <Action petit variante="contour" libelle="Ouvrir le modèle créé" onPress={() => onOuvrirModele(modeleCree)} />
        </Ligne>
      )}
      {donnees.erreur && <Text style={ts.erreur}>{donnees.erreur}</Text>}
      {!donnees.donnee && !donnees.erreur && <Text style={ts.doux}>Chargement…</Text>}
      {donnees.donnee && liste.length === 0 && (
        <Text style={[ts.doux, { color: couleurs.texteDoux }]}>
          {donnees.donnee.liste.length ? 'Aucune séance libre ne correspond aux filtres.' : 'Aucun client n’a encore ajouté d’activité libre.'}
        </Text>
      )}
      {liste.map((a) => (
        <Carte key={a.id} a={a} client={noms?.get(a.clientId)} coachId={coachId} onModele={setModeleCree} />
      ))}
    </View>
  );
}
