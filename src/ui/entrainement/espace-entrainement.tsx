// ClientView.tsx d'origine (U02), en trois pages pour que l'accueil reste court :
// - accueil : bonjour, « Ma prochaine séance » avec Démarrer, la photo du programme (un appui ouvre le programme)
//   et le calendrier de la semaine ;
// - programme : cycle et avancement, « Mes séances au programme », consignes, « Mon accompagnement » ;
// - séance : la seule séance démarrée, à noter sur place.
// La vue « historique » montre les séances enregistrées (U06). Repos entre les séries : bandeau en bas de l'écran.
import { CalendarRange, ChevronLeft, ChevronRight, Lock, PlayCircle, RefreshCw } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { BackHandler, Platform, Pressable, Text, View } from 'react-native';

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
import { BoutonPanneauMinuteurs } from './minuteurs';
import { SeanceLog } from './seance-log';

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
            Mon accompagnement{espace.suivi ? ` · ${espace.suivi.dureeMois} mois (${jourCourt(espace.suivi.debut)} → ${jourCourt(espace.suivi.fin)})` : ''}
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
}: {
  clientId: string;
  prenom: string;
  apercu?: boolean;
  vue: 'programme' | 'historique';
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
  const demarrer = (seanceId: string, planificationId?: string) => aller({ nom: 'seance', seanceId, planificationId, jeton: Date.now() });

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

  if (vue === 'historique')
    return (
      <>
        <GardeBrouillon />
        <Hero
          kicker="Votre progression"
          titre="Mes séances"
          sousTitre="Retrouvez vos séances enregistrées et vos ressentis."
          droite={<BoutonContour nom="Actualiser" icone={RefreshCw} onPress={() => demanderSortie(recharger)} />}
        />
        {erreur && !espace ? (
          <ErreurChargement erreur={erreur} onReessayer={recharger} />
        ) : !espace ? (
          <View style={{ height: 256, borderRadius: 12, backgroundColor: couleurs.discret }} />
        ) : (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={ts.titreSection}>Historique</Text>
              <Badge libelle={`${nbSeries(espace)} série${nbSeries(espace) > 1 ? 's' : ''}`} />
            </View>
            <Historique espace={espace} />
          </>
        )}
      </>
    );

  const apresEnregistrement = () => {
    recharger();
    calendrier.recharger();
  };

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
                  <Text style={ts.doux}>{apercu ? 'Aperçu : seul le client peut noter une séance.' : 'Ouvrez une séance pour voir les exercices, puis notez ce que vous avez réalisé.'}</Text>
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
                  onRepos={onRepos}
                  onEnregistre={apresEnregistrement}
                />
              ))}
            </View>
          )}
          <TexteLong texte={espace.programme?.consignes} libelle="Consignes" />
          <Planning espace={espace} />
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
              <Text style={[ts.texte, { color: couleurs.texteDoux }]}>Votre coach activera votre prochain cycle ici. Vous pourrez alors consulter vos séances.</Text>
            </View>
          ) : (
            <>
              <ProchaineSeance espace={espace} creneaux={calendrier.donnee} apercu={apercu} onDemarrer={demarrer} onProgramme={() => aller({ nom: 'programme' })} />
              <CarteProgramme espace={espace} onPress={() => aller({ nom: 'programme' })} />
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
  espace,
  creneaux,
  apercu,
  onDemarrer,
  onProgramme,
}: {
  espace: EspaceEntrainement;
  creneaux: Planification[] | null;
  apercu?: boolean;
  onDemarrer: (seanceId: string, planificationId?: string) => void;
  onProgramme: () => void;
}) {
  const p = prochaineSeance(espace, creneaux ?? []);
  if (!p) return null;
  const c = espace.cycle!;
  const ouvert = c.statut === 'Actif' && c.etat !== 'depasse';
  const nbExercices = p.seance.blocs.reduce((n, b) => n + b.lignes.length, 0);
  return (
    <View style={[ts.carte, { borderRadius: 16, borderColor: 'rgba(195,24,30,0.35)', gap: 10 }]}>
      <Text style={ts.kicker}>{p.creneau ? `Prévue aujourd’hui${p.creneau.heure ? ` à ${p.creneau.heure}` : ''}` : 'Ma prochaine séance'}</Text>
      <Text style={{ fontFamily: polices.titre, fontSize: 26, letterSpacing: 0.5, color: couleurs.texte }}>{titreClient(p.seance.titre)}</Text>
      <Text style={ts.doux}>
        {nbExercices} exercice{nbExercices > 1 ? 's' : ''}
      </Text>
      <Action
        libelle={apercu ? 'Seul le client peut démarrer' : ouvert ? 'Démarrer la séance' : 'Cycle terminé'}
        icone={PlayCircle}
        desactive={apercu || !ouvert}
        onPress={() => onDemarrer(p.seance.id, p.creneau?.id)}
      />
      <Text accessibilityRole="button" onPress={onProgramme} style={{ alignSelf: 'center', paddingVertical: 6, fontFamily: polices.texte, fontSize: 13, color: couleurs.texteDoux, textDecorationLine: 'underline' }}>
        Choisir une autre séance
      </Text>
    </View>
  );
}

/** La photo du programme et le cycle en cours : tout le bloc ouvre la page du programme. */
function CarteProgramme({ espace, onPress }: { espace: EspaceEntrainement; onPress: () => void }) {
  const c = espace.cycle!;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Voir mon programme${espace.programme ? ` : ${titreClient(espace.programme.titre)}` : ''}`}
      onPress={onPress}
      style={({ pressed }) => [ts.carte, { borderRadius: 16, gap: 6, padding: 0, overflow: 'hidden' }, pressed && { opacity: 0.85 }]}
    >
      {espace.programme && <PhotoProgramme programme={espace.programme} hauteur={170} style={{ borderRadius: 0 }} />}
      <View style={{ padding: 16, paddingTop: espace.programme ? 10 : 16, gap: 4 }}>
        <Text style={ts.kicker}>{etatCycle(c.etat)}</Text>
        <Text style={[ts.titre, { fontSize: 18 }]}>{espace.programme ? titreClient(espace.programme.titre) : c.nom}</Text>
        {!!c.semaine && <Text style={ts.doux}>Semaine {c.semaine}{c.nbSemaines ? ` sur ${c.nbSemaines}` : ''}</Text>}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 }}>
          <Text style={{ fontFamily: polices.texteMoyen, fontSize: 14, color: couleurs.rouge }}>Voir mon programme</Text>
          <ChevronRight size={16} color={couleurs.rouge} />
        </View>
      </View>
    </Pressable>
  );
}

const etatCycle = (e: 'a_venir' | 'en_cours' | 'depasse') => (e === 'a_venir' ? 'Cycle à venir' : e === 'depasse' ? 'Cycle terminé (dates dépassées)' : 'Cycle en cours');

/** En tête de la page du programme : photo, cycle, dates, objectif et avancement. */
function CarteCycle({ espace }: { espace: EspaceEntrainement }) {
  const c = espace.cycle;
  if (!c)
    return (
      <View style={[ts.carte, { borderRadius: 16, padding: 24 }]}>
        <Text style={ts.titre}>Votre programme se prépare</Text>
        <Text style={[ts.texte, { color: couleurs.texteDoux }]}>Votre coach activera votre prochain cycle ici. Vous pourrez alors consulter vos séances.</Text>
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
            <Text style={ts.doux}>Avancement du cycle</Text>
            <Text style={ts.doux}>
              {c.semaine} / {c.nbSemaines} semaines
            </Text>
          </View>
          <View
            accessibilityRole="progressbar"
            aria-label="Avancement du cycle"
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
