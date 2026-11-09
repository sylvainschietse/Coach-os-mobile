// Séance en mode immersif (fond sombre), un bloc par page : vidéo intégrée, séries pré-remplies avec ce que le coach
// a prévu, notes (tempo, contraction…), puis « Valider le bloc » passe au suivant. Un superset ou un biset montre ses
// exercices A, B… sur la même page. Le client peut remplacer un exercice (machine prise, matériel absent…) par un
// exercice similaire ou cherché par son nom ; le coach voit le remplacement et sa raison. Dernière page : le bilan,
// le ressenti et l'enregistrement. Même brouillon que la carte de séance (SeanceLog) : on peut passer de l'une à l'autre.
import { router } from 'expo-router';
import { ArrowLeftRight, Check, CheckCircle2, ChevronLeft, ChevronRight, Search, Timer, X } from 'lucide-react-native';
import { useEffect, useMemo, useRef, useState, type ComponentRef } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';

import { depot } from '@/data';
import { entrainement } from '@/data/entrainement';
import { prescriptionClient, suggestionPourcentage, titreClient, type Reference } from '@/domain/entrainement';
import type { RealisationLue } from '@/domain/entrainement-etat';
import { circuitAlterne, resumeMinuteur, type ConfigMinuteur } from '@/domain/minuteur';
import { rechercherExercices } from '@/domain/programmes';
import {
  consigneBloc,
  dureeRepos,
  dureeSeance,
  enchaine,
  enTeteBloc,
  lettre,
  RAISONS_REMPLACEMENT,
  reposDuBloc,
  similaires,
  texteRemplacements,
  titreBloc,
  tonnage,
  type Remplacement,
} from '@/domain/seance-blocs';
import type { Bloc, Exercice, LignePrescription, Mesure, Seance, Valeurs } from '@/domain/types';
import { ecrireBrouillon, lireBrouillon } from '@/lib/brouillon';
import { annulerAlertes, programmerAlerte } from '@/lib/notifications';
import { dansSecondes, maintenantMs } from '@/lib/temps';
import { messageErreur, useCharger } from '@/lib/useCharger';
import { vibrer } from '@/lib/vibrer';

import { DefilementClavier } from '../clavier';
import { polices } from '../theme';
import { champsSaisie, DIFFICULTES, invalide, proposition, sale, seriesDuBrouillon, validerSeries, vide, type Brouillon, type Enregistrement } from './seance-log';
import { VideoIntegree } from './video-integree';

/** Couleurs du mode séance : sombre, rouge vif pour l'action, vert pour ce qui est fait. */
export const nuit = {
  fond: '#0E0F13',
  carte: '#181A20',
  bordure: '#262932',
  champ: '#111318',
  bordureChamp: '#333743',
  texte: '#F2F3F5',
  doux: '#9599A3',
  propose: '#6B707B',
  rouge: '#E5252C',
  rougeDoux: '#FF7A7E',
  vert: '#2FBF6B',
  orange: '#FFB07A',
};

type Repos = { finMs: number; libelle: string; alerte: string | null };

