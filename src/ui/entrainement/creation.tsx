// CreationDialog.tsx d'origine (C11) : créer, modifier, dupliquer, rattacher. Une séance se crée en deux étapes :
// 1 · titre et consignes (enregistrés en brouillon), 2 · blocs et exercices dans l'éditeur intégré.
import { useRef, useState } from 'react';
import { Text, View } from 'react-native';

import { entrainement, gererProgramme, type ActionCreation } from '@/data/entrainement';
import { descriptifSeance } from '@/domain/descriptif-seance';
import { proposerPlanProgramme, proposerSeance } from '@/data/redaction';
import { blocsProposes, demandeSeanceDuPlan, lirePlan, type PlanLu, type PropositionSeance } from '@/domain/assistant-seance';
import { activiteSimpleDans, seanceActivite } from '@/domain/catalogue-activites';
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
  const [programmePropose, setProgrammePropose] = useState<ProgrammePropose>();
  const [avancement, setAvancement] = useState('');

  const prog = action === 'programme' || action === 'editProgramme';
  const copie = action === 'copyProgramme' || action === 'copySeance';
  const etape2 = action === 'seance' && etape === 2 && !!cree;

  const terminer = async () => {
    if (occupe || enfantOccupe) return;
    if (cree && action === 'seance') {
      setOccupe(true);
      await completerDescriptif(cree.id);
      setOccupe(false);
    }
    if (cree) onEnregistre(cree);
    onFermer();
  };
  /** Une séance terminée sans descriptif en reçoit un, écrit d'après ses blocs ; celui du coach n'est jamais remplacé. */
  const completerDescriptif = async (seanceId: string) => {
    try {
      const { seance } = await entrainement.seance(seanceId);
      const texte = seance.consignes?.trim() ? '' : descriptifSeance(seance);
      if (texte) await entrainement.enregistrerSeance(coachId, { ...seance, consignes: texte });
    } catch {
      // Le brouillon est déjà enregistré : le descriptif pourra être écrit depuis l'éditeur de la séance.
    }
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
    // Une proposition de l'assistant encore affichée est reprise par le bouton du bas, sinon ses blocs seraient perdus.
    if (action === 'seance' && !cree && proposition) return utiliserProposition();
    if (action === 'programme' && programmePropose) return utiliserProgramme();
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
      // Cours collectif, yoga, sport… : la séance tient en son nom, le client la valide ; rien à composer.
      const activite = activiteSimpleDans(demande);
      if (activite) {
        setProposition({ p: seanceActivite(activite), blocs: [] });
        return;
      }
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

  // Programme : le plan de la semaine d'abord, puis chaque séance composée en parallèle avec la bibliothèque d'exercices.
  const proposerProgramme = async () => {
    if (verrou.current || demande.trim().length < 5) return;
    verrou.current = true;
    setOccupe(true);
    setErreur('');
    setProgrammePropose(undefined);
    try {
      setAvancement('Plan de la semaine en cours…');
      const plan = lirePlan(await proposerPlanProgramme(demande.trim()));
      if (!plan.seances.length) throw new Error('L’assistant n’a proposé aucune séance. Reformule ta demande.');
      // Les séances d'activité du plan (RPM, Body Pump, yoga…) ne sont pas composées : un nom et une consigne courte.
      const activites = plan.seances.map((x) => activiteSimpleDans(x.titre));
      let faites = activites.filter(Boolean).length;
      const etape = () => setAvancement(`« ${plan.titre} » : composition des séances (${faites}/${plan.seances.length})…`);
      etape();
      const reponses = await Promise.allSettled(
        plan.seances.map((_, i) =>
          activites[i]
            ? Promise.resolve({ ...seanceActivite(activites[i]!), blocs: [] })
            : proposerSeance(demandeSeanceDuPlan(demande, plan, i)).finally(() => {
                faites++;
                etape();
              }),
        ),
      );
      const seances = reponses.map((r, i) => {
        const a = activites[i];
        if (a) return { titre: plan.seances[i].titre || a.nom, consignes: seanceActivite(a).consignes, blocs: [] as Bloc[] };
        const blocs = r.status === 'fulfilled' ? blocsProposes(r.value, nouvelId) : [];
        return { titre: plan.seances[i].titre, consignes: (r.status === 'fulfilled' && r.value.consignes?.trim()) || plan.seances[i].contenu, blocs };
      });
      if (seances.every((x, i) => !x.blocs.length && !activites[i])) throw new Error('Les séances n’ont pas pu être composées. Réessaie dans un instant.');
      setProgrammePropose({ plan, seances });
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Proposition impossible');
    } finally {
      setAvancement('');
      verrou.current = false;
      setOccupe(false);
    }
  };

  // Le programme proposé est enregistré d'un bloc (en-tête et séances) ; le coach le retouche ensuite comme un autre.
  const utiliserProgramme = async () => {
    if (verrou.current || !programmePropose) return;
    verrou.current = true;
    setOccupe(true);
    setErreur('');
    try {
      const { plan, seances } = programmePropose;
      const id = nouvelId();
      await entrainement.enregistrerProgramme(
        coachId,
        {
          id,
          titre: f.nom.trim() || plan.titre,
          statut: 'Brouillon',
          version: 'coachos-free',
          niveau: f.niveau || plan.niveau,
          objectif: f.objectif || plan.objectif,
          seancesParSemaine: Number(f.frequence) || plan.seancesParSemaine,
          dureeSemaines: Number(f.duree) || plan.dureeSemaines,
          materiel: f.materiel.trim() || plan.materiel,
          consignes: f.consignes.trim() || plan.consignes || undefined,
        },
        seances.map((x, i) => ({ id: nouvelId(), titre: x.titre, programmeId: id, ordre: i + 1, consignes: x.consignes || undefined, blocs: x.blocs })),
      );
      onEnregistre({ id, programmeId: id });
      onFermer();
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Enregistrement impossible');
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
            <Action libelle={occupe ? 'Écriture du descriptif…' : 'Terminer la séance'} desactive={enfantOccupe || occupe} onPress={terminer} />
          </Ligne>
        ) : (
          <Ligne style={{ justifyContent: 'flex-end' }}>
            <Action libelle={cree ? 'Fermer le brouillon' : 'Annuler'} variante="contour" desactive={occupe} onPress={fermer} />
            <Action
              libelle={occupe ? 'Enregistrement…' : action === 'seance' ? 'Suivant : blocs et exercices' : 'Enregistrer'}
              desactive={(!valide && !(action === 'seance' && proposition) && !(action === 'programme' && programmePropose)) || occupe}
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
          <Text style={ts.doux}>Ton brouillon est enregistré au fur et à mesure. Ajoute tes blocs puis leurs exercices. Sans consignes de ta part, un descriptif est écrit d’après la séance quand tu la termines.</Text>
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
                  libelle="Ce que tu veux dans la séance"
                  long
                  dictee
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
          {action === 'programme' && (
            <Repliable resume="Décrire le programme à l’assistant" ouvert>
              <View style={{ gap: 8 }}>
                <Saisie
                  libelle="Ce que tu veux dans le programme"
                  long
                  dictee
                  valeur={demande}
                  aide="Ex. : femme de 50 ans débutante, remise en forme, 3 séances de 45 min par semaine, haltères et élastiques à la maison, genou sensible."
                  onChange={(v) => !occupe && setDemande(v.slice(0, 2000))}
                />
                <Ligne style={{ justifyContent: 'flex-end' }}>
                  <Action
                    petit
                    libelle={occupe && !programmePropose ? 'Proposition en cours…' : programmePropose ? 'Proposer à nouveau' : 'Proposer le programme'}
                    desactive={occupe || demande.trim().length < 5}
                    onPress={proposerProgramme}
                  />
                </Ligne>
                {avancement ? (
                  <Text {...{ 'aria-live': 'polite' }} style={ts.doux}>
                    {avancement} Compte une à deux minutes.
                  </Text>
                ) : null}
                {programmePropose && <ApercuProgramme p={programmePropose} />}
                {programmePropose && (
                  <Ligne style={{ justifyContent: 'flex-end' }}>
                    <Action petit variante="contour" libelle="Écarter" desactive={occupe} onPress={() => setProgrammePropose(undefined)} />
                    <Action petit libelle={occupe ? 'Enregistrement…' : 'Utiliser ce programme'} desactive={occupe} onPress={utiliserProgramme} />
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

type ProgrammePropose = { plan: PlanLu; seances: { titre: string; consignes?: string; blocs: Bloc[] }[] };

/** Aperçu du programme proposé : rien n'est enregistré tant que le coach ne l'a pas retenu. */
function ApercuProgramme({ p }: { p: ProgrammePropose }) {
  const { plan } = p;
  return (
    <View accessibilityLabel="Programme proposé par l’assistant" style={{ gap: 10, borderRadius: 8, padding: 12, backgroundColor: couleurs.discret }}>
      <Text style={ts.doux}>Proposition, pas encore enregistrée. Tu pourras tout modifier ensuite.</Text>
      <Text style={ts.titreChamp}>{plan.titre}</Text>
      <Text style={ts.doux}>
        {[plan.niveau, plan.objectif, `${plan.seancesParSemaine} séance${plan.seancesParSemaine > 1 ? 's' : ''}/sem.`, `${plan.dureeSemaines} sem.`, plan.materiel].filter(Boolean).join(' · ')}
      </Text>
      {plan.consignes ? <Text style={ts.doux}>{plan.consignes}</Text> : null}
      {p.seances.map((s, i) => (
        <View key={i} style={{ gap: 2, borderTopWidth: 1, borderTopColor: couleurs.bordure, paddingTop: 8 }}>
          <Text style={{ fontSize: 15, fontFamily: polices.texteGras, color: couleurs.texte }}>
            {i + 1}. {s.titre}
          </Text>
          {s.blocs.length === 0 && <Text style={[ts.doux, { color: couleurs.rouge }]}>Séance non composée : tu pourras la remplir dans l’éditeur.</Text>}
          {s.blocs.map((b) => (
            <Text key={b.id} style={{ fontSize: 14, fontFamily: polices.texte, color: couleurs.texte }}>
              <Text style={{ fontFamily: polices.texteMoyen }}>{b.titre} : </Text>
              {b.lignes.map((l) => l.exercice.nom).join(', ')}
            </Text>
          ))}
        </View>
      ))}
      {plan.remarque ? <Text style={ts.doux}>À noter : {plan.remarque}</Text> : null}
    </View>
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
      <Text style={ts.doux}>Proposition, pas encore enregistrée. Tu pourras tout modifier ensuite.</Text>
      {p.titre ? <Text style={ts.titreChamp}>{p.titre}</Text> : null}
      {p.consignes ? <Text style={ts.doux}>{p.consignes}</Text> : null}
      {!blocs.length && <Text style={ts.doux}>Séance d’activité : pas d’exercices, le client indique simplement s’il l’a faite.</Text>}
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
