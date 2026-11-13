// ClientView.tsx d'origine (U02), en trois pages pour que l'accueil reste court :
// - accueil : bonjour, « Ma prochaine séance » avec Démarrer, la photo du programme (un appui ouvre le programme)
//   et le calendrier de la semaine ;
// - programme : cycle et avancement, « Mes séances au programme », consignes, « Mon accompagnement » ;
// - séance : une activité (yoga, cours…) à valider sur place. Une séance d'exercices s'ouvre en plein écran, un bloc
//   par page (app/client/seance-bloc).
// La vue « historique » montre les séances enregistrées (U06). Repos entre les séries : bandeau en bas de l'écran.
import { router, useFocusEffect } from 'expo-router';
import { CalendarRange, ChevronLeft, Lock, PlayCircle, RefreshCw, Timer } from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { BackHandler, Platform, Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';

import { depot } from '@/data';
import { entrainement } from '@/data/entrainement';
import { aujourdhuiParis, titreClient, type Reference } from '@/domain/entrainement';
import type { EspaceEntrainement, Planification } from '@/domain/entrainement-etat';
import type { Seance } from '@/domain/types';
import { demanderSortie, enregistrerGarde } from '@/lib/brouillon';
import { useCharger } from '@/lib/useCharger';

import { BoutonContour, Hero } from '../coque';
import { Badge, Repliable } from '../crm/dossier';
import { couleurs, polices } from '../theme';
import { MonCalendrier } from './calendrier';
import { Action, Confirmation, TexteLong, jourCourt, ts, PhotoProgramme } from './commun';
import { Historique, nbSeries } from './historique';
import { BoutonPanneauMinuteurs, useMinuteurs } from './minuteurs';
import { useModeSeance } from './seance-libre';
import { SeanceLog } from './seance-log';
import { MesSeances } from '../suivi/mes-seances';

/** Garde des brouillons (GardeBrouillon d'origine), montée une fois dans l'espace client. */
export function GardeBrouillon() {
  const [suite, setSuite] = useState<(() => void) | null>(null);
  useEffect(() => {
    enregistrerGarde((go) => setSuite(() => go));
    return () => enregistrerGarde(null);
  }, []);
  if (!suite) return null;
  return (
    <Confirmation
      titre="Saisie non enregistrée"
      texte="Vos modifications ne sont pas enregistrées. Continuer peut les perdre. Les brouillons sauvegardés sur cet appareil restent disponibles. Souhaitez-vous continuer ?"
      action="Continuer"
      onFermer={() => setSuite(null)}
      onConfirmer={() => {
        const go = suite;
        setSuite(null);
        go();
      }}
    />
  );
}

function Planning({ espace }: { espace: EspaceEntrainement }) {
  if (!espace.suivi && !espace.planning.length) return null;
  return (
    <Repliable
      style={{ borderWidth: 1, borderColor: couleurs.bordure, borderRadius: 12, backgroundColor: couleurs.carte, paddingHorizontal: 16, paddingVertical: 6 }}
      resume={
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 }}>
          <CalendarRange size={16} color={couleurs.rouge} />
          <Text style={[ts.texte, { fontFamily: polices.texteGras, flexShrink: 1 }]}>
            Mon accompagnement{espace.suivi ? ` · depuis le ${jourCourt(espace.suivi.debut)}` : ''}
          </Text>
        </View>
      }
    >
      <View style={{ gap: 8, paddingBottom: 10 }}>
        {espace.planning.map((c) => {
          const actif = c.statut === 'Actif';
          const etat = !actif ? 'Terminé' : espace.cycle?.etat === 'a_venir' ? 'À venir' : espace.cycle?.etat === 'depasse' ? 'Terminé' : 'En cours';
          return (
            <View key={c.id} style={{ borderWidth: 1, borderColor: actif ? couleurs.rouge : couleurs.bordure, backgroundColor: actif ? 'rgba(195,24,30,0.05)' : undefined, borderRadius: 8, padding: 12, gap: 4 }}>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
                <Text style={[ts.texte, { fontFamily: polices.texteMoyen }]}>{c.nom}</Text>
                <Badge libelle={etat} />
              </View>
              <Text style={ts.doux}>
                {jourCourt(c.debut)} → {jourCourt(c.fin)}
                {c.programmeNom ? ` · ${titreClient(c.programmeNom)}` : ''}
              </Text>
              <TexteLong texte={c.objectif} style={{ fontSize: 12 }} />
            </View>
          );
        })}
      </View>
    </Repliable>
  );
}