export function SeanceParBloc({
  clientId,
  cycleId,
  seance,
  historique,
  references,
  planificationId,
  onQuitter,
  onEnregistre,
}: {
  clientId: string;
  cycleId: string;
  seance: Seance;
  historique: RealisationLue[];
  references: Reference[];
  planificationId?: string;
  onQuitter: () => void;
  onEnregistre: (r: Enregistrement) => void;
}) {
  const cle = `coachos:brouillon:${clientId}:${cycleId}:${seance.id}`;
  const blocs = useMemo(() => seance.blocs.filter((b) => b.lignes.length), [seance]);
  const lignes = useMemo(() => blocs.flatMap((b) => b.lignes), [blocs]);
  const [d, setD] = useState<Brouillon>(vide);
  const [pret, setPret] = useState(false);
  const [repos, setRepos] = useState<Repos | null>(null);
  const [aRemplacer, setARemplacer] = useState<LignePrescription | null>(null);
  const [etat, setEtat] = useState<'repos' | 'envoi' | 'ok' | 'doublon' | 'erreur'>('repos');
  const [erreur, setErreur] = useState('');
  const [difficulte, setDifficulte] = useState(false);
  const envoi = useRef(false);
  const defilement = useRef<ComponentRef<typeof ScrollView>>(null);
  const commentaire = useRef<ComponentRef<typeof TextInput>>(null);
  const marges = useSafeAreaInsets();
  const page = Math.min(d.bloc ?? 0, blocs.length);
  const fin = page === blocs.length;
  const valides = d.valides ?? [];
  const remplacements = d.remplacements ?? {};

  useEffect(() => {
    let annule = false;
    lireBrouillon<Brouillon>(cle).then((b) => {
      if (annule) return;
      if (b) setD({ ...vide(), ...b });
      setPret(true);
    });
    return () => {
      annule = true;
    };
  }, [cle]);

  // Le brouillon est gardé dès qu'on avance d'un bloc : « Quitter » ne perd rien.
  const garder = sale(d) || !!valides.length || !!d.bloc;
  useEffect(() => {
    if (pret && etat !== 'ok' && etat !== 'doublon') ecrireBrouillon(cle, garder ? d : null);
  }, [pret, cle, d, garder, etat]);

  const maj = (f: (c: Brouillon) => Brouillon) => {
    if (etat === 'erreur') setEtat('repos');
    setD(f);
  };

  /** Dernière séance où cet exercice a des valeurs (le même exercice : pas celui qui l'a remplacé). */
  const precedentes = (l: LignePrescription): Record<number, Valeurs> => {
    const exerciceId = remplacements[l.id]?.exercice.id ?? l.exercice.id;
    const r = historique.find((x) => x.series.some((s) => s.ligneId === l.id && s.exerciceId === exerciceId && Object.keys(s.valeurs).length));
    const parSerie: Record<number, Valeurs> = {};
    r?.series.filter((s) => s.ligneId === l.id && s.exerciceId === exerciceId).forEach((s) => (parSerie[s.index + 1] = s.valeurs));
    return parSerie;
  };
  /** La ligne telle que le client la fait : l'exercice remplacé ne garde pas la charge indicative de l'autre. */
  const faite = (l: LignePrescription): LignePrescription => {
    const r = remplacements[l.id];
    return r ? { ...l, exercice: { ...l.exercice, ...r.exercice, mesures: l.exercice.mesures }, chargeIndicative: undefined, chargeIntensite: undefined } : l;
  };

  const aller = (n: number) => {
    maj((c) => ({ ...c, bloc: Math.max(0, Math.min(blocs.length, n)) }));
    defilement.current?.scrollTo({ y: 0, animated: false });
  };
  const fautifBloc = (b: Bloc) =>
    b.lignes.some((l) => {
      const champs = champsSaisie(l);
      return Object.entries(d.vals).some(([k, v]) => k.startsWith(`${l.id}:`) && champs.some((c) => invalide(c, v[c.m])));
    });
  const validerBloc = (b: Bloc) => {
    maj((c) => ({
      ...b.lignes.reduce((x, l) => validerSeries(x, faite(l), precedentes(l)), c),
      valides: [...new Set([...(c.valides ?? []), b.id])],
      bloc: Math.min(blocs.length, (c.bloc ?? 0) + 1),
    }));
    defilement.current?.scrollTo({ y: 0, animated: false });
  };

  const lancerRepos = async (secondes: number, libelle: string) => {
    if (repos) await annulerAlertes([repos.alerte]);
    const alerte = await programmerAlerte(secondes, 'Repos terminé', `On repart : ${libelle}`).catch(() => null);
    setRepos({ finMs: dansSecondes(secondes), libelle, alerte });
  };
  const arreterRepos = async () => {
    if (repos) await annulerAlertes([repos.alerte]);
    setRepos(null);
  };

  const ajouterDifficulte = (libelle: string) => {
    maj((c) => {
      if (c.com.split('\n').some((x) => x.trim() === `${libelle} :`)) return c;
      const separateur = c.com && !c.com.endsWith('\n') ? '\n' : '';
      return { ...c, com: `${c.com}${separateur}${libelle} : ` };
    });
    setDifficulte(false);
    requestAnimationFrame(() => commentaire.current?.focus());
  };

  const enregistrer = async () => {
    if (envoi.current) return;
    envoi.current = true;
    setEtat('envoi');
    setErreur('');
    try {
      await arreterRepos();
      const changements = texteRemplacements(lignes, remplacements);
      const resultat = await entrainement.enregistrerRealisation({
        id: d.envoiId,
        clientId,
        seanceId: seance.id,
        cycleId,
        planificationId,
        debut: d.debut,
        fin: new Date().toISOString(),
        note: d.note ?? undefined,
        commentaire: [d.com.trim(), changements].filter(Boolean).join('\n\n') || (valides.length ? 'Séance faite.' : ''),
        series: seriesDuBrouillon(lignes, d),
      });
      ecrireBrouillon(cle, null);
      setEtat(resultat === 'doublon' ? 'doublon' : 'ok');
      onEnregistre({ resultat });
    } catch (e) {
      setErreur(messageErreur(e));
      setEtat('erreur');
    }
    envoi.current = false;
  };

  const b = blocs[page];
  const termine = etat === 'ok' || etat === 'doublon';
  const minuteurBloc: ConfigMinuteur | undefined = b && (b.minuteur ?? circuitAlterne(b)?.config);

  return (
    <View style={{ flex: 1, backgroundColor: nuit.fond }}>
      <Lueur couleur={fin ? nuit.vert : nuit.rouge} />
      <View style={{ paddingTop: marges.top + 10, paddingHorizontal: 16, paddingBottom: 8, gap: 6 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Bouton icone={X} libelle="Quitter" onPress={onQuitter} />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={page > 0 && !termine ? 'Bloc précédent' : undefined}
            disabled={page === 0 || termine}
            onPress={() => aller(page - 1)}
            hitSlop={8}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 2, minHeight: 36 }}
          >
            {page > 0 && !termine && <ChevronLeft size={16} color="#B7BAC3" />}
            <Text style={styles.enTeteDoux}>{fin ? (termine ? 'Enregistrée' : 'Terminé') : `Bloc ${page + 1} sur ${blocs.length}`}</Text>
          </Pressable>
          <Chrono debut={d.debut} arret={termine} />
        </View>
        <Text style={styles.titreSeance} numberOfLines={1}>
          {titreClient(seance.titre)}
        </Text>
        <View accessibilityRole="progressbar" aria-valuemin={0} aria-valuemax={blocs.length} aria-valuenow={valides.length} style={{ flexDirection: 'row', gap: 4 }}>
          {blocs.map((x, i) => (
            <Pressable
              key={x.id}
              accessibilityRole="button"
              accessibilityLabel={`Aller au bloc ${i + 1}${valides.includes(x.id) ? ', validé' : ''}`}
              onPress={() => !termine && aller(i)}
              hitSlop={{ top: 10, bottom: 10 }}
              style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: i === page ? nuit.rouge : valides.includes(x.id) ? nuit.vert : '#2A2D36' }}
            />
          ))}
        </View>
      </View>

      <DefilementClavier ref={defilement} style={{ flex: 1 }} contentContainerStyle={{ padding: 14, paddingTop: 8, paddingBottom: 140, gap: 12 }}>
        {!pret ? null : fin ? (
          <Bilan
            blocs={blocs}
            d={d}
            termine={termine}
            onAller={aller}
            onNote={(n) => maj((c) => ({ ...c, note: c.note === n ? null : n }))}
            onCommentaire={(com) => maj((c) => ({ ...c, com }))}
            commentaire={commentaire}
            difficulte={difficulte}
            onDifficulte={() => setDifficulte(!difficulte)}
            onAjouterDifficulte={ajouterDifficulte}
          />
        ) : (
          <>
            <View style={{ gap: 4 }}>
              <Text style={styles.kicker}>{enTeteBloc(b)}</Text>
              <Text style={styles.titreBloc}>{titreBloc(b.titre) || `Bloc ${page + 1}`}</Text>
              {!!consigneBloc(b) && <Text style={styles.doux}>{consigneBloc(b)}</Text>}
              {!!b.description && <Text style={styles.doux}>{b.description}</Text>}
              {(!!b.tempo || !!b.contraction) && (
                <View style={styles.puces}>
                  {!!b.tempo && <Puce texte={`Tempo ${b.tempo}`} />}
                  {!!b.contraction && <Puce texte={b.contraction} />}
                </View>
              )}
              {minuteurBloc && (
                <View style={{ alignSelf: 'flex-start', marginTop: 4 }}>
                  <Bouton
                    contour
                    icone={Timer}
                    libelle={`Chrono · ${resumeMinuteur(minuteurBloc)}`}
                    onPress={() =>
                      router.push({
                        pathname: '/client/minuteur',
                        params: { config: JSON.stringify(minuteurBloc), titre: b.titre, noms: JSON.stringify(b.lignes.map((l) => faite(l).exercice.nom)) },
                      })
                    }
                  />
                </View>
              )}
            </View>
            {b.lignes.map((l, i) => (
              <View key={l.id} style={{ gap: 12 }}>
                {i > 0 && enchaine(b) && <Separateur texte="puis, sans pause" />}
                <CarteExercice
                  l={faite(l)}
                  prevu={remplacements[l.id] ? l.exercice.nom : undefined}
                  tag={enchaine(b) ? lettre(i) : undefined}
                  tours={enchaine(b)}
                  d={d}
                  precedentes={precedentes(l)}
                  references={references}
                  onChanger={(k, m, v) => maj((c) => ({ ...c, vals: { ...c.vals, [k]: { ...c.vals[k], [m]: v } } }))}
                  onValider={(n) => maj((c) => validerSeries(c, faite(l), precedentes(l), n))}
                  onRemplir={(charge) =>
                    maj((c) => {
                      const vals = { ...c.vals };
                      for (let n = 1; n <= Math.max(1, l.series); n++) {
                        const k = `${l.id}:${n}`;
                        if (!vals[k]?.charge?.trim()) vals[k] = { ...vals[k], charge: String(charge) };
                      }
                      return { ...c, vals };
                    })
                  }
                  onRemplacer={() => setARemplacer(l)}
                />
              </View>
            ))}
            {fautifBloc(b) && (
              <Text accessibilityRole="alert" style={{ fontFamily: polices.texte, fontSize: 12, color: nuit.rougeDoux }}>
                Charge : de 0 à 1 000 kg. Répétitions, durée en secondes et calories : nombres entiers. Distance en mètres.
              </Text>
            )}
          </>
        )}
      </DefilementClavier>

      <View style={[styles.pied, { paddingBottom: marges.bottom + 14 }]}>
        {repos && <BandeauRepos repos={repos} onFin={() => setRepos(null)} onPasser={arreterRepos} />}
        {etat === 'erreur' && (
          <Text accessibilityRole="alert" style={{ fontFamily: polices.texte, fontSize: 13, color: nuit.rougeDoux }}>
            {erreur} Ta séance est gardée sur ce téléphone : réessaie.
          </Text>
        )}
        <View style={{ flexDirection: 'row', gap: 10 }}>
          {fin ? (
            termine ? (
              <Principal libelle="Retour à l’accueil" couleur={nuit.vert} onPress={onQuitter} />
            ) : (
              <Principal
                libelle={etat === 'envoi' ? 'Enregistrement…' : 'Enregistrer la séance'}
                couleur={nuit.vert}
                desactive={etat === 'envoi' || (!sale(d) && !valides.length)}
                onPress={enregistrer}
              />
            )
          ) : (
            <>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Lancer le repos de ${dureeRepos(reposDuBloc(b))}`}
                onPress={() => lancerRepos(reposDuBloc(b), titreBloc(b.titre) || `bloc ${page + 1}`)}
                style={({ pressed }) => [styles.secondaire, pressed && { opacity: 0.8 }]}
              >
                <Timer size={16} color={nuit.texte} />
                <Text style={styles.secondaireTexte}>Repos</Text>
              </Pressable>
              <Principal
                libelle={page === blocs.length - 1 ? 'Valider et terminer' : 'Valider le bloc'}
                fleche
                desactive={fautifBloc(b)}
                onPress={() => validerBloc(b)}
              />
            </>
          )}
        </View>
      </View>

      {aRemplacer && (
        <FeuilleRemplacement
          l={aRemplacer}
          actuel={remplacements[aRemplacer.id]}
          onFermer={() => setARemplacer(null)}
          onChoisir={(r) => {
            const l = aRemplacer;
            // Les valeurs saisies pour l'autre exercice ne valent plus : on repart des cases vides.
            maj((c) => {
              const vals = { ...c.vals };
              for (let n = 1; n <= Math.max(1, l.series); n++) delete vals[`${l.id}:${n}`];
              const suite = { ...(c.remplacements ?? {}) };
              if (r) suite[l.id] = r;
              else delete suite[l.id];
              return { ...c, vals, remplacements: suite };
            });
            setARemplacer(null);
          }}
        />
      )}
    </View>
  );
}

/** La lueur en haut de l'écran : rouge pendant la séance, verte au bilan. */
function Lueur({ couleur }: { couleur: string }) {
  return (
    <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 340 }}>
      <Svg width="100%" height="100%">
        <Defs>
          <RadialGradient id="lueur" cx="50%" cy="12%" rx="75%" ry="85%" fx="50%" fy="12%">
            <Stop offset="0" stopColor={couleur} stopOpacity={0.4} />
            <Stop offset="0.65" stopColor={couleur} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#lueur)" />
      </Svg>
    </View>
  );
}

function Chrono({ debut, arret }: { debut: string; arret: boolean }) {
  const [maintenant, setMaintenant] = useState(maintenantMs);
  useEffect(() => {
    if (arret) return;
    const t = setInterval(() => setMaintenant(maintenantMs()), 1000);
    return () => clearInterval(t);
  }, [arret]);
  const s = Math.max(0, Math.floor((maintenant - new Date(debut).getTime()) / 1000));
  const h = Math.floor(s / 3600);
  const texte = `${h ? `${h}:` : ''}${String(Math.floor((s % 3600) / 60)).padStart(h ? 2 : 1, '0')}:${String(s % 60).padStart(2, '0')}`;
  return (
    <View accessibilityLabel={`Temps écoulé ${texte}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, minWidth: 64, justifyContent: 'flex-end' }}>
      <Timer size={14} color="#B7BAC3" />
      <Text style={[styles.enTeteDoux, { fontFamily: polices.chiffres }]}>{texte}</Text>
    </View>
  );
}

