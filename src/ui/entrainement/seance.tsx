// AirtableSeance.tsx d'origine (C12) : blocs (ajout avec propositions, monter, descendre), exercices par bloc
// (monter, descendre, Modifier, Remplacer, Retirer restaurable), cases de prescription et aperçu des cycles 2 à 4.
// Chaque action enregistre la séance entière ; tant que l'enregistrement n'a pas réussi, rien ne change à l'écran.
import { ArrowDown, ArrowLeft, ArrowUp, Pencil, PlayCircle, Plus, Replace, RotateCcw, Sparkles, Unlink } from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, Text, View, useWindowDimensions } from 'react-native';

import { entrainement } from '@/data/entrainement';
import { CONTRACTIONS, descriptifSeance, FORMATS_BLOC } from '@/domain/descriptif-seance';
import { aDesCycles, appliquerCycle, casesLigne, LIBELLES_CYCLES, titreClient } from '@/domain/entrainement';
import type { SeanceCoach } from '@/domain/entrainement-etat';
import type { Bloc, FormatBloc, LignePrescription, Seance } from '@/domain/types';
import { nouvelId } from '@/lib/identifiant';
import { roleWeb } from '@/lib/role-web';

import { Kicker, TitreDisplay } from '../coque';
import { Badge, Choix, Modale, Repliable, Saisie } from '../crm/dossier';
import { couleurs, polices } from '../theme';
import { Action, Confirmation, Etat, Ligne, TexteLong, ts } from './commun';
import { SuppressionEntrainement } from './corbeille';
import { AttributionClient } from './attribution';
import { CreationEntrainement, type DemandeCreation } from './creation';
import { DialogueLigne, type ModeLigne } from './ligne';

const PROPOSITIONS_BLOCS = ['Échauffement', 'Mobilité', 'Renforcement', 'Cardio', 'Abdos / gainage', 'Retour au calme'];
const MESSAGE_CYCLE = 'Revenez au cycle 1 pour modifier le modèle, ou dupliquez-le avec le cycle souhaité.';