type Page = { nom: 'accueil' } | { nom: 'programme' } | { nom: 'seance'; seanceId: string; planificationId?: string; jeton: number };

/**
 * La séance à proposer en premier : celle prévue aujourd'hui au calendrier, sinon celle qui suit la dernière faite
 * dans ce cycle (J1, J2… puis on recommence), sinon la première du programme.
 */
export function prochaineSeance(espace: EspaceEntrainement, creneaux: Planification[], jour = aujourdhuiParis()): { seance: Seance; creneau?: Planification } | null {
  const { seances, cycle } = espace;
  if (!cycle || !seances.length) return null;
  const prevue = creneaux
    .filter((e) => e.statut === 'Prévue' && e.date === jour && seances.some((s) => s.id === e.seanceId))
    .sort((a, b) => (a.heure ?? '99:99').localeCompare(b.heure ?? '99:99'))[0];
  if (prevue) return { seance: seances.find((s) => s.id === prevue.seanceId)!, creneau: prevue };
  const derniere = espace.realisations
    .filter((r) => r.cycleId === cycle.id && seances.some((s) => s.id === r.seanceId))
    .sort((a, b) => b.debut.localeCompare(a.debut))[0];
  if (!derniere) return { seance: seances[0] };
  const i = seances.findIndex((s) => s.id === derniere.seanceId);
  return { seance: seances[(i + 1) % seances.length] };
}

