// Reprendre une séance d'un autre programme : elle est copiée dans celui-ci, l'originale ne change pas.
import { useMemo, useState } from 'react';
import { Text, View } from 'react-native';

import { entrainement, gererProgramme } from '@/data/entrainement';
import { correspondRecherche, titreClient } from '@/domain/entrainement';
import type { SeanceResume } from '@/domain/entrainement-etat';
import { useCharger } from '@/lib/useCharger';

import { Modale, Recherche } from '../crm/dossier';
import { Action, Etat, Ligne, ListeChoix, ts } from './commun';

const MAX_AFFICHEES = 40;

export function RepriseSeance({
  coachId,
  programmeId,
  onFermer,
  onReprise,
}: {
  coachId: string;
  programmeId: string;
  onFermer: () => void;
  onReprise: (seanceId: string) => void;
}) {
  const { donnee, erreur: erreurLecture } = useCharger(() => entrainement.seancesBibliotheque(coachId), `seances-bibliotheque-${coachId}`);
  const [q, setQ] = useState('');
  const [choisie, setChoisie] = useState<SeanceResume>();
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState('');

  const trouvees = useMemo(
    () => (donnee ? donnee.filter((s) => correspondRecherche(`${s.titre} ${s.programmeTitre}`, q)) : null),
    [donnee, q],
  );

  const reprendre = async () => {
    if (!choisie || occupe) return;
    setOccupe(true);
    setErreur('');
    try {
      const r = await gererProgramme(coachId, 'copySeance', { nom: choisie.titre }, { id: choisie.id, programmeId });
      onReprise(r.id);
      onFermer();
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Copie impossible');
    } finally {
      setOccupe(false);
    }
  };

  return (
    <Modale
      titre="Reprendre une séance existante"
      largeur={640}
      onFermer={() => !occupe && onFermer()}
      pied={
        <Ligne style={{ justifyContent: 'flex-end' }}>
          <Action libelle="Annuler" variante="contour" desactive={occupe} onPress={onFermer} />
          <Action libelle="Ajouter à ce programme" chargement={occupe} desactive={!choisie} onPress={reprendre} />
        </Ligne>
      }
    >
      <Text style={ts.doux}>La séance choisie est copiée dans ce programme avec ses blocs et ses exercices. L’originale reste telle quelle dans son programme.</Text>
      <View style={{ flexDirection: 'row' }}>
        <Recherche valeur={q} onChange={setQ} libelle="Rechercher une séance" placeholder="Nom de la séance ou du programme…" />
      </View>
      {erreurLecture ? (
        <Etat erreur={erreurLecture} />
      ) : (
        <ListeChoix
          elements={trouvees ? trouvees.slice(0, MAX_AFFICHEES) : null}
          cle={(s) => s.id}
          libelle={(s) => titreClient(s.titre)}
          detail={(s) => `${titreClient(s.programmeTitre)} · ${s.nbExercices} exercice${s.nbExercices > 1 ? 's' : ''}`}
          choisi={choisie?.id}
          onChoisir={setChoisie}
          vide="Aucune séance ne correspond."
          hauteur={360}
        />
      )}
      {trouvees && trouvees.length > MAX_AFFICHEES && (
        <Text style={ts.doux}>
          {MAX_AFFICHEES} premières sur {trouvees.length}. Précisez la recherche pour trouver la bonne.
        </Text>
      )}
      <Etat erreur={erreur} />
    </Modale>
  );
}
