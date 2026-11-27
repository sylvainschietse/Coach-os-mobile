// Séance en direct, côté coach : pendant une séance en présentiel, le coach note ce que fait son client au fur et à
// mesure, sur son téléphone. Il part d'une séance vierge ou d'une séance du programme en cours, ajoute des exercices
// du catalogue, et pour chaque série saisit la charge et les répétitions (ou la durée). Le repos se chronomètre tout
// seul entre deux séries cochées. À la fin, la séance part dans l'historique et les progrès du client.
// La saisie est gardée sur le téléphone à chaque geste : une coupure ou un appel ne fait rien perdre.
import { Check, ChevronLeft, Plus, Search, Timer, Trash2, X } from '@/ui/icones';
import { useEffect, useMemo, useRef, useState, type ComponentRef } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { depot } from '@/data';
import { entrainement } from '@/data/entrainement';
import { prescriptionClient, titreClient } from '@/domain/entrainement';
import type { EspaceEntrainement } from '@/domain/entrainement-etat';
import { familles, rechercherExercices } from '@/domain/programmes';
import {
  ajouterExercice,
  ajouterSerie,
  bilan,
  changerRepos,
  cocher,
  construireEnvoi,
  depuisSeance,
  derniereFaite,
  derniereFois,
  ecrireDuree,
  exercicesRecents,
  LIBELLES_MESURES,
  mesuresDe,
  nbSeriesNotees,
  retirerExercice,
  retirerSerie,
  saisir,
  seanceVierge,
  type BilanDirect,
  type ExerciceDirect,
  type SeanceDirecte,
} from '@/domain/seance-direct';
import type { Exercice, Seance } from '@/domain/types';
import { ecrireBrouillon, libererBrouillon, lireBrouillon } from '@/lib/brouillon';
import { nouvelId } from '@/lib/identifiant';
import { maintenantMs } from '@/lib/temps';
import { messageErreur, useCharger } from '@/lib/useCharger';
import { vibrer } from '@/lib/vibrer';

import { DefilementClavier } from '../clavier';
import { couleurs, polices } from '../theme';
import { Lueur, nuit, Principal } from './seance-blocs';

/** Ce qui est gardé sur le téléphone pendant la séance. Les identifiants sont créés une fois : un renvoi ne double rien. */
interface Brouillon {
  seance: SeanceDirecte;
  realisationId: string;
  seanceDirecteId: string;
  blocId: string;
}
const cleBrouillon = (clientId: string) => `coachos.seance-direct.${clientId}`;

const RESSENTI: { note: number; libelle: string }[] = [
  { note: 3, libelle: 'Facile' },
  { note: 5, libelle: 'Modéré' },
  { note: 7, libelle: 'Difficile' },
  { note: 9, libelle: 'Très dur' },
];

const heure = (ms: number) => new Date(ms).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' });
const fr = (n: number) => n.toLocaleString('fr-FR', { maximumFractionDigits: 0 });

function useMaintenant(actif = true) {
  const [m, setM] = useState(maintenantMs);
  useEffect(() => {
    if (!actif) return;
    const t = setInterval(() => setM(maintenantMs()), 1000);
    return () => clearInterval(t);
  }, [actif]);
  return m;
}

function chrono(s: number) {
  const h = Math.floor(s / 3600);
  return `${h ? `${h}:` : ''}${String(Math.floor((s % 3600) / 60)).padStart(h ? 2 : 1, '0')}:${String(s % 60).padStart(2, '0')}`;
}

export function SeanceEnDirect({ coachId, clientId, prenom, onQuitter }: { coachId: string; clientId: string; prenom: string; onQuitter: () => void }) {
  const cle = cleBrouillon(clientId);
  const [brouillon, setBrouillon] = useState<Brouillon | null>();
  const espace = useCharger(() => entrainement.espaceClient(clientId), `espace-${clientId}`);

  useEffect(() => {
    let vivant = true;
    lireBrouillon<Brouillon>(cle).then((b) => vivant && setBrouillon(b?.seance?.clientId === clientId ? b : null));
    return () => {
      vivant = false;
      libererBrouillon(cle);
    };
  }, [cle, clientId]);

  const cycleEnCours = espace.donnee?.cycle?.etat === 'en_cours' ? espace.donnee.cycle.id : undefined;
  const demarrer = (seance: SeanceDirecte) => {
    const b = { seance, realisationId: nouvelId(), seanceDirecteId: nouvelId(), blocId: nouvelId() };
    ecrireBrouillon(cle, b);
    setBrouillon(b);
  };

  if (brouillon === undefined) return <Attente />;
  if (!brouillon)
    return (
      <Depart
        prenom={prenom}
        espace={espace.donnee}
        erreur={espace.erreur}
        onQuitter={onQuitter}
        onVierge={() => demarrer(seanceVierge(clientId, maintenantMs(), cycleEnCours))}
        onSeance={(s) =>
          demarrer(
            depuisSeance(clientId, s, maintenantMs(), nouvelId, {
              cycleId: cycleEnCours,
              titre: titreClient(s.titre),
              prescription: prescriptionClient,
            }),
          )
        }
      />
    );
  return (
    <EnCours
      key={brouillon.realisationId}
      coachId={coachId}
      prenom={prenom}
      brouillon={brouillon}
      historique={espace.donnee?.realisations ?? []}
      onChanger={(seance) => {
        const b = { ...brouillon, seance };
        ecrireBrouillon(cle, b);
        setBrouillon(b);
      }}
      onAbandonner={() => {
        ecrireBrouillon(cle, null);
        onQuitter();
      }}
      onEnregistree={() => ecrireBrouillon(cle, null)}
      onQuitter={() => {
        libererBrouillon(cle);
        onQuitter();
      }}
    />
  );
}