function Bouton({ icone: Icone, libelle, onPress, contour }: { icone: typeof X; libelle: string; onPress: () => void; contour?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => [
        { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 36 },
        contour && { borderWidth: 1, borderColor: nuit.bordureChamp, borderRadius: 10, paddingHorizontal: 10, backgroundColor: nuit.carte },
        pressed && { opacity: 0.7 },
      ]}
    >
      <Icone size={16} color={contour ? nuit.texte : '#B7BAC3'} />
      <Text style={[styles.enTeteDoux, contour && { color: nuit.texte }]}>{libelle}</Text>
    </Pressable>
  );
}

function Principal({ libelle, onPress, desactive, couleur = nuit.rouge, fleche }: { libelle: string; onPress: () => void; desactive?: boolean; couleur?: string; fleche?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!desactive }}
      disabled={desactive}
      onPress={onPress}
      style={({ pressed }) => [styles.principal, { backgroundColor: couleur, shadowColor: couleur }, desactive && { opacity: 0.45 }, pressed && { opacity: 0.85 }]}
    >
      <Text style={[styles.principalTexte, couleur === nuit.vert && { color: nuit.fond }]}>{libelle}</Text>
      {fleche && <ChevronRight size={18} color="#fff" />}
    </Pressable>
  );
}