export function EntrainementClient({
  clientId,
  prenom,
  apercu,
  vue,
  onRepos,
  onHaut,
  onProgramme,
  milieu,
}: {
  clientId: string;
  /** Accueil : ce qui s'affiche juste sous « Ma prochaine séance » (série, calories, ma journée). */
  milieu?: ReactNode;
  prenom: string;
  apercu?: boolean;
  /** accueil : prochaine séance, cycle et calendrier ; programme : séances du cycle, consignes et séances faites. */
  vue: 'accueil' | 'programme';
  /** « Voir mon programme » ouvre l'onglet Programme au lieu d'une page de l'accueil. */
  onProgramme?: () => void;
  onRepos: (secondes: number, libelle: string) => void;
  /** Remonte en haut de l'écran quand on change de page. */
  onHaut?: () => void;
}) {
  const { donnee: espace, erreur, recharger } = useCharger(() => entrainement.espaceClient(clientId), `espace-${clientId}`);
  const records = useCharger(() => depot.records(clientId), `records-${clientId}`);
  const cycleId = espace?.cycle?.id;
  const calendrier = useCharger(() => (cycleId ? entrainement.calendrier(clientId, cycleId) : Promise.resolve([])), `calendrier-${clientId}-${cycleId}`);
  const [page, setPage] = useState<Page>({ nom: 'accueil' });
  const references: Reference[] = (records.donnee ?? [])
    // Comme à l'origine : seule la performance choisie comme référence sert au calcul, et pour son exercice seulement.
    .filter((r) => r.reference && r.unite === 'kg' && r.exerciceId)
    .map((r) => ({ exerciceId: r.exerciceId!, charge: r.valeur, repetitions: r.repetitions ?? 1, date: r.date }));

  const aller = (suite: Page) =>
    demanderSortie(() => {
      setPage(suite);
      onHaut?.();
    });
  const accueil = () => aller({ nom: 'accueil' });
  // Une séance avec des exercices s'ouvre en plein écran, un bloc par page ; une activité (yoga, cours…) se valide ici.
  const demarrer = (seanceId: string, planificationId?: string) => {
    const s = espace?.seances.find((x) => x.id === seanceId);
    if (s && !apercu && s.blocs.some((b) => b.lignes.length))
      router.push({ pathname: '/client/seance-bloc', params: { seance: seanceId, plan: planificationId ?? '' } });
    else aller({ nom: 'seance', seanceId, planificationId, jeton: Date.now() });
  };
  // Sans téléphone : chrono et liste des blocs pendant l'effort, la séance se note après coup.
  const demarrerLibre = (seanceId: string, planificationId?: string) =>
    router.push({ pathname: '/client/seance-libre', params: { seance: seanceId, plan: planificationId ?? '' } });
  // Liste du programme : une séance d'exercices s'ouvre en séance guidée, comme celle de l'accueil.
  const demarrerDepuisListe = (seanceId: string) => () =>
    demanderSortie(() => router.push({ pathname: '/client/seance-bloc', params: { seance: seanceId, plan: '' } }));
  // Retour de la séance plein écran : la séance faite et le créneau réalisé apparaissent tout de suite.
  const premierAffichage = useRef(true);
  // Le tableau « Mes séances » se relit au retour d'une séance.
  const [versionSeances, setVersionSeances] = useState(0);
  const rechargerCalendrier = calendrier.recharger;
  useFocusEffect(
    useCallback(() => {
      if (premierAffichage.current) {
        premierAffichage.current = false;
        return;
      }
      recharger();
      rechargerCalendrier();
      setVersionSeances((v) => v + 1);
    }, [recharger, rechargerCalendrier]),
  );

  // Retour d'Android : d'une page du programme ou d'une séance, on revient à l'accueil au lieu de quitter l'app.
  const surAccueil = page.nom === 'accueil';
  useEffect(() => {
    if (Platform.OS !== 'android' || surAccueil) return;
    const abonnement = BackHandler.addEventListener('hardwareBackPress', () => {
      demanderSortie(() => {
        setPage({ nom: 'accueil' });
        onHaut?.();
      });
      return true;
    });
    return () => abonnement.remove();
  }, [surAccueil, onHaut]);

  const apresEnregistrement = () => {
    recharger();
    calendrier.recharger();
  };

  const voirProgramme = () => (onProgramme ? demanderSortie(onProgramme) : aller({ nom: 'programme' }));

  const programme = espace && (
    <>
      <CarteCycle espace={espace} />
      {espace.cycle && (
        <View style={{ gap: 12 }}>
          <View>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <Text style={ts.titre}>Mes séances au programme</Text>
              <Text style={ts.doux}>
                {espace.seances.length} séance{espace.seances.length > 1 ? 's' : ''}
              </Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 8 }}>
              <Lock size={12} color={couleurs.texteDoux} />
              <Text style={ts.doux}>{apercu ? 'Aperçu : seul le client peut noter une séance.' : 'Touchez une séance pour la démarrer : un bloc par page, avec les vidéos.'}</Text>
            </View>
          </View>
          {espace.seances.map((s) => (
            <SeanceLog
              key={`${s.id}:${clientId}:${espace.cycle!.id}`}
              clientId={clientId}
              cycleId={espace.cycle!.id}
              seance={s}
              historique={espace.realisations}
              references={references}
              apercu={apercu}
              onDemarrer={demarrerDepuisListe(s.id)}
              onRepos={onRepos}
              onEnregistre={apresEnregistrement}
            />
          ))}
        </View>
      )}
      <TexteLong texte={espace.programme?.consignes} libelle="Consignes" />
      <Planning espace={espace} />
    </>
  );

  if (vue === 'programme')
    return (
      <>
        <GardeBrouillon />
        <Hero
          kicker="Mon entraînement"
          titre="Mon programme"
          sousTitre="Ton cycle, ses séances et tout ce que tu as déjà fait."
          droite={
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <BoutonMinuteurs />
              <BoutonContour nom="Actualiser" icone={RefreshCw} onPress={() => demanderSortie(() => (recharger(), setVersionSeances((v) => v + 1)))} />
            </View>
          }
        />
        {erreur && !espace ? (
          <ErreurChargement erreur={erreur} onReessayer={recharger} />
        ) : !espace ? (
          <View style={{ height: 256, borderRadius: 12, backgroundColor: couleurs.discret }} />
        ) : (
          <>
            {programme}
            {/* Une seule liste de ce qui est fait : séances du programme et activités en plus, semaine par semaine. */}
            <Text style={ts.titreSection}>Mes séances faites</Text>
            <MesSeances key={`${clientId}:${versionSeances}`} clientId={clientId} apercu={apercu} />
            {espace.realisations.length > 0 && (
              <Repliable
                style={{ borderWidth: 1, borderColor: couleurs.bordure, borderRadius: 12, backgroundColor: couleurs.carte, paddingHorizontal: 16, paddingVertical: 6 }}
                resume={
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text style={[ts.texte, { fontFamily: polices.texteGras }]}>Tout mon historique, série par série</Text>
                    <Badge libelle={`${nbSeries(espace)} série${nbSeries(espace) > 1 ? 's' : ''}`} />
                  </View>
                }
              >
                <View style={{ paddingBottom: 12 }}>
                  <Historique espace={espace} />
                </View>
              </Repliable>
            )}
          </>
        )}
      </>
    );

  return (
    <>
      <GardeBrouillon />
      {erreur && !espace ? (
        <ErreurChargement erreur={erreur} onReessayer={recharger} />
      ) : !espace ? (
        <View style={{ height: 256, borderRadius: 12, backgroundColor: couleurs.discret }} />
      ) : page.nom === 'seance' ? (
        <>
          <Retour libelle="Retour à l’accueil" onPress={accueil} />
          <BoutonPanneauMinuteurs />
          {(() => {
            const s = espace.seances.find((x) => x.id === page.seanceId);
            if (!s || !espace.cycle) return <Text style={ts.texte}>Cette séance n’est plus au programme.</Text>;
            return (
              <SeanceLog
                key={`${s.id}:${clientId}:${espace.cycle.id}`}
                clientId={clientId}
                cycleId={espace.cycle.id}
                seance={s}
                historique={espace.realisations}
                references={references}
                planificationId={page.planificationId}
                ouverture={page.jeton}
                ouverteAuDepart
                apercu={apercu}
                onRepos={onRepos}
                onEnregistre={apresEnregistrement}
              />
            );
          })()}
        </>
      ) : page.nom === 'programme' ? (
        <>
          <Retour libelle="Retour à l’accueil" onPress={accueil} />
          {programme}
        </>
      ) : (
        <>
          <Hero
            kicker="Votre entraînement"
            titre={`Bonjour, ${prenom.trim().split(/\s+/)[0]}`}
            droite={
              <BoutonContour
                nom="Actualiser mon programme"
                icone={RefreshCw}
                onPress={() =>
                  demanderSortie(() => {
                    recharger();
                    calendrier.recharger();
                  })
                }
              />
            }
          />
          {!espace.cycle ? (
            <View style={[ts.carte, { borderRadius: 16, padding: 24 }]}>
              <Text style={ts.titre}>Votre programme se prépare</Text>
              <Text style={[ts.texte, { color: couleurs.texteDoux }]}>Votre coach activera votre prochain programme ici. Vous pourrez alors consulter vos séances.</Text>
            </View>
          ) : null}
          {!espace.cycle && milieu}
          {espace.cycle && (
            <>
              <ProchaineSeance
                clientId={clientId}
                espace={espace}
                creneaux={calendrier.donnee}
                apercu={apercu}
                onDemarrer={demarrer}
                onDemarrerLibre={demarrerLibre}
                onProgramme={voirProgramme}
              />
              {milieu}
              <MonCalendrier
                key={`${clientId}:${espace.cycle.id}`}
                clientId={clientId}
                espace={espace}
                creneaux={calendrier.donnee}
                erreurChargement={calendrier.erreur}
                apercu={apercu}
                onDemarrer={demarrer}
                onChange={calendrier.recharger}
              />
            </>
          )}
        </>
      )}
    </>
  );
}

