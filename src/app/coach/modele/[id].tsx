import { Redirect, router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { depot } from '@/data';
import { useSession } from '@/data/session';
import { deplacer, erreursProgramme, lireDate, nouveauBloc } from '@/domain/programmes';
import { lireNombre } from '@/domain/suivi';
import type { Programme, SeanceModele } from '@/domain/types';
import { nouvelId } from '@/lib/identifiant';
import { useCharger } from '@/lib/useCharger';
import { Bouton, Carte, Chargement, ChampTexte, Ecran, Erreur, Puce, Puces, SousTitre, Texte, Titre } from '@/ui/composants';
import { EditeurSeance } from '@/ui/programmes/editeur-seance';
import { couleurs, espace } from '@/ui/theme';

const nouveauProgramme = (): Programme => ({ id: nouvelId(), titre: '', seances: [] });
const texteNombre = (n?: number) => (n === undefined ? '' : String(n));

function Attribuer({ programme, coachId }: { programme: Programme; coachId: string }) {
  const clients = useCharger(() => depot.clientsDuCoach(coachId), coachId);
  const [client, setClient] = useState<string>();
  const [debut, setDebut] = useState('');
  const [message, setMessage] = useState<string>();
  const [erreur, setErreur] = useState<string>();
  const [enCours, setEnCours] = useState(false);

  async function attribuer() {
    if (!client) return;
    const date = debut.trim() ? lireDate(debut) : undefined;
    if (debut.trim() && !date) return setErreur('Date illisible : écris-la comme 27/10.');
    setErreur(undefined);
    setEnCours(true);
    try {
      await depot.attribuerModele(coachId, programme, client, date);
      const prenom = clients.donnee?.find((c) => c.id === client)?.prenom;
      setMessage(`Programme attribué à ${prenom} : ${programme.seances.length} séances dans son app.`);
      setClient(undefined);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Attribution impossible');
    } finally {
      setEnCours(false);
    }
  }

  return (
    <Carte>
      <SousTitre>Attribuer à un client</SousTitre>
      <Texte doux style={{ fontSize: 14 }}>
        Le client reçoit une copie : modifier ce modèle ensuite ne change pas ses séances.
      </Texte>
      {clients.erreur && <Erreur message={clients.erreur} onReessayer={clients.recharger} />}
      <Puces>
        {clients.donnee?.map((c) => (
          <Puce key={c.id} libelle={`${c.prenom} ${c.nom}`.trim()} actif={client === c.id} onPress={() => setClient(c.id)} />
        ))}
      </Puces>
      {client && (
        <>
          <ChampTexte libelle="Première séance le (facultatif)" valeur={debut} onChange={setDebut} placeholder="27/10" />
          <Bouton variante="secondaire" libelle="Attribuer" onPress={attribuer} chargement={enCours} desactive={programme.seances.length === 0} />
        </>
      )}
      {message && <Texte style={{ color: couleurs.vert }}>{message}</Texte>}
      {erreur && <Erreur message={erreur} />}
    </Carte>
  );
}

function Editeur({ initial, coachId, nouveau }: { initial: Programme; coachId: string; nouveau: boolean }) {
  const [p, setP] = useState(initial);
  const [duree, setDuree] = useState(texteNombre(initial.dureeSemaines));
  const [parSemaine, setParSemaine] = useState(texteNombre(initial.seancesParSemaine));
  const [edition, setEdition] = useState<SeanceModele>();
  const [erreurs, setErreurs] = useState<string[]>([]);
  const [enregistre, setEnregistre] = useState(!nouveau);
  const [enCours, setEnCours] = useState(false);

  async function sauver(suivant: Programme) {
    const complet = { ...suivant, dureeSemaines: lireNombre(duree), seancesParSemaine: lireNombre(parSemaine) };
    const liste = erreursProgramme(complet);
    setErreurs(liste);
    if (liste.length) return false;
    setEnCours(true);
    try {
      await depot.enregistrerModele(coachId, complet);
      setP(complet);
      setEnregistre(true);
      return true;
    } catch (e) {
      setErreurs([e instanceof Error ? e.message : 'Enregistrement impossible']);
      return false;
    } finally {
      setEnCours(false);
    }
  }

  if (edition) {
    return (
      <View style={{ gap: espace(4) }}>
        <Bouton variante="discret" libelle="← Retour au programme" onPress={() => setEdition(undefined)} />
        <EditeurSeance
          initiale={edition}
          coachId={coachId}
          avecDate={false}
          libelleEnregistrer="Enregistrer dans le programme"
          onEnregistrer={async (s) => {
            const existe = p.seances.some((x) => x.id === s.id);
            const seances = existe ? p.seances.map((x) => (x.id === s.id ? s : x)) : [...p.seances, s];
            if (await sauver({ ...p, seances })) setEdition(undefined);
            else throw new Error('Complète d’abord le nom du programme.');
          }}
        />
      </View>
    );
  }

  const majChamp = (patch: Partial<Programme>) => {
    setEnregistre(false);
    setP({ ...p, ...patch });
  };

  return (
    <View style={{ gap: espace(4) }}>
      <ChampTexte libelle="Nom du programme" valeur={p.titre} onChange={(titre) => majChamp({ titre })} placeholder="Prise de masse · 8 semaines" />
      <ChampTexte libelle="Objectif" valeur={p.objectif ?? ''} onChange={(t) => majChamp({ objectif: t || undefined })} />
      <View style={{ flexDirection: 'row', gap: espace(3) }}>
        <View style={{ flex: 1 }}>
          <ChampTexte libelle="Durée (semaines)" type="nombre" valeur={duree} onChange={(t) => (setDuree(t), setEnregistre(false))} />
        </View>
        <View style={{ flex: 1 }}>
          <ChampTexte libelle="Séances par semaine" type="nombre" valeur={parSemaine} onChange={(t) => (setParSemaine(t), setEnregistre(false))} />
        </View>
      </View>
      <ChampTexte libelle="Niveau" valeur={p.niveau ?? ''} onChange={(t) => majChamp({ niveau: t || undefined })} placeholder="Débutant, intermédiaire…" />
      <ChampTexte libelle="Notes (pour toi)" valeur={p.notes ?? ''} onChange={(t) => majChamp({ notes: t || undefined })} multiligne />

      <SousTitre>Séances du programme</SousTitre>
      {p.seances.length === 0 && <Texte doux>Ajoute la première séance du programme.</Texte>}
      {p.seances.map((s, i) => (
        <Carte key={s.id}>
          <SousTitre>
            {i + 1}. {s.titre}
          </SousTitre>
          <Texte doux style={{ fontSize: 14 }}>
            {s.blocs.reduce((n, b) => n + b.lignes.length, 0)} exercices · {s.blocs.map((b) => b.titre).join(', ')}
          </Texte>
          <View style={{ flexDirection: 'row', gap: espace(2), flexWrap: 'wrap' }}>
            <Puce libelle="Modifier" onPress={() => setEdition(s)} />
            {i > 0 && <Puce libelle="↑" onPress={() => sauver({ ...p, seances: deplacer(p.seances, i, -1) })} />}
            {i < p.seances.length - 1 && <Puce libelle="↓" onPress={() => sauver({ ...p, seances: deplacer(p.seances, i, 1) })} />}
            <Puce libelle="Retirer" onPress={() => sauver({ ...p, seances: p.seances.filter((x) => x.id !== s.id) })} />
          </View>
        </Carte>
      ))}
      <Bouton
        variante="discret"
        libelle="+ Ajouter une séance"
        onPress={() =>
          setEdition({
            id: nouvelId(),
            titre: `Séance ${String.fromCharCode(65 + p.seances.length)}`,
            blocs: [nouveauBloc('Échauffement', nouvelId), nouveauBloc('Corps de séance', nouvelId)],
          })
        }
      />
      {erreurs.length > 0 && <Erreur message={erreurs.join('\n')} />}
      {!enregistre && <Bouton libelle="Enregistrer le programme" onPress={() => sauver(p)} chargement={enCours} />}
      {enregistre && <Attribuer programme={p} coachId={coachId} />}
      {enregistre && !nouveau && (
        <Bouton
          variante="discret"
          libelle="Archiver ce modèle"
          onPress={async () => {
            await depot.archiverModele(p.id);
            router.back();
          }}
        />
      )}
    </View>
  );
}

export default function ModeleProgramme() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { profil } = useSession();
  const nouveau = id === 'nouveau';
  const { donnee, erreur } = useCharger(() => (nouveau ? Promise.resolve(nouveauProgramme()) : depot.programme(id)), id);
  if (profil?.role !== 'coach') return <Redirect href="/" />;
  return (
    <Ecran largeurMax={760}>
      <Stack.Screen options={{ title: nouveau ? 'Nouveau programme' : 'Programme' }} />
      {!nouveau && donnee && <Titre>{donnee.titre}</Titre>}
      {erreur && <Erreur message={erreur} />}
      {!donnee && !erreur && <Chargement />}
      {donnee && <Editeur initial={donnee} coachId={profil.coachId} nouveau={nouveau} />}
    </Ecran>
  );
}