function Attente() {
  return (
    <View style={[styles.page, { alignItems: 'center', justifyContent: 'center' }]}>
      <ActivityIndicator color={nuit.texte} />
    </View>
  );
}

// ---------- Départ : séance vierge ou séance du programme ----------

function Depart({
  prenom,
  espace,
  erreur,
  onQuitter,
  onVierge,
  onSeance,
}: {
  prenom: string;
  espace: EspaceEntrainement | null;
  erreur: string | null;
  onQuitter: () => void;
  onVierge: () => void;
  onSeance: (s: Seance) => void;
}) {
  const insets = useSafeAreaInsets();
  const enCours = espace?.cycle;
  return (
    <View style={styles.page}>
      <Lueur couleur={nuit.rouge} />
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 12, paddingHorizontal: 16, paddingBottom: insets.bottom + 32, gap: 14 }}>
        <Pressable accessibilityRole="button" onPress={onQuitter} hitSlop={12} style={styles.retour}>
          <ChevronLeft size={20} color={nuit.texteSecondaire} />
          <Text style={styles.retourTexte}>Retour</Text>
        </Pressable>
        <View>
          <Text style={styles.kicker}>Séance en direct</Text>
          <Text style={styles.titre}>Avec {prenom}</Text>
          <Text style={[styles.doux, { marginTop: 6 }]}>Tu notes au fur et à mesure ce que fait {prenom} : exercices, charges, répétitions et temps de repos.</Text>
        </View>

        <Pressable accessibilityRole="button" onPress={onVierge} style={({ pressed }) => [styles.choix, pressed && { opacity: 0.85 }]}>
          <View style={styles.choixIcone}>
            <Plus size={22} color={nuit.texte} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.choixTitre}>Séance vierge</Text>
            <Text style={styles.doux}>Tu ajoutes les exercices au fil de la séance.</Text>
          </View>
        </Pressable>

        <Text style={styles.groupe}>Ou une séance de son programme</Text>
        {erreur && <Text style={styles.erreur}>{erreur}</Text>}
        {!espace && !erreur && <ActivityIndicator color={nuit.texte} />}
        {espace && (!enCours || !espace.seances.length) && (
          <Text style={styles.doux}>{prenom} n’a pas de programme en cours. Pars d’une séance vierge.</Text>
        )}
        {enCours && espace.programme && espace.seances.length > 0 && (
          <Text style={[styles.doux, { marginTop: -6 }]}>
            {titreClient(espace.programme.titre)}
            {enCours.semaine ? ` · semaine ${enCours.semaine}` : ''}
          </Text>
        )}
        {enCours &&
          espace.seances.map((s) => {
            const nb = s.blocs.reduce((n, b) => n + b.lignes.length, 0);
            const derniere = espace.realisations.find((r) => r.seanceId === s.id);
            return (
              <Pressable key={s.id} accessibilityRole="button" onPress={() => onSeance(s)} style={({ pressed }) => [styles.carte, pressed && { opacity: 0.85 }]}>
                <Text style={styles.nom}>{titreClient(s.titre)}</Text>
                <Text style={styles.petit}>
                  {nb} exercice{nb > 1 ? 's' : ''}
                  {derniere ? ` · faite le ${new Date(derniere.fin).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', timeZone: 'Europe/Paris' })}` : ''}
                </Text>
              </Pressable>
            );
          })}
      </ScrollView>
    </View>
  );
}

// ---------- Séance en cours ----------

