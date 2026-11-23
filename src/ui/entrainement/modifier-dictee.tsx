// Modifier une séance en la dictant : « remplace le développé couché par des pompes, son épaule le gêne »,
// « ajoute un bloc de gainage à la fin »… L'assistant reçoit la séance actuelle et renvoie la séance modifiée.
// Le coach voit ce qui change avant d'appliquer ; rien n'est enregistré avant.
import { useRef, useState } from 'react';
import { Text, View } from 'react-native';

import { proposerSeance } from '@/data/redaction';
import { blocsProposes, type PropositionSeance } from '@/domain/assistant-seance';
import { changementsSeance, demandeModification, fusionnerBlocs } from '@/domain/modifier-seance';
import type { Bloc } from '@/domain/types';
import { nouvelId } from '@/lib/identifiant';

import { Modale, Saisie } from '../crm/dossier';
import { couleurs, polices } from '../theme';
import { Action, Ligne, ts } from './commun';
import { ApercuProposition } from './creation';

export function ModifierEnDictant({
  titre,
  blocs: actuels,
  onFermer,
  onAppliquer,
}: {
  /** Titre de la séance : il guide l'assistant (« Pecs », « Jambes »…). */
  titre: string;
  blocs: Bloc[];
  onFermer: () => void;
  onAppliquer: (blocs: Bloc[]) => Promise<void>;
}) {
  const vide = !actuels.some((b) => b.lignes.length);
  const [demande, setDemande] = useState('');
  const [proposition, setProposition] = useState<{ p: PropositionSeance; blocs: Bloc[] }>();
  const [occupe, setOccupe] = useState<'proposer' | 'appliquer' | null>(null);
  const [erreur, setErreur] = useState('');
  const verrou = useRef(false);

  const proposer = async () => {
    if (verrou.current || demande.trim().length < 5) return;
    verrou.current = true;
    setOccupe('proposer');
    setErreur('');
    setProposition(undefined);
    try {
      const p = await proposerSeance(demandeModification(titre, actuels, demande));
      const proposes = blocsProposes(p, nouvelId);
      if (!proposes.length) throw new Error('L’assistant n’a proposé aucun exercice de ta bibliothèque. Reformule ta demande.');
      setProposition({ p, blocs: vide ? proposes : fusionnerBlocs(actuels, proposes) });
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Proposition impossible');
    } finally {
      verrou.current = false;
      setOccupe(null);
    }
  };

  const appliquer = async () => {
    if (verrou.current || !proposition) return;
    verrou.current = true;
    setOccupe('appliquer');
    setErreur('');
    try {
      await onAppliquer(proposition.blocs);
      onFermer();
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Enregistrement impossible');
    } finally {
      verrou.current = false;
      setOccupe(null);
    }
  };

  const changements = proposition && !vide ? changementsSeance(actuels, proposition.blocs) : undefined;

  return (
    <Modale
      titre="Modifier en dictant"
      onFermer={() => !occupe && onFermer()}
      pied={
        <Ligne style={{ justifyContent: 'flex-end' }}>
          <Action libelle="Annuler" variante="contour" desactive={!!occupe} onPress={onFermer} />
          {proposition ? (
            <Action libelle={vide ? 'Utiliser ces blocs' : 'Appliquer les changements'} chargement={occupe === 'appliquer'} desactive={!!occupe} onPress={appliquer} />
          ) : (
            <Action libelle={occupe === 'proposer' ? 'Proposition en cours…' : 'Proposer'} desactive={!!occupe || demande.trim().length < 5} onPress={proposer} />
          )}
        </Ligne>
      }
    >
      <Text style={ts.doux}>
        {vide
          ? `Dis ce que tu veux dans « ${titre} » : l’assistant propose des blocs avec des exercices de ta bibliothèque.`
          : `Dis ce que tu veux changer dans « ${titre} » : remplacer un exercice, changer les séries, ajouter un bloc… Le reste de la séance ne bouge pas.`}{' '}
        Tu vois le résultat avant qu’il soit enregistré.
      </Text>
      <Saisie
        libelle={vide ? 'Ce que tu veux dans la séance' : 'Ce que tu veux changer'}
        long
        dictee
        valeur={demande}
        aide={
          vide
            ? 'Ex. : pecs 45 min, développé couché et pompes, 4 séries de 10, finir par du gainage.'
            : 'Ex. : remplace le développé couché par des pompes sur les genoux, son épaule le gêne. Passe le gainage à 3 × 40 s.'
        }
        onChange={(v) => !occupe && setDemande(v.slice(0, 1200))}
      />
      {changements && <ResumeChangements {...changements} />}
      {proposition && (
        <>
          <ApercuProposition p={proposition.p} blocs={proposition.blocs} />
          <Ligne style={{ justifyContent: 'flex-end' }}>
            <Action petit variante="fantome" libelle="Proposer à nouveau" desactive={!!occupe} onPress={proposer} />
          </Ligne>
        </>
      )}
      {erreur ? (
        <Text accessibilityRole="alert" style={ts.erreur}>
          {erreur}
        </Text>
      ) : null}
    </Modale>
  );
}

function ResumeChangements({ retires, ajoutes, modifies }: { retires: string[]; ajoutes: string[]; modifies: string[] }) {
  const lignes = [
    { libelle: 'Retiré', noms: retires, couleur: couleurs.rouge },
    { libelle: 'Ajouté', noms: ajoutes, couleur: couleurs.vert },
    { libelle: 'Modifié', noms: modifies, couleur: couleurs.texte },
  ].filter((l) => l.noms.length);
  return (
    <View accessibilityLabel="Ce qui change" style={{ gap: 4, borderRadius: 8, padding: 12, borderWidth: 1, borderColor: couleurs.bordure }}>
      <Text style={ts.titreChamp}>Ce qui change</Text>
      {lignes.length === 0 && <Text style={ts.doux}>Aucun exercice ne change : seuls les blocs ou leur ordre bougent.</Text>}
      {lignes.map((l) => (
        <Text key={l.libelle} style={{ fontSize: 14, fontFamily: polices.texte, color: couleurs.texte }}>
          <Text style={{ fontFamily: polices.texteGras, color: l.couleur }}>{l.libelle} : </Text>
          {l.noms.join(', ')}
        </Text>
      ))}
    </View>
  );
}
