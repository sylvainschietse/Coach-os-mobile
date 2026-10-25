// CreationDialog.tsx d'origine (C11) : créer, modifier, dupliquer, rattacher. Une séance se crée en deux étapes :
// 1 · titre et consignes (enregistrés en brouillon), 2 · blocs et exercices dans l'éditeur intégré.
import { useRef, useState } from 'react';
import { Text, View } from 'react-native';

import { entrainement, gererProgramme, type ActionCreation } from '@/data/entrainement';
import { proposerSeance } from '@/data/redaction';
import { blocsProposes, type PropositionSeance } from '@/domain/assistant-seance';
import { LIBELLES_CYCLES, NIVEAUX, OBJECTIFS } from '@/domain/entrainement';
import type { ModeleResume } from '@/domain/entrainement-etat';
import type { Bloc } from '@/domain/types';
import { nouvelId } from '@/lib/identifiant';

import { Choix, Modale, Repliable, Saisie } from '../crm/dossier';
import { couleurs, polices } from '../theme';
import { Action, Confirmation, Ligne, ts } from './commun';
import { EditeurSeance } from './seance';

export interface DemandeCreation {
  action: ActionCreation;
  id?: string;
  programmeId?: string;
  initial?: {
    nom?: string;
    niveau?: string;
    objectif?: string;
    frequence?: number;
    duree?: number;
    materiel?: string;
    consignes?: string;
    cycle?: number;
    /** Programme d'où vient la séance à rattacher : il n'est pas proposé comme cible. */
    parentId?: string;
  };
}

const TITRES: Record<ActionCreation, string> = {
  programme: 'Créer un programme',
  seance: 'Créer une séance',
  copyProgramme: 'Dupliquer le programme',
  copySeance: 'Dupliquer la séance',
  editProgramme: 'Modifier le programme',
  editSeance: 'Modifier la séance',
  attachSeance: 'Rattacher à un programme',
};