function EnCours({
  coachId,
  prenom,
  brouillon,
  historique,
  onChanger,
  onAbandonner,
  onEnregistree,
  onQuitter,
}: {
  coachId: string;
  prenom: string;
  brouillon: Brouillon;
  historique: EspaceEntrainement['realisations'];
  onChanger: (s: SeanceDirecte) => void;
  onAbandonner: () => void;
  onEnregistree: () => void;
  onQuitter: () => void;
}) {
  const insets = useSafeAreaInsets();
  const s = brouillon.seance;
  const [ajout, setAjout] = useState(false);
  const [fin, setFin] = useState(false);
  const [quitter, setQuitter] = useState(false);
  const [reposMasque, setReposMasque] = useState<string>();
  const maintenant = useMaintenant();
  const defilement = useRef<ComponentRef<typeof ScrollView>>(null);
  const precedente = useRef(s.exercices.length);

  // Un exercice ajouté arrive en bas : on y descend.
  useEffect(() => {
    if (s.exercices.length > precedente.current) setTimeout(() => defilement.current?.scrollToEnd({ animated: true }), 150);
    precedente.current = s.exercices.length;
  }, [s.exercices.length]);

  const derniere = derniereFaite(s);
  const exerciceRepos = derniere && s.exercices.find((e) => e.ligneId === derniere.ligneId);
  const repos = derniere && reposMasque !== derniere.serieId ? Math.max(0, Math.round((maintenant - derniere.faiteA) / 1000)) : undefined;
  const cible = exerciceRepos?.recuperationS;
  const sonne = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (derniere && cible && repos !== undefined && repos >= cible && sonne.current !== derniere.serieId) {
      sonne.current = derniere.serieId;
      vibrer();
    }
  }, [derniere, cible, repos]);

  if (fin)
    return (
      <Fin
        brouillon={brouillon}
        prenom={prenom}
        historique={historique}
        onReprendre={() => setFin(false)}
        onEnregistree={onEnregistree}
        onFermer={onQuitter}
      />
    );

  const nbSeries = nbSeriesNotees(s);
  return (
    <View style={styles.page}>
      <Lueur couleur={nuit.rouge} />
      <View style={[styles.barre, { paddingTop: insets.top + 10 }]}>
        <Pressable accessibilityRole="button" onPress={() => setQuitter(true)} hitSlop={12} style={styles.retour}>
          <X size={18} color={nuit.texteSecondaire} />
          <Text style={styles.retourTexte}>Quitter</Text>
        </Pressable>
        <Text style={styles.barreCentre} numberOfLines={1}>
          Avec <Text style={{ color: nuit.texte, fontFamily: polices.texteGras }}>{prenom}</Text>
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          <Timer size={15} color={nuit.texteSecondaire} />
          <Text style={styles.chrono}>{chrono(Math.max(0, Math.floor((maintenant - s.debut) / 1000)))}</Text>
        </View>
      </View>

      <DefilementClavier ref={defilement} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 200, gap: 12 }} keyboardShouldPersistTaps="handled">
        <View style={{ marginTop: 6 }}>
          <Text style={styles.kicker}>
            Séance en direct · {s.exercices.length} exercice{s.exercices.length > 1 ? 's' : ''}
          </Text>
          <TextInput
            value={s.titre}
            onChangeText={(t) => onChanger({ ...s, titre: t.slice(0, 160) })}
            style={styles.titreChamp}
            accessibilityLabel="Titre de la séance"
            multiline
          />
        </View>

        {s.exercices.map((e) => (
          <CarteExercice key={e.ligneId} e={e} historique={historique} seance={s} onChanger={onChanger} />
        ))}

        <Pressable accessibilityRole="button" onPress={() => setAjout(true)} style={({ pressed }) => [styles.ajout, pressed && { opacity: 0.8 }]}>
          <Plus size={20} color={nuit.texte} />
          <Text style={styles.ajoutTexte}>Ajouter un exercice</Text>
        </Pressable>
      </DefilementClavier>

      {repos !== undefined && derniere && repos <= 15 * 60 && (
        <View style={[styles.repos, { bottom: insets.bottom + 92 }]}>
          <View style={{ flex: 1 }}>
            <Text style={styles.petit} numberOfLines={1}>
              Repos depuis la série {derniere.numero} · {derniere.nom}
            </Text>
            <Text style={[styles.reposChiffre, cible && repos >= cible ? { color: nuit.vert } : null]}>
              {chrono(repos)}
              {cible ? <Text style={styles.reposCible}> / {ecrireDuree(cible)}</Text> : null}
            </Text>
          </View>
          <Pressable accessibilityRole="button" onPress={() => setReposMasque(derniere.serieId)} hitSlop={8} style={styles.puce}>
            <Text style={styles.puceTexte}>Masquer</Text>
          </Pressable>
        </View>
      )}

      <View style={[styles.bas, { paddingBottom: insets.bottom + 12 }]}>
        <Principal libelle={nbSeries ? `Terminer la séance · ${nbSeries} série${nbSeries > 1 ? 's' : ''}` : 'Terminer la séance'} onPress={() => setFin(true)} desactive={!nbSeries} />
      </View>

      <Modal visible={ajout} animationType="slide" transparent onRequestClose={() => setAjout(false)}>
        <ChoixExerciceDirect
          coachId={coachId}
          prenom={prenom}
          historique={historique}
          onFermer={() => setAjout(false)}
          onChoisir={(x) => {
            setAjout(false);
            onChanger(ajouterExercice(s, x, nouvelId));
          }}
        />
      </Modal>

      <Modal visible={quitter} animationType="fade" transparent onRequestClose={() => setQuitter(false)}>
        <View style={styles.voile}>
          <View style={styles.dialogue}>
            <Text style={styles.nom}>Quitter la séance ?</Text>
            <Text style={styles.doux}>Ta saisie reste sur ce téléphone : tu la retrouveras en revenant sur la séance en direct de {prenom}.</Text>
            <View style={{ flexDirection: 'row' }}>
              <Principal libelle="Garder et quitter" onPress={onQuitter} />
            </View>
            <Pressable accessibilityRole="button" onPress={onAbandonner} style={styles.lienLigne}>
              <Trash2 size={16} color={nuit.rougeDoux} />
              <Text style={styles.lien}>Abandonner cette séance</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={() => setQuitter(false)} style={styles.lienLigne}>
              <Text style={[styles.lien, { color: nuit.texteSecondaire }]}>Continuer la séance</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function CarteExercice({
  e,
  seance,
  historique,
  onChanger,
}: {
  e: ExerciceDirect;
  seance: SeanceDirecte;
  historique: EspaceEntrainement['realisations'];
  onChanger: (s: SeanceDirecte) => void;
}) {
  const mesures = mesuresDe(e.exercice);
  const avant = useMemo(() => derniereFois(historique, e.exercice.id), [historique, e.exercice.id]);
  const vide = !e.series.some((x) => x.faite || Object.values(x.valeurs).some((v) => v?.trim()));
  return (
    <View style={styles.carte}>
      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
        <View style={{ flex: 1 }}>
          <Text style={styles.nom}>{e.exercice.nom}</Text>
          {e.prescription ? <Text style={styles.petit}>Prévu : {e.prescription}</Text> : null}
          <Text style={styles.avant}>
            {avant ? (
              <>
                La dernière fois ({avant.date}) : <Text style={styles.avantFort}>{avant.texte}</Text>
              </>
            ) : (
              'Première fois sur cet exercice'
            )}
          </Text>
        </View>
        {vide && (
          <Pressable accessibilityRole="button" accessibilityLabel={`Retirer ${e.exercice.nom}`} hitSlop={10} onPress={() => onChanger(retirerExercice(seance, e.ligneId))}>
            <Trash2 size={18} color={nuit.doux} />
          </Pressable>
        )}
      </View>

      <View style={styles.entete}>
        <Text style={[styles.th, { width: 24 }]} />
        {mesures.map((m) => (
          <Text key={m} style={[styles.th, { flex: 1 }]}>
            {LIBELLES_MESURES[m]}
          </Text>
        ))}
        <Text style={[styles.th, { width: 58, textAlign: 'center' }]}>Repos</Text>
        <View style={{ width: 40 }} />
      </View>
      {e.series.map((x, i) => {
        const precedente = i > 0 ? e.series[i - 1] : undefined;
        return (
          <View key={x.id} style={styles.ligne}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Retirer la série ${i + 1}`}
              onLongPress={() => !x.faite && e.series.length > 1 && onChanger(retirerSerie(seance, e.ligneId, x.id))}
              style={{ width: 24 }}
            >
              <Text style={styles.numero}>{i + 1}</Text>
            </Pressable>
            {mesures.map((m) => (
              <TextInput
                key={m}
                value={x.valeurs[m] ?? ''}
                onChangeText={(t) => onChanger(saisir(seance, e.ligneId, x.id, m, t))}
                placeholder={precedente?.valeurs[m] || (i === 0 && avant ? avant.series[0]?.[m]?.toLocaleString('fr-FR') : undefined) || LIBELLES_MESURES[m]}
                placeholderTextColor={nuit.propose}
                keyboardType="decimal-pad"
                selectTextOnFocus
                accessibilityLabel={`${LIBELLES_MESURES[m]}, série ${i + 1}`}
                style={[styles.champ, x.faite && styles.champFait]}
              />
            ))}
            <TextInput
              value={x.reposS !== undefined ? ecrireDuree(x.reposS) : ''}
              onChangeText={(t) => onChanger(changerRepos(seance, e.ligneId, x.id, t))}
              placeholder="—"
              placeholderTextColor={nuit.propose}
              keyboardType="numbers-and-punctuation"
              accessibilityLabel={`Repos avant la série ${i + 1}, en minutes et secondes`}
              style={styles.reposChamp}
            />
            <Pressable
              accessibilityRole="checkbox"
              accessibilityState={{ checked: x.faite }}
              accessibilityLabel={`Série ${i + 1} faite`}
              hitSlop={6}
              onPress={() => onChanger(cocher(seance, e.ligneId, x.id, maintenantMs()))}
              style={[styles.coche, x.faite && styles.cocheFaite]}
            >
              <Check size={18} color={x.faite ? couleurs.blanc : nuit.doux} />
            </Pressable>
          </View>
        );
      })}
      <Pressable accessibilityRole="button" onPress={() => onChanger(ajouterSerie(seance, e.ligneId, nouvelId))} hitSlop={6} style={styles.lienLigne}>
        <Plus size={16} color={nuit.rougeDoux} />
        <Text style={styles.lien}>Ajouter une série</Text>
      </Pressable>
    </View>
  );
}

// ---------- Choix d'un exercice ----------

function ChoixExerciceDirect({
  coachId,
  prenom,
  historique,
  onChoisir,
  onFermer,
}: {
  coachId: string;
  prenom: string;
  historique: EspaceEntrainement['realisations'];
  onChoisir: (e: Exercice) => void;
  onFermer: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { donnee: catalogue, erreur } = useCharger(() => depot.catalogue(), 'catalogue');
  const [recherche, setRecherche] = useState('');
  const [famille, setFamille] = useState<string>();
  const [creation, setCreation] = useState(false);
  const [erreurCreation, setErreurCreation] = useState<string>();

  const listeFamilles = useMemo(() => (catalogue ? familles(catalogue) : []), [catalogue]);
  const resultat = useMemo(() => (catalogue ? rechercherExercices(catalogue, recherche, famille, 40) : { exercices: [], total: 0 }), [catalogue, recherche, famille]);
  const recents = useMemo(() => {
    if (!catalogue) return [];
    const parId = new Map(catalogue.map((e) => [e.id, e]));
    const trouves = new Set(resultat.exercices.map((e) => e.id));
    const filtre = recherche.trim() || famille;
    return exercicesRecents(historique)
      .map((id) => parId.get(id))
      .filter((e): e is Exercice => !!e && (!filtre || trouves.has(e.id)))
      .slice(0, 5);
  }, [catalogue, historique, resultat, recherche, famille]);
  const dejaVus = new Set(recents.map((e) => e.id));

  async function creer() {
    if (!recherche.trim()) return;
    setCreation(true);
    setErreurCreation(undefined);
    try {
      onChoisir(await depot.creerExercice(coachId, { nom: recherche.trim(), mesures: ['charge', 'repetitions'] }));
    } catch (e) {
      setErreurCreation(messageErreur(e));
    } finally {
      setCreation(false);
    }
  }

  const ligne = (e: Exercice, sousTitre?: string) => (
    <Pressable key={e.id} accessibilityRole="button" onPress={() => onChoisir(e)} style={({ pressed }) => [styles.resultat, pressed && { backgroundColor: nuit.surface }]}>
      <View style={{ flex: 1 }}>
        <Text style={styles.resultatNom}>{e.nom}</Text>
        <Text style={styles.petit} numberOfLines={1}>
          {sousTitre ?? [e.famille, e.muscles?.slice(0, 2).join(', ')].filter(Boolean).join(' · ')}
        </Text>
      </View>
      <View style={styles.plus}>
        <Plus size={18} color={nuit.texte} />
      </View>
    </Pressable>
  );

  return (
    <View style={styles.voileBas}>
      <View style={[styles.feuille, { paddingBottom: insets.bottom + 12, marginTop: insets.top + 40 }]}>
        <View style={styles.poignee} />
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={[styles.titre, { fontSize: 30 }]}>Ajouter un exercice</Text>
          <Pressable accessibilityRole="button" onPress={onFermer} hitSlop={12}>
            <Text style={styles.lien}>Fermer</Text>
          </Pressable>
        </View>
        <View style={styles.recherche}>
          <Search size={18} color={nuit.doux} />
          <TextInput
            value={recherche}
            onChangeText={setRecherche}
            placeholder="presse, tirage, squat…"
            placeholderTextColor={nuit.propose}
            autoFocus
            autoCorrect={false}
            accessibilityLabel="Rechercher un exercice"
            style={styles.rechercheChamp}
          />
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, flexShrink: 0 }} contentContainerStyle={{ gap: 8, paddingVertical: 10 }}>
          <Pressable onPress={() => setFamille(undefined)} style={[styles.puce, !famille && styles.puceActive]}>
            <Text style={[styles.puceTexte, !famille && { color: couleurs.blanc }]}>Tout</Text>
          </Pressable>
          {listeFamilles.map((f) => (
            <Pressable key={f} onPress={() => setFamille(famille === f ? undefined : f)} style={[styles.puce, famille === f && styles.puceActive]}>
              <Text style={[styles.puceTexte, famille === f && { color: couleurs.blanc }]}>{f}</Text>
            </Pressable>
          ))}
        </ScrollView>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 24 }}>
          {erreur && <Text style={styles.erreur}>{erreur}</Text>}
          {!catalogue && !erreur && <ActivityIndicator color={nuit.texte} style={{ marginTop: 20 }} />}
          {recents.length > 0 && (
            <>
              <Text style={styles.groupe}>Déjà faits avec {prenom}</Text>
              {recents.map((e) => {
                const d = derniereFois(historique, e.id);
                return ligne(e, d ? `Dernière fois : ${d.texte}` : undefined);
              })}
            </>
          )}
          {catalogue && (
            <>
              <Text style={styles.groupe}>
                Catalogue · {resultat.total} exercice{resultat.total > 1 ? 's' : ''}
              </Text>
              {resultat.exercices.filter((e) => !dejaVus.has(e.id)).map((e) => ligne(e))}
              {resultat.total > resultat.exercices.length && <Text style={[styles.petit, { marginTop: 10 }]}>Précise ta recherche pour voir les autres.</Text>}
            </>
          )}
          {recherche.trim().length > 2 && (
            <View style={{ alignItems: 'center', marginTop: 16, gap: 6 }}>
              <Text style={styles.doux}>Pas dans la liste ?</Text>
              <Pressable accessibilityRole="button" onPress={creer} disabled={creation} hitSlop={8}>
                <Text style={styles.lien}>{creation ? 'Création…' : `Créer « ${recherche.trim()} »`}</Text>
              </Pressable>
              {erreurCreation && <Text style={styles.erreur}>{erreurCreation}</Text>}
            </View>
          )}
        </ScrollView>
      </View>
    </View>
  );
}

// ---------- Fin : ressenti, mot au client, enregistrement ----------

function Fin({
  brouillon,
  prenom,
  historique,
  onReprendre,
  onEnregistree,
  onFermer,
}: {
  brouillon: Brouillon;
  prenom: string;
  historique: EspaceEntrainement['realisations'];
  onReprendre: () => void;
  onEnregistree: () => void;
  onFermer: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [note, setNote] = useState<number>();
  const [commentaire, setCommentaire] = useState('');
  const [envoi, setEnvoi] = useState<'saisie' | 'envoi' | 'fait'>('saisie');
  const [erreur, setErreur] = useState<string>();
  const [finMs] = useState(maintenantMs);
  const donnees = useMemo(
    () =>
      construireEnvoi(brouillon.seance, {
        id: brouillon.realisationId,
        fin: finMs,
        note,
        commentaire,
        seanceDirecteId: brouillon.seanceDirecteId,
        blocId: brouillon.blocId,
      }),
    [brouillon, note, commentaire, finMs],
  );
  const resume: BilanDirect = useMemo(() => bilan(donnees, brouillon.seance, historique), [donnees, brouillon.seance, historique]);

  async function enregistrer() {
    setEnvoi('envoi');
    setErreur(undefined);
    try {
      await entrainement.enregistrerSeanceDirecte(donnees);
      onEnregistree();
      setEnvoi('fait');
    } catch (e) {
      setErreur(messageErreur(e));
      setEnvoi('saisie');
    }
  }

  const fait = envoi === 'fait';
  return (
    <View style={styles.page}>
      <Lueur couleur={fait ? nuit.vert : nuit.rouge} />
      <DefilementClavier contentContainerStyle={{ paddingTop: insets.top + 16, paddingHorizontal: 16, paddingBottom: 180, gap: 10 }} keyboardShouldPersistTaps="handled">
        {!fait && (
          <Pressable accessibilityRole="button" onPress={onReprendre} hitSlop={12} style={styles.retour}>
            <ChevronLeft size={20} color={nuit.texteSecondaire} />
            <Text style={styles.retourTexte}>Reprendre la séance</Text>
          </Pressable>
        )}
        {fait && (
          <View style={styles.okRond}>
            <Check size={34} color={couleurs.blanc} />
          </View>
        )}
        <View style={{ alignItems: fait ? 'center' : 'flex-start' }}>
          <Text style={styles.kicker}>{fait ? 'Séance enregistrée' : 'Fin de séance'}</Text>
          <Text style={[styles.titre, fait && { textAlign: 'center' }]}>
            {prenom} · {new Date(brouillon.seance.debut).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', timeZone: 'Europe/Paris' })}
          </Text>
          <Text style={styles.petit}>
            {heure(brouillon.seance.debut)} – {heure(finMs)}
          </Text>
        </View>
        <View style={styles.chiffres}>
          <Chiffre valeur={`${resume.dureeMin} min`} libelle="durée" />
          <Chiffre valeur={String(resume.nbExercices)} libelle={resume.nbExercices > 1 ? 'exercices' : 'exercice'} />
          <Chiffre valeur={resume.tonnage ? `${fr(resume.tonnage)} kg` : String(resume.nbSeries)} libelle={resume.tonnage ? 'soulevés' : 'séries'} />
        </View>
        {resume.lignes.map((l) => (
          <View key={l.ligneId} style={styles.resumeLigne}>
            <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <Text style={styles.resumeNom}>{l.nom}</Text>
              {l.record && <Text style={styles.record}>RECORD</Text>}
            </View>
            <Text style={styles.resumeValeur}>{l.resume}</Text>
          </View>
        ))}

        {!fait && (
          <>
            <Text style={[styles.groupe, { marginTop: 12 }]}>Ressenti de {prenom}</Text>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              {RESSENTI.map((r) => (
                <Pressable
                  key={r.note}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: note === r.note }}
                  onPress={() => setNote(note === r.note ? undefined : r.note)}
                  style={[styles.ressenti, note === r.note && styles.puceActive]}
                >
                  <Text style={[styles.puceTexte, note === r.note && { color: couleurs.blanc }]}>{r.libelle}</Text>
                </Pressable>
              ))}
            </View>
            <Text style={[styles.groupe, { marginTop: 12 }]}>Un mot pour {prenom}, visible dans son appli</Text>
            <TextInput
              value={commentaire}
              onChangeText={setCommentaire}
              placeholder="Belle séance, on monte la presse la prochaine fois."
              placeholderTextColor={nuit.propose}
              multiline
              maxLength={2000}
              style={styles.note}
            />
          </>
        )}
        {erreur && <Text style={styles.erreur}>{erreur}</Text>}
      </DefilementClavier>
      <View style={[styles.bas, { flexDirection: 'column', gap: 8, paddingBottom: insets.bottom + 12 }]}>
        {fait ? (
          <>
            <View style={{ flexDirection: 'row' }}>
              <Principal libelle="Fermer" onPress={onFermer} />
            </View>
            <Text style={[styles.petit, { textAlign: 'center' }]}>Visible dans son historique et ses progrès</Text>
          </>
        ) : envoi === 'envoi' ? (
          <View style={{ height: 52, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator color={nuit.texte} />
          </View>
        ) : (
          <View style={{ flexDirection: 'row' }}>
            <Principal libelle="Enregistrer la séance" onPress={enregistrer} desactive={!donnees.exercices.length} />
          </View>
        )}
      </View>
    </View>
  );
}

const Chiffre = ({ valeur, libelle }: { valeur: string; libelle: string }) => (
  <View style={styles.chiffre}>
    <Text style={styles.chiffreValeur}>{valeur}</Text>
    <Text style={styles.petit}>{libelle}</Text>
  </View>
);

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: nuit.fond },
  barre: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 6, gap: 10 },
  barreCentre: { flex: 1, textAlign: 'center', fontFamily: polices.texte, fontSize: 15, color: nuit.texteSecondaire },
  chrono: { fontFamily: polices.chiffres, fontSize: 15, color: nuit.texteSecondaire },
  retour: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start' },
  retourTexte: { fontFamily: polices.texte, fontSize: 15, color: nuit.texteSecondaire },
  kicker: { fontFamily: polices.texteGras, fontSize: 12, letterSpacing: 1.4, textTransform: 'uppercase', color: nuit.rougeDoux },
  titre: { fontFamily: polices.titre, fontSize: 38, lineHeight: 40, color: nuit.texte },
  titreChamp: { fontFamily: polices.titre, fontSize: 34, lineHeight: 38, color: nuit.texte, padding: 0, marginTop: 2 },
  doux: { fontFamily: polices.texte, fontSize: 15, lineHeight: 21, color: nuit.texteTertiaire },
  petit: { fontFamily: polices.texte, fontSize: 13, color: nuit.doux },
  erreur: { fontFamily: polices.texteMoyen, fontSize: 14, color: nuit.erreur },
  groupe: { fontFamily: polices.texteGras, fontSize: 12, letterSpacing: 1.2, textTransform: 'uppercase', color: nuit.doux, marginTop: 6, marginBottom: 2 },
  choix: { flexDirection: 'row', gap: 14, alignItems: 'center', backgroundColor: nuit.carte, borderRadius: 16, borderWidth: 1, borderColor: nuit.rouge, padding: 16 },
  choixIcone: { width: 44, height: 44, borderRadius: 22, backgroundColor: nuit.rouge, alignItems: 'center', justifyContent: 'center' },
  choixTitre: { fontFamily: polices.texteGras, fontSize: 17, color: nuit.texte },
  carte: { backgroundColor: nuit.carte, borderWidth: 1, borderColor: nuit.bordure, borderRadius: 16, padding: 14, gap: 4 },
  nom: { fontFamily: polices.texteGras, fontSize: 17, lineHeight: 22, color: nuit.texte },
  avant: { fontFamily: polices.texte, fontSize: 13, color: nuit.texteDiscret, marginTop: 2 },
  avantFort: { fontFamily: polices.texteGras, color: nuit.texteClair },
  entete: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 },
  th: { fontFamily: polices.texteMoyen, fontSize: 11, letterSpacing: 0.6, textTransform: 'uppercase', color: nuit.doux },
  ligne: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  numero: { fontFamily: polices.texteGras, fontSize: 14, color: nuit.texteSecondaire },
  champ: {
    flex: 1,
    minWidth: 0,
    height: 42,
    borderWidth: 1,
    borderColor: nuit.bordureChamp,
    backgroundColor: nuit.champ,
    borderRadius: 10,
    paddingHorizontal: 10,
    fontFamily: polices.texteMoyen,
    fontSize: 16,
    color: nuit.texte,
  },
  champFait: { backgroundColor: '#13261B', borderColor: '#1F4A2F' },
  reposChamp: { width: 58, height: 42, textAlign: 'center', fontFamily: polices.chiffres, fontSize: 13, color: nuit.texteTertiaire, borderRadius: 10 },
  coche: { width: 40, height: 40, borderRadius: 20, borderWidth: 2, borderColor: nuit.bordureForte, alignItems: 'center', justifyContent: 'center' },
  cocheFaite: { backgroundColor: nuit.vert, borderColor: nuit.vert },
  lienLigne: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', marginTop: 8, paddingVertical: 4 },
  lien: { fontFamily: polices.texteGras, fontSize: 15, color: nuit.rougeDoux },
  ajout: { height: 58, borderRadius: 16, borderWidth: 1.5, borderStyle: 'dashed', borderColor: nuit.bordureForte, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  ajoutTexte: { fontFamily: polices.texteGras, fontSize: 16, color: nuit.texte },
  repos: {
    position: 'absolute',
    left: 12,
    right: 12,
    backgroundColor: nuit.surface,
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  reposChiffre: { fontFamily: polices.chiffres, fontSize: 24, color: nuit.texte },
  reposCible: { fontFamily: polices.chiffres, fontSize: 15, color: nuit.doux },
  bas: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingTop: 12, paddingHorizontal: 12, backgroundColor: nuit.fond, borderTopWidth: 1, borderTopColor: nuit.bordure, flexDirection: 'row' },
  puce: { paddingVertical: 7, paddingHorizontal: 12, borderRadius: 999, backgroundColor: nuit.surface },
  puceActive: { backgroundColor: nuit.rouge },
  puceTexte: { fontFamily: polices.texteMoyen, fontSize: 14, color: nuit.texteSecondaire },
  voile: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 20 },
  dialogue: { backgroundColor: nuit.carte, borderRadius: 18, padding: 18, gap: 12, borderWidth: 1, borderColor: nuit.bordure },
  voileBas: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  feuille: { flex: 1, backgroundColor: nuit.carte, borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingHorizontal: 16, paddingTop: 10 },
  poignee: { width: 40, height: 5, borderRadius: 3, backgroundColor: nuit.bordureForte, alignSelf: 'center', marginBottom: 10 },
  recherche: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 46, borderRadius: 12, borderWidth: 1, borderColor: nuit.bordureChamp, backgroundColor: nuit.champ, paddingHorizontal: 12, marginTop: 8 },
  rechercheChamp: { flex: 1, height: 44, fontFamily: polices.texte, fontSize: 16, color: nuit.texte, outlineWidth: 0 },
  resultat: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingHorizontal: 4, borderBottomWidth: 1, borderBottomColor: nuit.bordure, borderRadius: 6 },
  resultatNom: { fontFamily: polices.texteGras, fontSize: 15, color: nuit.texte },
  plus: { width: 34, height: 34, borderRadius: 17, backgroundColor: nuit.surface, alignItems: 'center', justifyContent: 'center' },
  okRond: { width: 64, height: 64, borderRadius: 32, backgroundColor: nuit.vert, alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginTop: 10 },
  chiffres: { flexDirection: 'row', gap: 8, marginVertical: 8 },
  chiffre: { flex: 1, backgroundColor: nuit.carte, borderWidth: 1, borderColor: nuit.bordure, borderRadius: 12, paddingVertical: 10, alignItems: 'center' },
  chiffreValeur: { fontFamily: polices.titre, fontSize: 28, color: nuit.texte },
  resumeLigne: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: nuit.bordure },
  resumeNom: { fontFamily: polices.texte, fontSize: 15, color: nuit.texte },
  resumeValeur: { fontFamily: polices.texte, fontSize: 14, color: nuit.texteTertiaire, textAlign: 'right', flexShrink: 1 },
  record: { fontFamily: polices.texteGras, fontSize: 11, color: '#5FD38E', backgroundColor: 'rgba(31,138,76,0.18)', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6, overflow: 'hidden' },
  ressenti: { flex: 1, height: 38, borderRadius: 9, backgroundColor: nuit.surface, alignItems: 'center', justifyContent: 'center' },
  note: {
    minHeight: 70,
    borderWidth: 1,
    borderColor: nuit.bordureChamp,
    backgroundColor: nuit.champ,
    borderRadius: 12,
    padding: 12,
    fontFamily: polices.texte,
    fontSize: 15,
    color: nuit.texte,
    textAlignVertical: 'top',
  },
});