function ErreurChargement({ erreur, onReessayer }: { erreur: string; onReessayer: () => void }) {
  return (
    <View accessibilityRole="alert" style={[ts.carte, { borderColor: 'rgba(195,24,30,0.4)' }]}>
      <Text style={ts.texte}>{erreur}</Text>
      <View style={{ alignSelf: 'flex-start' }}>
        <Action libelle="Réessayer" onPress={onReessayer} />
      </View>
    </View>
  );
}

function Retour({ libelle, onPress }: { libelle: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} hitSlop={8} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', minHeight: 44 }}>
      <ChevronLeft size={18} color={couleurs.rouge} />
      <Text style={{ fontFamily: polices.texteMoyen, fontSize: 15, color: couleurs.rouge }}>{libelle}</Text>
    </Pressable>
  );
}

/** « Ma prochaine séance » : un seul gros bouton pour démarrer, sans chercher dans le programme. */
function ProchaineSeance({
  clientId,
  espace,
  creneaux,
  apercu,
  onDemarrer,
  onDemarrerLibre,
  onProgramme,
}: {
  clientId: string;
  espace: EspaceEntrainement;
  creneaux: Planification[] | null;
  apercu?: boolean;
  onDemarrer: (seanceId: string, planificationId?: string) => void;
  onDemarrerLibre: (seanceId: string, planificationId?: string) => void;
  onProgramme: () => void;
}) {
  const [mode, choisirMode] = useModeSeance(clientId);
  const p = prochaineSeance(espace, creneaux ?? []);
  if (!p) return null;
  const c = espace.cycle!;
  const ouvert = c.statut === 'Actif' && c.etat !== 'depasse';
  const nbExercices = p.seance.blocs.reduce((n, b) => n + b.lignes.length, 0);
  const libre = !!nbExercices && ouvert && !apercu;
  const guideeEnPremier = !(libre && mode === 'libre');
  const propsGuidee = {
    libelle: apercu ? 'Seul le client peut démarrer' : !ouvert ? 'Programme terminé' : nbExercices ? 'Démarrer, je note au fur et à mesure' : 'Valider la séance',
    icone: PlayCircle,
    desactive: apercu || !ouvert,
    onPress: () => {
      if (libre) choisirMode('guidee');
      onDemarrer(p.seance.id, p.creneau?.id);
    },
  };
  const propsLibre = {
    libelle: 'Démarrer sans téléphone',
    icone: Timer,
    onPress: () => {
      choisirMode('libre');
      onDemarrerLibre(p.seance.id, p.creneau?.id);
    },
  };
  // Le mode choisi la dernière fois passe en premier, en bouton blanc ; l'autre reste en contour.
  const guidee = guideeEnPremier ? <Action key="guidee" variante="contour" {...propsGuidee} /> : <ActionSurSombre key="guidee" {...propsGuidee} />;
  const sansTelephone = !libre ? null : guideeEnPremier ? <ActionSurSombre key="libre" {...propsLibre} /> : <Action key="libre" variante="contour" {...propsLibre} />;
  return (
    // Carte forte de l'accueil : sombre avec une lueur rouge, un avant-goût de la séance plein écran.
    <View style={[ts.carte, styles.prochaine]}>
      <Text style={[ts.kicker, { color: '#FF7A7E' }]}>{p.creneau ? `Prévue aujourd’hui${p.creneau.heure ? ` à ${p.creneau.heure}` : ''}` : 'Ma prochaine séance'}</Text>
      <Text style={{ fontFamily: polices.titre, fontSize: 30, letterSpacing: 0.6, color: '#FFFFFF' }}>{titreClient(p.seance.titre)}</Text>
      <Text style={[ts.doux, { color: 'rgba(255,255,255,0.85)' }]}>{nbExercices ? `${nbExercices} exercice${nbExercices > 1 ? 's' : ''}` : 'Activité · à valider une fois faite'}</Text>
      {guideeEnPremier ? [guidee, sansTelephone] : [sansTelephone, guidee]}
      {libre && (
        <Text style={[ts.doux, { color: 'rgba(255,255,255,0.75)' }]}>
          Sans téléphone : tu t’entraînes tranquille et tu racontes ta séance à la fin, en 30 secondes.
        </Text>
      )}
      <Text accessibilityRole="button" onPress={onProgramme} style={{ alignSelf: 'center', paddingVertical: 6, fontFamily: polices.texte, fontSize: 13, color: 'rgba(255,255,255,0.9)', textDecorationLine: 'underline' }}>
        Choisir une autre séance
      </Text>
    </View>
  );
}