const Puce = ({ texte }: { texte: string }) => <Text style={styles.puce}>{texte}</Text>;

function Separateur({ texte }: { texte: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <View style={{ flex: 1, height: 1, backgroundColor: '#2A2D36' }} />
      <Text style={[styles.doux, { fontSize: 12 }]}>{texte}</Text>
      <View style={{ flex: 1, height: 1, backgroundColor: '#2A2D36' }} />
    </View>
  );
}

function CarteExercice({
  l,
  prevu,
  tag,
  tours,
  d,
  precedentes,
  references,
  onChanger,
  onValider,
  onRemplir,
  onRemplacer,
}: {
  l: LignePrescription;
  /** Nom de l'exercice prévu par le coach, quand le client l'a remplacé. */
  prevu?: string;
  tag?: string;
  /** Superset, biset, circuit : une série est un tour (T1, T2…). */
  tours?: boolean;
  d: Brouillon;
  precedentes: Record<number, Valeurs>;
  references: Reference[];
  onChanger: (k: string, m: Mesure, v: string) => void;
  onValider: (n?: number) => void;
  onRemplir: (charge: number) => void;
  onRemplacer: () => void;
}) {
  const champs = champsSaisie(l);
  const numeros = Array.from({ length: Math.max(1, l.series) }, (_, i) => i + 1);
  const suggestion = champs[0].m === 'charge' && !prevu ? suggestionPourcentage(l.exercice.id, l.chargeIntensite ?? '', l.consignes ?? '', references) : null;
  const notes = prescriptionClient(l).split(' · ');
  const fait = (n: number) => champs.every((c) => !!d.vals[`${l.id}:${n}`]?.[c.m]?.trim() || proposition(l, c.m, precedentes[n]?.[c.m]) === undefined);
  const titre = (c: (typeof champs)[number]) => (c.m === 'charge' ? 'kg' : c.m === 'repetitions' ? 'Reps' : c.titre);

  return (
    <View accessibilityLabel={l.exercice.nom} style={styles.carte}>
      {l.exercice.videoUrl ? (
        <View>
          <VideoIntegree url={l.exercice.videoUrl} nom={l.exercice.nom} />
          {tag && <Text style={[styles.tag, { position: 'absolute', left: 10, top: 10 }]}>{tag}</Text>}
        </View>
      ) : null}
      <View style={{ padding: 12, gap: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
          {tag && !l.exercice.videoUrl && <Text style={styles.tag}>{tag}</Text>}
          <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
            <Text style={styles.nom}>{l.exercice.nom}</Text>
            {prevu && <Text style={{ fontFamily: polices.texte, fontSize: 12, color: nuit.orange }}>⇄ À la place de {prevu}</Text>}
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Remplacer ${l.exercice.nom}`}
            onPress={onRemplacer}
            hitSlop={6}
            style={({ pressed }) => [styles.remplacer, pressed && { opacity: 0.7 }]}
          >
            <ArrowLeftRight size={13} color={nuit.rougeDoux} />
            <Text style={{ fontFamily: polices.texteMoyen, fontSize: 12, color: nuit.rougeDoux }}>Remplacer</Text>
          </Pressable>
        </View>
        <View style={styles.puces}>
          {notes.map((n) => (
            <Puce key={n} texte={n} />
          ))}
        </View>
        {!!l.consignes?.trim() && <Text style={[styles.doux, { color: '#C9CCD3' }]}>{l.consignes.trim()}</Text>}
        {l.minuteur && (
          <View style={{ alignSelf: 'flex-start' }}>
            <Bouton
              contour
              icone={Timer}
              libelle={`Chrono · ${resumeMinuteur(l.minuteur)}`}
              onPress={() => router.push({ pathname: '/client/minuteur', params: { config: JSON.stringify(l.minuteur), titre: l.exercice.nom } })}
            />
          </View>
        )}
        {suggestion?.rm != null && suggestion.chargeMin !== null && (
          <Pressable accessibilityRole="button" onPress={() => onRemplir(suggestion.chargeMin!)} style={styles.suggestion}>
            <Text style={{ fontFamily: polices.texte, fontSize: 12, color: '#D9DBE0', flex: 1 }}>
              Suggestion : {suggestion.chargeMin}
              {suggestion.chargeMax !== suggestion.chargeMin ? `–${suggestion.chargeMax}` : ''} kg ({suggestion.pourcentMin} % de ton 1RM)
            </Text>
            <Text style={{ fontFamily: polices.texteMoyen, fontSize: 12, color: nuit.rougeDoux }}>Utiliser</Text>
          </Pressable>
        )}

        <View style={{ flexDirection: 'row', gap: 6, marginTop: 2 }}>
          <View style={{ width: 28 }} />
          {champs.map((c) => (
            <Text key={c.m} numberOfLines={1} style={[styles.doux, { flex: 1, fontSize: 11 }]}>
              {titre(c)}
            </Text>
          ))}
          <View style={{ width: 36 }} />
        </View>
        {numeros.map((n) => {
          const k = `${l.id}:${n}`;
          const v = d.vals[k] ?? {};
          const ok = fait(n) && champs.some((c) => !!v[c.m]?.trim());
          return (
            <View key={n} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={{ width: 28, fontFamily: polices.texteGras, fontSize: 13, color: '#C9CCD3' }}>{tours ? `T${n}` : `S${n}`}</Text>
              {champs.map((c) => {
                const p = proposition(l, c.m, precedentes[n]?.[c.m]);
                return (
                  <TextInput
                    key={c.m}
                    accessibilityLabel={`${l.exercice.nom}, série ${n}, ${c.titre.toLowerCase().replace(/ \(.*\)/, '')}`}
                    aria-invalid={invalide(c, v[c.m])}
                    inputMode={c.decimal ? 'decimal' : 'numeric'}
                    keyboardType={c.decimal ? 'decimal-pad' : 'number-pad'}
                    placeholder={p !== undefined ? String(p).replace('.', ',') : c.unite}
                    placeholderTextColor={nuit.propose}
                    value={v[c.m] ?? ''}
                    onChangeText={(x) => onChanger(k, c.m, x)}
                    style={[styles.champ, invalide(c, v[c.m]) && { borderColor: nuit.rouge }]}
                  />
                );
              })}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={ok ? `Série ${n} validée` : `Valider la série ${n} de ${l.exercice.nom}`}
                onPress={() => onValider(n)}
                hitSlop={6}
                style={[styles.coche, ok && { backgroundColor: nuit.vert, borderColor: nuit.vert }]}
              >
                <Check size={15} color={ok ? nuit.fond : '#4A4E59'} strokeWidth={3} />
              </Pressable>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function BandeauRepos({ repos, onFin, onPasser }: { repos: Repos; onFin: () => void; onPasser: () => void }) {
  const [maintenant, setMaintenant] = useState(maintenantMs);
  useEffect(() => {
    const t = setInterval(() => setMaintenant(maintenantMs()), 250);
    return () => clearInterval(t);
  }, []);
  // Calculé depuis l'heure de fin : reste juste si l'appli passe en arrière-plan.
  const restant = Math.max(0, Math.ceil((repos.finMs - maintenant) / 1000));
  useEffect(() => {
    if (restant === 0) {
      vibrer();
      onFin();
    }
  }, [restant, onFin]);
  return (
    <View accessibilityRole={'timer' as never} style={styles.repos}>
      <View style={{ flex: 1 }}>
        <Text style={[styles.doux, { fontSize: 12 }]}>Repos · {repos.libelle}</Text>
        <Text style={{ fontFamily: polices.chiffres, fontSize: 26, color: nuit.texte }}>
          {Math.floor(restant / 60)}:{String(restant % 60).padStart(2, '0')}
        </Text>
      </View>
      <Pressable accessibilityRole="button" onPress={onPasser} style={({ pressed }) => [styles.secondaire, { flex: 0, paddingHorizontal: 16 }, pressed && { opacity: 0.8 }]}>
        <Text style={styles.secondaireTexte}>Passer</Text>
      </Pressable>
    </View>
  );
}

function Bilan({
  blocs,
  d,
  termine,
  onAller,
  onNote,
  onCommentaire,
  commentaire,
  difficulte,
  onDifficulte,
  onAjouterDifficulte,
}: {
  blocs: Bloc[];
  d: Brouillon;
  termine: boolean;
  onAller: (n: number) => void;
  onNote: (n: number) => void;
  onCommentaire: (v: string) => void;
  commentaire: React.RefObject<ComponentRef<typeof TextInput> | null>;
  difficulte: boolean;
  onDifficulte: () => void;
  onAjouterDifficulte: (x: string) => void;
}) {
  const valides = d.valides ?? [];
  const kg = tonnage(d.vals);
  const [fin] = useState(maintenantMs);
  return (
    <>
      <View style={{ gap: 2 }}>
        <Text style={[styles.kicker, { color: nuit.vert }]}>{termine ? 'Séance enregistrée' : 'Bravo !'}</Text>
        <Text style={styles.titreBloc}>{termine ? 'À la prochaine !' : 'Séance terminée'}</Text>
        {termine && <Text style={styles.doux}>Ton coach voit ta séance, tes charges et ton ressenti.</Text>}
      </View>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Stat valeur={dureeSeance(d.debut, fin)} libelle="durée" />
        <Stat valeur={`${blocs.filter((b) => valides.includes(b.id)).length}/${blocs.length}`} libelle="blocs" />
        {kg > 0 && <Stat valeur={`${kg.toLocaleString('fr-FR')} kg`} libelle="soulevés" />}
      </View>
      <View style={[styles.carte, { padding: 12, gap: 8 }]}>
        {blocs.map((b, i) => {
          const ok = valides.includes(b.id);
          return (
            <View key={b.id} style={{ gap: 6 }}>
              <Pressable accessibilityRole="button" disabled={termine} onPress={() => onAller(i)} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 28 }}>
                <Text style={{ flex: 1, fontFamily: polices.texte, fontSize: 14, color: '#D9DBE0' }} numberOfLines={1}>
                  {i + 1} · {titreBloc(b.titre) || b.lignes.map((l) => l.exercice.nom).join(' + ')}
                </Text>
                {ok ? <CheckCircle2 size={18} color={nuit.vert} /> : <Text style={{ fontFamily: polices.texteMoyen, fontSize: 12, color: nuit.rougeDoux }}>à faire</Text>}
              </Pressable>
              {b.lignes
                .filter((l) => d.remplacements?.[l.id])
                .map((l) => (
                  <Text key={l.id} style={styles.changement}>
                    ⇄ {l.exercice.nom} → {d.remplacements![l.id].exercice.nom} ({d.remplacements![l.id].raison.toLowerCase()})
                  </Text>
                ))}
            </View>
          );
        })}
      </View>
      {!termine && (
        <View style={[styles.carte, { padding: 12, gap: 10 }]}>
          <Text style={styles.nom}>
            Ressenti (effort perçu) <Text style={{ fontFamily: polices.chiffres, color: nuit.doux }}>{d.note ?? '—'}/10</Text>
          </Text>
          <Text style={[styles.doux, { fontSize: 12 }]}>1 = très facile · 10 = effort maximal. Facultatif.</Text>
          <View accessibilityRole="radiogroup" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'space-between' }}>
            {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
              <Pressable
                key={n}
                accessibilityRole="radio"
                accessibilityLabel={`Ressenti ${n} sur 10`}
                accessibilityState={{ checked: d.note === n }}
                onPress={() => onNote(n)}
                style={[styles.note, d.note === n && { backgroundColor: nuit.rouge, borderColor: nuit.rouge }]}
              >
                <Text style={{ fontFamily: polices.texteMoyen, fontSize: 14, color: d.note === n ? '#fff' : '#D9DBE0' }}>{n}</Text>
              </Pressable>
            ))}
          </View>
          <Pressable accessibilityRole="button" onPress={onDifficulte} style={{ alignSelf: 'flex-start', minHeight: 32, justifyContent: 'center' }}>
            <Text style={{ fontFamily: polices.texteMoyen, fontSize: 13, color: nuit.rougeDoux }}>Signaler une difficulté</Text>
          </Pressable>
          {difficulte && (
            <View style={styles.puces}>
              {DIFFICULTES.map((x) => (
                <Pressable key={x} accessibilityRole="button" onPress={() => onAjouterDifficulte(x)} style={styles.choix}>
                  <Text style={styles.choixTexte}>{x}</Text>
                </Pressable>
              ))}
            </View>
          )}
          <TextInput
            ref={commentaire}
            multiline
            maxLength={1000}
            accessibilityLabel="Commentaire pour le coach"
            placeholder="Un mot pour ton coach (facultatif)"
            placeholderTextColor={nuit.propose}
            value={d.com}
            onChangeText={onCommentaire}
            style={[styles.champ, { height: undefined, minHeight: 72, paddingTop: 10, textAlignVertical: 'top', flex: 0 }]}
          />
        </View>
      )}
    </>
  );
}

function Stat({ valeur, libelle }: { valeur: string; libelle: string }) {
  return (
    <View style={[styles.carte, { flex: 1, alignItems: 'center', paddingVertical: 10, paddingHorizontal: 4 }]}>
      <Text style={{ fontFamily: polices.titre, fontSize: 26, color: nuit.texte, letterSpacing: 0.5 }} numberOfLines={1} adjustsFontSizeToFit>
        {valeur}
      </Text>
      <Text style={[styles.doux, { fontSize: 11.5 }]}>{libelle}</Text>
    </View>
  );
}

/** Choisir un autre exercice : la raison, les exercices similaires du catalogue, ou une recherche par nom. */
function FeuilleRemplacement({
  l,
  actuel,
  onFermer,
  onChoisir,
}: {
  l: LignePrescription;
  actuel?: Remplacement;
  onFermer: () => void;
  /** null : revenir à l'exercice prévu par le coach. */
  onChoisir: (r: Remplacement | null) => void;
}) {
  const catalogue = useCharger(() => depot.catalogue(), 'catalogue');
  const [raison, setRaison] = useState<string>(actuel?.raison ?? RAISONS_REMPLACEMENT[0]);
  const [recherche, setRecherche] = useState('');
  const [choisi, setChoisi] = useState<Exercice | undefined>();
  const marges = useSafeAreaInsets();
  const proposes = useMemo(() => {
    const liste = catalogue.donnee ?? [];
    return recherche.trim() ? rechercherExercices(liste, recherche, undefined, 20).exercices.filter((e) => e.id !== l.exercice.id) : similaires(liste, l.exercice, 4);
  }, [catalogue.donnee, recherche, l.exercice]);

  return (
    <Modal transparent animationType="slide" visible onRequestClose={onFermer}>
      <Pressable accessibilityLabel="Fermer" onPress={onFermer} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' }} />
      <View style={[styles.feuille, { paddingBottom: marges.bottom + 16 }]}>
        <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: '#3A3E49', alignSelf: 'center' }} />
        <Text style={[styles.nom, { fontSize: 17 }]}>Remplacer « {l.exercice.nom} »</Text>
        <View style={{ gap: 6 }}>
          <Text style={[styles.doux, { fontSize: 12.5 }]}>Pourquoi ?</Text>
          <View style={styles.puces}>
            {RAISONS_REMPLACEMENT.map((x) => (
              <Pressable
                key={x}
                accessibilityRole="radio"
                accessibilityState={{ checked: raison === x }}
                onPress={() => setRaison(x)}
                style={[styles.choix, raison === x && { backgroundColor: nuit.rouge, borderColor: nuit.rouge }]}
              >
                <Text style={[styles.choixTexte, raison === x && { color: '#fff' }]}>{x}</Text>
              </Pressable>
            ))}
          </View>
        </View>
        <View style={[styles.recherche, !!recherche && { borderColor: nuit.rouge }]}>
          <Search size={16} color={nuit.propose} />
          <TextInput
            accessibilityLabel="Chercher un exercice par son nom"
            placeholder="Chercher un exercice par son nom…"
            placeholderTextColor={nuit.propose}
            value={recherche}
            onChangeText={setRecherche}
            autoCorrect={false}
            style={{ flex: 1, height: 42, fontFamily: polices.texte, fontSize: 15, color: nuit.texte }}
          />
          {!!recherche && (
            <Pressable accessibilityRole="button" accessibilityLabel="Effacer la recherche" onPress={() => setRecherche('')} hitSlop={8}>
              <X size={16} color={nuit.doux} />
            </Pressable>
          )}
        </View>
        <Text style={[styles.doux, { fontSize: 12.5 }]}>
          {catalogue.erreur
            ? catalogue.erreur
            : !catalogue.donnee
              ? 'Chargement des exercices…'
              : recherche.trim()
                ? `${proposes.length} résultat${proposes.length > 1 ? 's' : ''}`
                : proposes.length
                  ? 'Similaires (mêmes muscles) :'
                  : 'Tape le nom d’un exercice pour le trouver.'}
        </Text>
        <ScrollView style={{ maxHeight: 260 }} contentContainerStyle={{ gap: 8 }} keyboardShouldPersistTaps="handled">
          {proposes.map((e) => (
            <Pressable
              key={e.id}
              accessibilityRole="radio"
              accessibilityState={{ checked: choisi?.id === e.id }}
              onPress={() => setChoisi(e)}
              style={[styles.alternative, choisi?.id === e.id && { borderColor: nuit.rouge, backgroundColor: '#2A1416' }]}
            >
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[styles.nom, { fontSize: 14 }]}>{e.nom}</Text>
                <Text style={[styles.doux, { fontSize: 12 }]} numberOfLines={1}>
                  {[e.famille, ...(e.materiel ?? [])].filter(Boolean).join(' · ')}
                </Text>
              </View>
              {choisi?.id === e.id && <CheckCircle2 size={18} color={nuit.rouge} />}
            </Pressable>
          ))}
        </ScrollView>
        <Text style={styles.info}>Mêmes séries et répétitions que prévu. Ton coach verra le remplacement et la raison.</Text>
        {actuel && (
          <Pressable accessibilityRole="button" onPress={() => onChoisir(null)} style={{ alignSelf: 'center', minHeight: 32, justifyContent: 'center' }}>
            <Text style={{ fontFamily: polices.texteMoyen, fontSize: 13, color: nuit.orange }}>Revenir à l’exercice prévu par mon coach</Text>
          </Pressable>
        )}
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Pressable accessibilityRole="button" onPress={onFermer} style={({ pressed }) => [styles.secondaire, pressed && { opacity: 0.8 }]}>
            <Text style={styles.secondaireTexte}>Annuler</Text>
          </Pressable>
          <Principal
            libelle="Remplacer"
            desactive={!choisi}
            onPress={() =>
              choisi &&
              onChoisir({
                exercice: { id: choisi.id, nom: choisi.nom, videoUrl: choisi.videoUrl, famille: choisi.famille, materiel: choisi.materiel, muscles: choisi.muscles },
                raison,
              })
            }
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  enTeteDoux: { fontFamily: polices.texte, fontSize: 13.5, color: '#B7BAC3' },
  titreSeance: { fontFamily: polices.titre, fontSize: 20, letterSpacing: 0.8, color: '#FFFFFF' },
  kicker: { fontFamily: polices.texteGras, fontSize: 11, letterSpacing: 0.9, textTransform: 'uppercase', color: '#FF5A5F' },
  titreBloc: { fontFamily: polices.titre, fontSize: 32, letterSpacing: 0.6, lineHeight: 34, color: '#FFFFFF' },
  doux: { fontFamily: polices.texte, fontSize: 13, color: nuit.doux },
  puces: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  puce: { fontFamily: polices.texteMoyen, fontSize: 12, color: '#D9DBE0', backgroundColor: '#262932', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, overflow: 'hidden' },
  carte: { backgroundColor: nuit.carte, borderWidth: 1, borderColor: nuit.bordure, borderRadius: 14, overflow: 'hidden' },
  tag: { fontFamily: polices.texteGras, fontSize: 12, color: '#fff', backgroundColor: nuit.rouge, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2, overflow: 'hidden' },
  nom: { fontFamily: polices.texteGras, fontSize: 15.5, color: '#FFFFFF' },
  remplacer: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderColor: '#5A2427', borderRadius: 8, paddingHorizontal: 8, minHeight: 30 },
  champ: {
    flex: 1,
    minWidth: 0,
    height: 42,
    borderWidth: 1,
    borderColor: nuit.bordureChamp,
    backgroundColor: nuit.champ,
    borderRadius: 9,
    paddingHorizontal: 10,
    fontFamily: polices.texte,
    fontSize: 16,
    color: '#FFFFFF',
  },
  coche: { width: 36, height: 36, borderRadius: 18, borderWidth: 2, borderColor: '#3A3E49', alignItems: 'center', justifyContent: 'center' },
  suggestion: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 10, borderWidth: 1, borderColor: '#5A2427', backgroundColor: '#2A1416', padding: 10 },
  pied: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 14, paddingTop: 12, gap: 10, backgroundColor: 'rgba(14,15,19,0.96)', borderTopWidth: 1, borderTopColor: '#1E2027' },
  principal: {
    flex: 1,
    height: 52,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    shadowOpacity: 0.35,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  principalTexte: { fontFamily: polices.texteGras, fontSize: 16, color: '#FFFFFF' },
  secondaire: { flex: 0, minWidth: 96, height: 52, borderRadius: 12, borderWidth: 1, borderColor: nuit.bordureChamp, backgroundColor: '#1C1E25', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  secondaireTexte: { fontFamily: polices.texteGras, fontSize: 15, color: nuit.texte },
  repos: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: nuit.carte, borderWidth: 1, borderColor: nuit.bordure, borderRadius: 14, padding: 12 },
  note: { width: '18%', height: 38, borderRadius: 8, borderWidth: 1, borderColor: nuit.bordureChamp, alignItems: 'center', justifyContent: 'center' },
  choix: { borderWidth: 1, borderColor: '#3A3E49', borderRadius: 18, paddingHorizontal: 12, minHeight: 34, justifyContent: 'center' },
  choixTexte: { fontFamily: polices.texteMoyen, fontSize: 13, color: '#D9DBE0' },
  changement: { fontFamily: polices.texte, fontSize: 12, color: nuit.orange, backgroundColor: '#2B1C10', borderRadius: 8, padding: 8, overflow: 'hidden' },
  feuille: { backgroundColor: nuit.carte, borderTopWidth: 1, borderTopColor: '#2A2D36', borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 16, gap: 12 },
  recherche: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: '#3A3E49', backgroundColor: nuit.champ, borderRadius: 10, paddingHorizontal: 12 },
  alternative: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: '#2A2D36', backgroundColor: nuit.champ, borderRadius: 12, padding: 10, minHeight: 52 },
  info: { fontFamily: polices.texte, fontSize: 12, color: '#7FDCA4', backgroundColor: '#11281B', borderRadius: 10, padding: 10, overflow: 'hidden' },
});