export function EditeurSeance({
  coachId,
  id,
  onRetour,
  integre = false,
  onOccupe,
}: {
  coachId: string;
  id: string;
  onRetour: () => void;
  /** Étape 2 de la création : sans retour ni actions de séance. */
  integre?: boolean;
  onOccupe?: (occupe: boolean) => void;
}) {
  const { width } = useWindowDimensions();
  const [cycle, setCycle] = useState(1);
  const [donnee, setDonnee] = useState<SeanceCoach | null>(null);
  const [erreurChargement, setErreurChargement] = useState('');
  const [occupe, setOccupe] = useState<string | null>(null);
  const [etat, setEtat] = useState<{ message?: string; erreur?: string }>({});
  const [dialogue, setDialogue] = useState<{ mode: ModeLigne; ligne?: LignePrescription; bloc?: string }>();
  /** Bloc en cours d'ajout (sans id) ou de modification. */
  const [dialogueBloc, setDialogueBloc] = useState<Partial<Bloc>>();
  const [remplacerDescriptif, setRemplacerDescriptif] = useState(false);
  const [attribution, setAttribution] = useState(false);
  const [aRetirer, setARetirer] = useState<LignePrescription>();
  const [suppression, setSuppression] = useState(false);
  const [creation, setCreation] = useState<DemandeCreation>();
  const revision = useRef(0);

  useEffect(() => onOccupe?.(!!occupe), [occupe, onOccupe]);

  const charger = useCallback(() => {
    const demande = ++revision.current;
    return entrainement
      .seance(id)
      .then((d) => {
        if (demande !== revision.current) return;
        setDonnee(d);
        setErreurChargement('');
      })
      .catch((e) => demande === revision.current && setErreurChargement(e instanceof Error ? e.message : 'Lecture impossible'));
  }, [id]);
  useEffect(() => {
    charger();
  }, [charger]);

  if (!donnee)
    return erreurChargement ? (
      <View accessibilityRole="alert" style={[ts.carte, { borderStyle: 'dashed', alignItems: 'center' }]}>
        <Text style={ts.titre}>La séance n’a pas pu être chargée</Text>
        <Text style={ts.texte}>{erreurChargement}</Text>
        <Action libelle="Réessayer" onPress={charger} />
      </View>
    ) : (
      <View style={{ height: 288, borderRadius: 12, backgroundColor: couleurs.discret }} />
    );

  const { seance, programme, retraits } = donnee;
  const modele = !programme.clientId;
  const avecCycles = modele && aDesCycles(seance);
  const verrouCycle = cycle !== 1;
  const blocs = seance.blocs;

  /** Enregistre la séance modifiée puis relit : l'écran ne montre que ce qui est enregistré. */
  const enregistrer = async (cle: string, suivante: Seance, ok: string) => {
    if (verrouCycle) {
      setEtat({ erreur: MESSAGE_CYCLE });
      return;
    }
    setOccupe(cle);
    setEtat({});
    try {
      await entrainement.enregistrerSeance(coachId, suivante);
      await charger();
      setEtat({ message: ok });
    } catch (e) {
      setEtat({ erreur: e instanceof Error ? e.message : 'Échec' });
      throw e;
    } finally {
      setOccupe(null);
    }
  };
  const silencieux = (p: Promise<unknown>) => p.catch(() => undefined);

  const avecBlocs = (b: Bloc[]): Seance => ({ ...seance, blocs: b });
  const deplacerBloc = (i: number, sens: -1 | 1) => {
    const b = [...blocs];
    [b[i], b[i + sens]] = [b[i + sens], b[i]];
    silencieux(enregistrer('blocs', avecBlocs(b), 'Ordre des blocs mis à jour'));
  };
  const deplacerLigne = (bloc: Bloc, i: number, sens: -1 | 1, cle: string) => {
    const l = [...bloc.lignes];
    [l[i], l[i + sens]] = [l[i + sens], l[i]];
    silencieux(enregistrer(cle, avecBlocs(blocs.map((b) => (b.id === bloc.id ? { ...b, lignes: l } : b))), 'Ordre mis à jour'));
  };
  const ouvrir = (d: { mode: ModeLigne; ligne?: LignePrescription; bloc?: string }) => {
    if (verrouCycle) return setEtat({ erreur: MESSAGE_CYCLE });
    setDialogue(d);
  };
  /** La ligne enregistrée prend sa place, ou va à la fin du bloc choisi. */
  const placerLigne = async (l: LignePrescription, blocId: string) => {
    let b = blocs.length ? blocs : [{ id: blocId, titre: 'Sans bloc', lignes: [] }];
    const ici = b.find((x) => x.lignes.some((y) => y.id === l.id));
    b = b.map((x) => {
      if (ici?.id === blocId && x.id === blocId) return { ...x, lignes: x.lignes.map((y) => (y.id === l.id ? l : y)) };
      const sans = x.lignes.filter((y) => y.id !== l.id);
      return x.id === blocId ? { ...x, lignes: [...sans, l] } : { ...x, lignes: sans };
    });
    await enregistrer('ligne', avecBlocs(b), dialogue?.mode === 'add' ? 'Exercice ajouté' : 'Enregistré');
  };

  const ecrireDescriptif = () => silencieux(enregistrer('descriptif', { ...seance, consignes: descriptifSeance(seance) }, 'Descriptif écrit d’après la séance'));
  const enregistrerBloc = (b: Partial<Bloc> & { titre: string }) => {
    const suivants = b.id ? blocs.map((x) => (x.id === b.id ? { ...x, ...b } : x)) : [...blocs, { lignes: [], ...b, id: nouvelId() }];
    return enregistrer('blocs', avecBlocs(suivants), b.id ? 'Bloc mis à jour' : 'Bloc ajouté').then(() => setDialogueBloc(undefined));
  };

  const debuts = blocs.map((_, i) => blocs.slice(0, i).reduce((n, b) => n + b.lignes.length, 0));
  const colonnes = width >= 640 ? 6 : 3;

  return (
    <View>
      {!integre && (
        <View style={{ alignSelf: 'flex-start', marginLeft: -8, marginBottom: 12 }}>
          <Action petit variante="fantome" icone={ArrowLeft} libelle={titreClient(programme.titre)} onPress={onRetour} />
        </View>
      )}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
        <View style={{ flexShrink: 1, minWidth: 0 }}>
          {!integre && <Kicker>{modele ? 'Modèle de séance' : 'Séance du programme'}</Kicker>}
          <TitreDisplay taille={30}>{titreClient(seance.titre)}</TitreDisplay>
          <Text style={[ts.doux, { fontSize: 14, marginTop: 4 }]}>{[seance.dominante, seance.dureeMin ? `${seance.dureeMin} min` : '', seance.objectif].filter(Boolean).join(' · ')}</Text>
        </View>
        <Action libelle="Ajouter un bloc" icone={Plus} desactive={!!occupe || verrouCycle} onPress={() => setDialogueBloc({})} />
      </View>

      {avecCycles && (
        <View style={{ marginTop: 16, maxWidth: 384, gap: 4 }}>
          <Choix
            libelle="Aperçu du cycle"
            vide={null}
            choix={LIBELLES_CYCLES}
            valeur={LIBELLES_CYCLES[cycle - 1]}
            onChange={(v) => !occupe && setCycle(LIBELLES_CYCLES.indexOf(v ?? '') + 1 || 1)}
          />
          <Text style={ts.doux}>Aperçu uniquement. Choisissez ce cycle lors de la duplication ou de l’attribution en copie pour enregistrer ses réglages.</Text>
          {verrouCycle && (
            <Text {...roleWeb('status')} style={[ts.doux, { color: couleurs.orange }]}>
              {MESSAGE_CYCLE}
            </Text>
          )}
        </View>
      )}

      {!integre && (
        <Ligne style={{ marginTop: 12, alignItems: 'flex-start' }}>
          <Action petit variante="contour" libelle="Modifier la séance" onPress={() => setCreation({ action: 'editSeance', id, initial: { nom: seance.titre, consignes: seance.consignes } })} />
          {modele && <Action petit variante="contour" libelle="Attribuer à un client" onPress={() => setAttribution(true)} />}
          <Repliable resume="Autres actions" style={{ borderWidth: 1, borderColor: couleurs.bordure, borderRadius: 10, paddingHorizontal: 10, backgroundColor: couleurs.carte }}>
            <Ligne style={{ paddingBottom: 10 }}>
              <Action
                petit
                variante="contour"
                libelle="Dupliquer dans ce programme"
                onPress={() => setCreation({ action: 'copySeance', id, programmeId: programme.id, initial: { nom: `${seance.titre} · Copie`, cycle } })}
              />
              <Action petit variante="contour" libelle="Copier en séance seule" onPress={() => setCreation({ action: 'copySeance', id, initial: { nom: `${seance.titre} · Copie`, cycle } })} />
              <Action
                petit
                variante="fantome"
                libelle="Rattacher une séance seule"
                onPress={() => setCreation({ action: 'attachSeance', id, initial: { nom: seance.titre, parentId: programme.id } })}
              />
              <Action petit variante="danger" libelle="Supprimer la séance" onPress={() => setSuppression(true)} />
            </Ligne>
          </Repliable>
        </Ligne>
      )}
      <View style={{ marginTop: 8, maxWidth: 672, gap: 8 }}>
        <TexteLong texte={seance.consignes} />
        {blocs.some((b) => b.lignes.length) && (
          <View style={{ alignSelf: 'flex-start' }}>
            <Action
              petit
              variante="contour"
              icone={Sparkles}
              libelle={seance.consignes ? 'Réécrire le descriptif d’après la séance' : 'Écrire le descriptif d’après la séance'}
              chargement={occupe === 'descriptif'}
              desactive={!!occupe || verrouCycle}
              onPress={() => (seance.consignes ? setRemplacerDescriptif(true) : ecrireDescriptif())}
            />
          </View>
        )}
      </View>
      <View style={{ marginTop: 8 }}>
        <Etat {...etat} />
      </View>

      <View style={{ marginTop: 16, gap: 12 }}>
        {blocs.length === 0 && (
          <View style={{ borderWidth: 1, borderStyle: 'dashed', borderColor: couleurs.bordure, borderRadius: 12, padding: 24, alignItems: 'center', gap: 8 }}>
            <Text style={[ts.doux, { fontSize: 14 }]}>Commencez par ajouter un bloc, puis ses exercices.</Text>
            <Action petit variante="fantome" libelle="Ajouter un exercice sans bloc" onPress={() => ouvrir({ mode: 'add', bloc: 'sans-bloc' })} />
          </View>
        )}
        {blocs.map((bloc, bi) => (
          <View key={bloc.id} style={{ borderWidth: 1, borderColor: couleurs.bordure, borderRadius: 16, padding: width >= 640 ? 16 : 12 }}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 12 }}>
              <Text style={[ts.titre, { flexShrink: 1 }]}>{bloc.titre || 'Sans bloc'}</Text>
              <Ligne style={{ gap: 4 }}>
                <Action petit variante="fantome" icone={Pencil} nom={`Modifier le bloc ${bloc.titre}`} desactive={!!occupe || verrouCycle} onPress={() => setDialogueBloc(bloc)} />
                <Action petit variante="fantome" icone={ArrowUp} nom={`Monter le bloc ${bloc.titre}`} desactive={bi === 0 || !!occupe || verrouCycle} onPress={() => deplacerBloc(bi, -1)} />
                <Action
                  petit
                  variante="fantome"
                  icone={ArrowDown}
                  nom={`Descendre le bloc ${bloc.titre}`}
                  desactive={bi >= blocs.length - 1 || !!occupe || verrouCycle}
                  onPress={() => deplacerBloc(bi, 1)}
                />
                <Action petit variante="contour" icone={Plus} libelle="Ajouter un exercice" desactive={!!occupe || verrouCycle} onPress={() => ouvrir({ mode: 'add', bloc: bloc.id })} />
              </Ligne>
            </View>
            <DetailsBloc bloc={bloc} />
            {!bloc.lignes.length && <Text style={[ts.doux, { fontSize: 14, paddingBottom: 12 }]}>Ajoutez le premier exercice de ce bloc.</Text>}
            <View style={{ gap: 12 }}>
              {bloc.lignes.map((brute, i) => {
                const l = appliquerCycle(brute, cycle);
                const numero = debuts[bi] + i + 1;
                return (
                  <View key={l.id} style={[ts.carte, { padding: 16, gap: 0, borderRadius: 12 }]}>
                    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
                      <View style={[ts.pastilleJour, { width: 32, height: 32 }]}>
                        <Text style={[ts.pastilleJourTexte, { fontSize: 14 }]}>{numero}</Text>
                      </View>
                      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                        <Ligne style={{ gap: 8 }}>
                          <Text style={ts.titre}>{l.exercice.nom}</Text>
                          {l.phase && <Badge libelle={l.phase} />}
                          {bloc.titre ? <Badge libelle={bloc.titre} variante="secondaire" /> : null}
                          {l.exercice.videoUrl && (
                            <Text accessibilityRole="link" onPress={() => Linking.openURL(l.exercice.videoUrl!)} style={[ts.doux, { color: couleurs.rouge, fontFamily: polices.texteMoyen }]}>
                              <PlayCircle size={14} color={couleurs.rouge} /> Vidéo
                            </Text>
                          )}
                        </Ligne>
                        <TexteLong texte={l.consignes} style={{ color: couleurs.texteDoux }} />
                      </View>
                      <View style={{ flexDirection: 'row' }}>
                        <Action
                          petit
                          variante="fantome"
                          icone={ArrowUp}
                          nom="Monter"
                          chargement={occupe === `${l.id}u`}
                          desactive={i === 0 || !!occupe || verrouCycle}
                          onPress={() => deplacerLigne(bloc, i, -1, `${l.id}u`)}
                        />
                        <Action
                          petit
                          variante="fantome"
                          icone={ArrowDown}
                          nom="Descendre"
                          chargement={occupe === `${l.id}d`}
                          desactive={i === bloc.lignes.length - 1 || !!occupe || verrouCycle}
                          onPress={() => deplacerLigne(bloc, i, 1, `${l.id}d`)}
                        />
                      </View>
                    </View>
                    <View style={{ marginTop: 12, flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                      {casesLigne(l).map(([k, v]) => (
                        <View key={k} style={{ flexBasis: `${100 / colonnes - 2}%`, flexGrow: 0, minWidth: 0, borderRadius: 8, backgroundColor: 'rgba(237,239,242,0.7)', paddingHorizontal: 8, paddingVertical: 6 }}>
                          <Text style={{ fontFamily: polices.texteGras, fontSize: 10, textTransform: 'uppercase', color: couleurs.texteDoux }}>{k}</Text>
                          <Text numberOfLines={1} style={{ fontFamily: polices.chiffres, fontSize: 13, color: couleurs.texte }}>
                            {v || '—'}
                          </Text>
                        </View>
                      ))}
                    </View>
                    <View style={{ marginTop: 8 }}>
                      <TexteLong texte={l.progression} libelle="Progression" style={{ fontSize: 12, color: couleurs.texteDoux }} />
                    </View>
                    <Ligne style={{ marginTop: 12 }}>
                      <Action petit variante="contour" icone={Pencil} libelle="Modifier" desactive={verrouCycle} onPress={() => ouvrir({ mode: 'edit', ligne: brute, bloc: bloc.id })} />
                      <Action petit variante="contour" icone={Replace} libelle="Remplacer" desactive={verrouCycle} onPress={() => ouvrir({ mode: 'replace', ligne: brute, bloc: bloc.id })} />
                      <Action petit variante="fantome" icone={Unlink} libelle="Retirer" desactive={verrouCycle} onPress={() => setARetirer(brute)} />
                    </Ligne>
                  </View>
                );
              })}
            </View>
          </View>
        ))}
      </View>

      {retraits.length > 0 && (
        <Repliable
          resume={<Text style={[ts.texte, { fontFamily: polices.texteGras }]}>Exercices retirés ({retraits.length}) — restaurables</Text>}
          style={{ marginTop: 24, borderWidth: 1, borderColor: couleurs.bordure, borderRadius: 12, backgroundColor: 'rgba(237,239,242,0.4)', padding: 16 }}
        >
          <View style={{ gap: 8 }}>
            {retraits.map((r) => (
              <View key={r.ligne.id} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <Text style={[ts.texte, { flex: 1 }]}>{r.ligne.exercice.nom}</Text>
                <Action
                  petit
                  variante="contour"
                  icone={RotateCcw}
                  libelle="Restaurer"
                  chargement={occupe === r.ligne.id}
                  desactive={!!occupe || verrouCycle}
                  onPress={async () => {
                    setOccupe(r.ligne.id);
                    setEtat({});
                    try {
                      await entrainement.restaurerLigne(id, r.ligne.id);
                      await charger();
                      setEtat({ message: 'Exercice restauré' });
                    } catch (e) {
                      setEtat({ erreur: e instanceof Error ? e.message : 'Échec' });
                    } finally {
                      setOccupe(null);
                    }
                  }}
                />
              </View>
            ))}
          </View>
        </Repliable>
      )}

      {dialogue && (
        <DialogueLigne
          mode={dialogue.mode}
          ligne={dialogue.ligne}
          blocs={blocs.length ? blocs.map((b) => ({ id: b.id, titre: b.titre || 'Sans bloc' })) : [{ id: dialogue.bloc ?? 'sans-bloc', titre: 'Sans bloc' }]}
          blocInitial={dialogue.bloc}
          onFermer={() => setDialogue(undefined)}
          onEnregistrer={(l, blocId) => placerLigne(l, blocs.length ? blocId : nouvelId())}
        />
      )}
      {dialogueBloc && (
        <DialogueBloc
          bloc={dialogueBloc}
          autres={blocs.filter((b) => b.id !== dialogueBloc.id).map((b) => b.titre)}
          plein={!dialogueBloc.id && blocs.length >= 30}
          occupe={occupe === 'blocs'}
          erreur={etat.erreur}
          onFermer={() => !occupe && setDialogueBloc(undefined)}
          onEnregistrer={(b) => enregistrerBloc({ ...b, id: dialogueBloc.id }).catch(() => undefined)}
        />
      )}
      {attribution && <AttributionClient coachId={coachId} source={{ seanceId: id }} nom={titreClient(seance.titre)} onFermer={() => setAttribution(false)} />}
      {remplacerDescriptif && (
        <Confirmation
          titre="Remplacer le descriptif ?"
          texte="Le descriptif actuel sera remplacé par un texte écrit d’après les blocs et les exercices de la séance. Vous pourrez le retoucher ensuite depuis Modifier la séance."
          action="Remplacer"
          onFermer={() => setRemplacerDescriptif(false)}
          onConfirmer={() => {
            setRemplacerDescriptif(false);
            ecrireDescriptif();
          }}
        />
      )}
      {aRetirer && (
        <Confirmation
          titre={`Retirer « ${aRetirer.exercice.nom} » de la séance ?`}
          texte="La ligne n’est pas supprimée : elle est seulement détachée de cette séance et pourra être restaurée."
          action="Retirer"
          onFermer={() => setARetirer(undefined)}
          onConfirmer={() =>
            enregistrer(`${aRetirer.id}r`, avecBlocs(blocs.map((b) => ({ ...b, lignes: b.lignes.filter((l) => l.id !== aRetirer.id) }))), 'Exercice retiré (restaurable)')
          }
        />
      )}
      {suppression && <SuppressionEntrainement items={[{ kind: 'seance', id, nom: seance.titre }]} onFermer={() => setSuppression(false)} onSupprime={onRetour} />}
      {creation && (
        <CreationEntrainement
          coachId={coachId}
          {...creation}
          onFermer={() => setCreation(undefined)}
          onEnregistre={() => {
            charger();
            onRetour();
          }}
        />
      )}
    </View>
  );
}