export function CreationEntrainement({
  coachId,
  action,
  id,
  programmeId,
  initial = {},
  onFermer,
  onEnregistre,
}: DemandeCreation & { coachId: string; onFermer: () => void; onEnregistre: (r: { id: string; programmeId: string }) => void }) {
  const [f, setF] = useState({
    nom: initial.nom ?? '',
    niveau: initial.niveau ?? '',
    objectif: initial.objectif ?? '',
    frequence: initial.frequence ? String(initial.frequence) : '',
    duree: initial.duree ? String(initial.duree) : '',
    materiel: initial.materiel ?? '',
    consignes: initial.consignes ?? '',
  });
  const [cycle, setCycle] = useState(initial.cycle ?? 1);
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState('');
  const [cible, setCible] = useState(programmeId ?? '');
  const [options, setOptions] = useState<ModeleResume[] | null>(null);
  const [etape, setEtape] = useState<1 | 2>(1);
  const [cree, setCree] = useState<{ id: string; programmeId: string }>();
  const [enfantOccupe, setEnfantOccupe] = useState(false);
  const [confirmation, setConfirmation] = useState<string>();
  const depart = useRef(JSON.stringify(f));
  const verrou = useRef(false);
  const [enregistre, setEnregistre] = useState({ nom: '', consignes: '' });
  const [demande, setDemande] = useState('');
  const [proposition, setProposition] = useState<{ p: PropositionSeance; blocs: Bloc[] }>();

  const prog = action === 'programme' || action === 'editProgramme';
  const copie = action === 'copyProgramme' || action === 'copySeance';
  const etape2 = action === 'seance' && etape === 2 && !!cree;

  const terminer = () => {
    if (occupe || enfantOccupe) return;
    if (cree) onEnregistre(cree);
    onFermer();
  };
  const fermer = () => {
    if (occupe || enfantOccupe) return;
    if (!cree && JSON.stringify(f) !== depart.current) return setConfirmation('Les informations saisies ne sont pas enregistrées. Fermer sans les conserver ?');
    if (cree && etape === 1 && (f.nom !== enregistre.nom || f.consignes !== enregistre.consignes))
      return setConfirmation('Les dernières modifications du titre et des consignes ne sont pas enregistrées. Fermer en conservant le brouillon déjà enregistré ?');
    terminer();
  };

  const nombreValide = (v: string, max: number) => v.trim() === '' || (/^\d+$/.test(v.trim()) && +v <= max);
  const valide = !!f.nom.trim() && (action !== 'attachSeance' || !!cible) && nombreValide(f.frequence, 14) && nombreValide(f.duree, 104);

  const soumettre = async () => {
    if (verrou.current || !valide) return;
    verrou.current = true;
    setOccupe(true);
    setErreur('');
    try {
      const saisie = { ...f, frequence: Number(f.frequence) || 0, duree: Number(f.duree) || 0 };
      const r =
        action === 'seance' && cree
          ? await gererProgramme(coachId, 'editSeance', saisie, { id: cree.id })
          : await gererProgramme(coachId, action, saisie, { id, programmeId: cible || undefined, cycle });
      if (action === 'seance') {
        setCree(r);
        setEnregistre({ nom: f.nom, consignes: f.consignes });
        setEtape(2);
      } else {
        onEnregistre(r);
        onFermer();
      }
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Enregistrement impossible');
    } finally {
      verrou.current = false;
      setOccupe(false);
    }
  };

  const proposer = async () => {
    if (verrou.current || demande.trim().length < 5) return;
    verrou.current = true;
    setOccupe(true);
    setErreur('');
    setProposition(undefined);
    try {
      const p = await proposerSeance(demande.trim());
      const blocs = blocsProposes(p, nouvelId);
      if (!blocs.length) throw new Error('L’assistant n’a proposé aucun exercice de ta bibliothèque. Reformule ta demande.');
      setProposition({ p, blocs });
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Proposition impossible');
    } finally {
      verrou.current = false;
      setOccupe(false);
    }
  };

  // La proposition n'est enregistrée qu'ici, quand le coach la retient ; il la retouche ensuite dans l'éditeur.
  const utiliserProposition = async () => {
    if (verrou.current || !proposition) return;
    verrou.current = true;
    setOccupe(true);
    setErreur('');
    try {
      const nom = f.nom.trim() || proposition.p.titre?.trim() || 'Séance';
      const consignes = f.consignes.trim() || proposition.p.consignes?.trim() || '';
      const r = await gererProgramme(coachId, 'seance', { ...f, nom, consignes, frequence: 0, duree: 0 }, { programmeId: cible || undefined });
      const { seance } = await entrainement.seance(r.id);
      await entrainement.enregistrerSeance(coachId, { ...seance, blocs: proposition.blocs });
      setF({ ...f, nom, consignes });
      setCree(r);
      setEnregistre({ nom, consignes });
      setProposition(undefined);
      setEtape(2);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Enregistrement impossible');
    } finally {
      verrou.current = false;
      setOccupe(false);
    }
  };

  const champ = (k: keyof typeof f, libelle: string, aide?: string) => (
    <Saisie
      libelle={libelle}
      valeur={f[k]}
      aide={aide}
      erreur={(k === 'frequence' && !nombreValide(f.frequence, 14)) || (k === 'duree' && !nombreValide(f.duree, 104)) ? `Nombre entier, ${k === 'frequence' ? '14' : '104'} au plus` : undefined}
      onChange={(v) => !occupe && setF({ ...f, [k]: k === 'nom' ? v.slice(0, 160) : v })}
    />
  );

  return (
    <Modale
      titre={TITRES[action]}
      largeur={etape2 ? 896 : undefined}
      onFermer={fermer}
      pied={
        etape2 ? (
          <Ligne style={{ justifyContent: 'flex-end' }}>
            <Action libelle="Retour au titre" variante="contour" desactive={enfantOccupe} onPress={() => setEtape(1)} />
            <Action libelle="Terminer la séance" desactive={enfantOccupe} onPress={terminer} />
          </Ligne>
        ) : (
          <Ligne style={{ justifyContent: 'flex-end' }}>
            <Action libelle={cree ? 'Fermer le brouillon' : 'Annuler'} variante="contour" desactive={occupe} onPress={fermer} />
            <Action
              libelle={occupe ? 'Enregistrement…' : action === 'seance' ? 'Suivant : blocs et exercices' : 'Enregistrer'}
              desactive={!valide || occupe}
              onPress={soumettre}
            />
          </Ligne>
        )
      }
    >
      {action === 'seance' && (
        <View accessibilityLabel="Étapes de création" style={{ flexDirection: 'row', gap: 8 }}>
          {['1 · Titre et consignes', '2 · Blocs et exercices'].map((t, i) => {
            const actif = etape === i + 1;
            return (
              <View key={t} aria-current={actif ? 'step' : undefined} style={{ flex: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: actif ? 'rgba(195,24,30,0.1)' : couleurs.discret }}>
                <Text style={{ fontSize: 14, fontFamily: actif ? polices.texteGras : polices.texte, color: actif ? couleurs.rouge : couleurs.texteDoux }}>{t}</Text>
              </View>
            );
          })}
        </View>
      )}

      {etape2 ? (
        <>
          <Text style={ts.doux}>Votre brouillon est enregistré au fur et à mesure. Ajoutez vos blocs puis leurs exercices.</Text>
          <EditeurSeance
            key={`${cree.id}:${enregistre.nom}:${enregistre.consignes}`}
            coachId={coachId}
            id={cree.id}
            integre
            onRetour={() => setEtape(1)}
            onOccupe={setEnfantOccupe}
          />
        </>
      ) : (
        <>
          {action === 'seance' && !cree && (
            <Repliable resume="Décrire la séance à l’assistant">
              <View style={{ gap: 8 }}>
                <Saisie
                  libelle="Ce que vous voulez dans la séance"
                  long
                  valeur={demande}
                  aide="Ex. : full body 45 min pour une femme de 50 ans débutante, haltères et élastiques, genou sensible, finir par 10 min de vélo."
                  onChange={(v) => !occupe && setDemande(v.slice(0, 2000))}
                />
                <Ligne style={{ justifyContent: 'flex-end' }}>
                  <Action petit libelle={occupe && !proposition ? 'Proposition en cours…' : proposition ? 'Proposer à nouveau' : 'Proposer la séance'} desactive={occupe || demande.trim().length < 5} onPress={proposer} />
                </Ligne>
                {proposition && <ApercuProposition p={proposition.p} blocs={proposition.blocs} />}
                {proposition && (
                  <Ligne style={{ justifyContent: 'flex-end' }}>
                    <Action petit variante="contour" libelle="Écarter" desactive={occupe} onPress={() => setProposition(undefined)} />
                    <Action petit libelle={occupe ? 'Enregistrement…' : 'Utiliser cette séance'} desactive={occupe} onPress={utiliserProposition} />
                  </Ligne>
                )}
              </View>
            </Repliable>
          )}
          {champ('nom', 'Nom')}
          {action === 'attachSeance' && (
            <View style={{ gap: 8 }}>
              <Ligne>
                <Text style={ts.titreChamp}>Programme cible</Text>
                <Action
                  petit
                  variante="contour"
                  libelle="Choisir le programme"
                  onPress={() =>
                    entrainement
                      .bibliotheque(coachId)
                      .then((r) => setOptions(r.filter((p) => p.id !== initial.parentId)))
                      .catch((e) => setErreur(e instanceof Error ? e.message : 'Lecture impossible'))
                  }
                />
              </Ligne>
              <Choix
                libelle="Programme cible"
                sansLibelle
                vide="Sélectionner…"
                choix={(options ?? []).map((p) => p.titre)}
                valeur={options?.find((p) => p.id === cible)?.titre}
                onChange={(t) => setCible(options?.find((p) => p.titre === t)?.id ?? '')}
              />
            </View>
          )}
          {prog && (
            <Repliable resume="Critères facultatifs">
              <View style={{ gap: 12 }}>
                <Choix libelle="Objectif" vide="Non précisé" choix={OBJECTIFS} valeur={f.objectif || undefined} onChange={(v) => setF({ ...f, objectif: v ?? '' })} />
                <Choix libelle="Niveau" vide="Non précisé" choix={NIVEAUX} valeur={f.niveau || undefined} onChange={(v) => setF({ ...f, niveau: v ?? '' })} />
                {champ('frequence', 'Séances par semaine')}
                {champ('duree', 'Durée en semaines')}
                {champ('materiel', 'Matériel disponible')}
              </View>
            </Repliable>
          )}
          {!copie && action !== 'attachSeance' && (
            <Saisie
              libelle={prog ? 'Descriptif et consignes du programme' : 'Consignes (facultatif)'}
              long
              valeur={f.consignes}
              onChange={(v) => !occupe && setF({ ...f, consignes: v.slice(0, 3000) })}
            />
          )}
          {copie && (
            <View style={{ gap: 4 }}>
              <Choix libelle="Cycle du modèle" vide={null} choix={LIBELLES_CYCLES} valeur={LIBELLES_CYCLES[cycle - 1]} onChange={(v) => setCycle(LIBELLES_CYCLES.indexOf(v ?? '') + 1 || 1)} />
              <Text style={ts.doux}>Appliqué aux modèles Fondamentaux. Les séances libres sont copiées avec leurs réglages actuels.</Text>
              <Text style={ts.doux}>Copie indépendante avec tous les exercices et réglages, sans résultats ni attribution client.</Text>
            </View>
          )}
          {erreur ? (
            <Text accessibilityRole="alert" style={ts.erreur}>
              {erreur}
            </Text>
          ) : null}
        </>
      )}
      {confirmation && (
        <Confirmation
          titre="Fermer ?"
          texte={confirmation}
          action="Fermer"
          onFermer={() => setConfirmation(undefined)}
          onConfirmer={() => {
            setConfirmation(undefined);
            terminer();
          }}
        />
      )}
    </Modale>
  );
}