/** Bouton secondaire sur la carte sombre de la prochaine séance : contour blanc, texte blanc. */
function ActionSurSombre({ libelle, icone: Icone, onPress, desactive }: { libelle: string; icone: typeof Timer; onPress: () => void; desactive?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!desactive }}
      disabled={desactive}
      onPress={onPress}
      style={({ pressed }) => [styles.surSombre, { opacity: desactive ? 0.45 : pressed ? 0.7 : 1 }]}
    >
      <Icone size={16} color="#FFFFFF" />
      <Text style={{ fontFamily: polices.texteMoyen, fontSize: 15, color: '#FFFFFF' }}>{libelle}</Text>
    </Pressable>
  );
}

const etatCycle = (e: 'a_venir' | 'en_cours' | 'depasse') => (e === 'a_venir' ? 'Programme à venir' : e === 'depasse' ? 'Programme terminé (dates dépassées)' : 'Programme en cours');

/** En tête de la page du programme : photo, cycle, dates, objectif et avancement. */
function CarteCycle({ espace }: { espace: EspaceEntrainement }) {
  const c = espace.cycle;
  if (!c)
    return (
      <View style={[ts.carte, { borderRadius: 16, padding: 24 }]}>
        <Text style={ts.titre}>Votre programme se prépare</Text>
        <Text style={[ts.texte, { color: couleurs.texteDoux }]}>Votre coach activera votre prochain programme ici. Vous pourrez alors consulter vos séances.</Text>
      </View>
    );
  return (
    <View style={[ts.carte, { borderRadius: 16, gap: 4 }]}>
      {espace.programme && <PhotoProgramme programme={espace.programme} hauteur={220} style={{ marginBottom: 8 }} />}
      <Text style={ts.kicker}>{etatCycle(c.etat)}</Text>
      <Text style={{ fontFamily: polices.titre, fontSize: 24, letterSpacing: 0.5, color: couleurs.texte }}>{c.nom}</Text>
      <Text style={ts.texte}>
        {c.semaine ? (
          <>
            Semaine <Text style={{ fontFamily: polices.texteGras }}>{c.semaine}</Text>
            {c.nbSemaines ? ` sur ${c.nbSemaines}` : ''} ·{' '}
          </>
        ) : c.etat === 'a_venir' ? (
          'Commence le '
        ) : (
          ''
        )}
        {jourCourt(c.debut)} → {jourCourt(c.fin)}
      </Text>
      {espace.programme && <Text style={ts.doux}>{titreClient(espace.programme.titre)}</Text>}
      <View style={{ marginTop: 4 }}>
        <TexteLong texte={c.objectif} />
      </View>
      {c.etat === 'en_cours' && !!c.semaine && c.nbSemaines > 0 && (
        <View style={{ marginTop: 12, gap: 8 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={ts.doux}>Avancement du programme</Text>
            <Text style={ts.doux}>
              {c.semaine} / {c.nbSemaines} semaines
            </Text>
          </View>
          <View
            accessibilityRole="progressbar"
            aria-label="Avancement du programme"
            aria-valuemin={0}
            aria-valuemax={c.nbSemaines}
            aria-valuenow={Math.min(c.semaine, c.nbSemaines)}
            style={{ height: 8, borderRadius: 4, overflow: 'hidden', backgroundColor: couleurs.discret }}
          >
            <View style={{ height: '100%', backgroundColor: couleurs.rouge, width: `${(Math.min(c.semaine, c.nbSemaines) / c.nbSemaines) * 100}%` }} />
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  surSombre: {
    minHeight: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.45)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 16,
  },
  prochaine: {
    borderRadius: 22,
    borderWidth: 0,
    gap: 10,
    backgroundColor: '#15161B',
    backgroundImage:
      'radial-gradient(circle at 100% 100%, rgba(224,38,44,0.55) 0%, rgba(224,38,44,0) 65%), radial-gradient(circle at 0% 0%, rgba(224,38,44,0.3) 0%, rgba(224,38,44,0) 55%), linear-gradient(180deg, #15161B 0%, #1B1C22 100%)',
    boxShadow: '0 16px 30px -16px rgba(17, 18, 22, 0.7)',
  } as ViewStyle,
});

/** Les minuteurs (Tabata, EMOM, AMRAP…) depuis la page du programme, à côté d'Actualiser. */
function BoutonMinuteurs() {
  const m = useMinuteurs();
  return m ? <BoutonContour nom="Ouvrir les minuteurs" icone={Timer} onPress={m.ouvrir} /> : null;
}