function DetailsBloc({ bloc }: { bloc: Bloc }) {
  const puces = [bloc.format && bloc.format !== 'Classique' ? bloc.format : '', bloc.tempo ? `Tempo ${bloc.tempo}` : '', bloc.contraction && bloc.contraction !== 'Classique' ? bloc.contraction : ''].filter(Boolean);
  if (!puces.length && !bloc.description) return null;
  return (
    <View style={{ gap: 6, marginTop: -4, marginBottom: 12 }}>
      {puces.length > 0 && (
        <Ligne style={{ gap: 6 }}>
          {puces.map((p) => (
            <Badge key={p} libelle={p} variante="secondaire" />
          ))}
        </Ligne>
      )}
      <TexteLong texte={bloc.description} style={{ color: couleurs.texteDoux }} />
    </View>
  );
}

function DialogueBloc({
  bloc,
  autres,
  plein,
  occupe,
  erreur,
  onFermer,
  onEnregistrer,
}: {
  bloc: Partial<Bloc>;
  autres: string[];
  plein: boolean;
  occupe: boolean;
  erreur?: string;
  onFermer: () => void;
  onEnregistrer: (b: Pick<Bloc, 'titre' | 'format' | 'tempo' | 'contraction' | 'description'>) => void;
}) {
  const [f, setF] = useState({
    titre: bloc.titre ?? '',
    format: bloc.format,
    tempo: bloc.tempo ?? '',
    contraction: bloc.contraction,
    description: bloc.description ?? '',
  });
  const titre = f.titre.trim();
  const doublon = autres.includes(titre);
  return (
    <Modale
      titre={bloc.id ? 'Modifier le bloc' : 'Ajouter un bloc'}
      largeur={512}
      onFermer={onFermer}
      pied={
        <Ligne style={{ justifyContent: 'flex-end' }}>
          <Action libelle="Annuler" variante="contour" desactive={occupe} onPress={onFermer} />
          <Action
            libelle={bloc.id ? 'Enregistrer' : 'Ajouter le bloc'}
            icone={bloc.id ? undefined : Plus}
            chargement={occupe}
            desactive={!titre || doublon || plein}
            onPress={() =>
              onEnregistrer({
                titre,
                format: f.format as FormatBloc | undefined,
                tempo: f.tempo.trim() || undefined,
                contraction: f.contraction,
                description: f.description.trim() || undefined,
              })
            }
          />
        </Ligne>
      }
    >
      <Ligne style={{ gap: 6 }}>
        {PROPOSITIONS_BLOCS.map((b) => (
          <Action key={b} petit libelle={b} variante={f.titre === b ? 'plein' : 'contour'} desactive={autres.includes(b) || occupe} onPress={() => setF({ ...f, titre: b })} />
        ))}
      </Ligne>
      <Saisie libelle="Nom du bloc" valeur={f.titre} placeholder="Ou choisissez votre propre nom" erreur={doublon ? 'Un autre bloc porte déjà ce nom' : undefined} onChange={(v) => !occupe && setF({ ...f, titre: v.slice(0, 100) })} />
      <Choix libelle="Format" vide="Classique" choix={FORMATS_BLOC.filter((x) => x !== 'Classique')} valeur={f.format === 'Classique' ? undefined : f.format} onChange={(v) => setF({ ...f, format: v as FormatBloc | undefined })} />
      <Saisie libelle="Tempo (facultatif)" valeur={f.tempo} placeholder="3-1-1-0" aide="Secondes pour descendre, pause en bas, remonter, pause en haut." onChange={(v) => !occupe && setF({ ...f, tempo: v.slice(0, 30) })} />
      <Choix libelle="Mode de contraction" vide="Classique" choix={CONTRACTIONS.filter((x) => x !== 'Classique')} valeur={f.contraction === 'Classique' ? undefined : f.contraction} onChange={(v) => setF({ ...f, contraction: v })} />
      <Saisie libelle="Descriptif du bloc (facultatif)" long valeur={f.description} onChange={(v) => !occupe && setF({ ...f, description: v.slice(0, 1000) })} />
      {plein && <Text style={ts.erreur}>30 blocs au plus par séance.</Text>}
      <Etat erreur={erreur} />
    </Modale>
  );
}