const prescription = (l: Bloc['lignes'][number]) =>
  [
    `${l.series} × ${l.dureeS ? `${l.dureeS} s` : (l.repetitions ?? '—')}`,
    l.recuperationS !== undefined ? `récup ${l.recuperationS} s` : '',
    l.rir !== undefined ? `RIR ${l.rir}` : '',
  ]
    .filter(Boolean)
    .join(' · ');

/** Aperçu de la proposition : rien n'est enregistré tant que le coach ne l'a pas retenue. */
function ApercuProposition({ p, blocs }: { p: PropositionSeance; blocs: Bloc[] }) {
  return (
    <View accessibilityLabel="Proposition de l’assistant" style={{ gap: 8, borderRadius: 8, padding: 12, backgroundColor: couleurs.discret }}>
      <Text style={ts.doux}>Proposition, pas encore enregistrée. Vous pourrez tout modifier ensuite.</Text>
      {p.titre ? <Text style={ts.titreChamp}>{p.titre}</Text> : null}
      {p.consignes ? <Text style={ts.doux}>{p.consignes}</Text> : null}
      {blocs.map((b) => (
        <View key={b.id} style={{ gap: 2 }}>
          <Text style={{ fontSize: 14, fontFamily: polices.texteGras, color: couleurs.texte }}>{b.titre}</Text>
          {b.lignes.map((l) => (
            <Text key={l.id} style={{ fontSize: 14, fontFamily: polices.texte, color: couleurs.texte }}>
              {l.exercice.nom} · {prescription(l)}
            </Text>
          ))}
        </View>
      ))}
      {p.remarque ? <Text style={ts.doux}>À noter : {p.remarque}</Text> : null}
      {p.ecartes ? <Text style={ts.doux}>{p.ecartes} exercice{p.ecartes > 1 ? 's' : ''} hors bibliothèque écarté{p.ecartes > 1 ? 's' : ''}.</Text> : null}
    </View>
  );
}
