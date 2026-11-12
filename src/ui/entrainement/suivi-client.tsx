// Entraînement d'un client vu par le coach : où il en est dans son cycle, ses séances semaine par semaine
// (vert faite, rouge manquée, orange à venir), le détail d'une séance faite comparé à la fois précédente,
// et les évolutions par exercice et par semaine.
import { ArrowDown, ArrowRight, ArrowUp, Video } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { entrainement } from '@/data/entrainement';
import { estLibre, SOURCES, titreActivite, type Activite } from '@/domain/activites';
import { ecouterVideos, videos } from '@/data/videos-mouvement';
import { ajouterJours, aujourdhuiParis, avancementCycle, jourParis, titreClient } from '@/domain/entrainement';
import type { CycleClient, RealisationLue } from '@/domain/entrainement-etat';
import { formaterNombre } from '@/domain/suivi';
import { expiree, type VideoMouvement } from '@/domain/videos-mouvement';
import {
  assiduite,
  bilanParSemaine,
  courbesExercices,
  detailSeance,
  ressentiMoyen,
  semainesDuCycle,
  type PointExercice,
} from '@/domain/suivi-entrainement';
import { useCharger, useRechargerSur } from '@/lib/useCharger';

import { Puce, Puces } from '../composants';
import { DetailActiviteLibre, resumeActivite } from '../suivi/activite-libre';
import { ActivitesHorsProgramme, useActivitesClient } from '../suivi/activites-hors-programme';
import { Courbe } from '../suivi/courbe';
import { couleurs, polices } from '../theme';
import { Action, Ligne, TexteLong, jourCourt, ts } from './commun';
import { GrilleSemaines, jourMois, Legende } from './grille-semaines';
import { serieLisible, VideosMouvementCoach } from './videos-mouvement';

const MESURES: { cle: keyof Omit<PointExercice, 'date'>; libelle: string; unite: string }[] = [
  { cle: 'chargeMax', libelle: 'Charge max', unite: 'kg' },
  { cle: 'rm', libelle: 'Force estimée (1RM)', unite: 'kg' },
  { cle: 'volume', libelle: 'Tonnage', unite: 'kg' },
  { cle: 'repetitions', libelle: 'Répétitions', unite: 'reps' },
  { cle: 'duree', libelle: 'Durée', unite: 's' },
];

const joursDepuis = (d: string, jour: string) => Math.round((new Date(`${jour}T12:00:00Z`).getTime() - new Date(`${d}T12:00:00Z`).getTime()) / 86_400_000);
const ilYa = (n: number) => (n <= 0 ? 'aujourd’hui' : n === 1 ? 'hier' : `il y a ${n} jours`);

/** Le cycle à montrer d'abord : l'actif, sinon le dernier commencé. */
function cyclesVisibles(cycles: CycleClient[]) {
  const vus = cycles.filter((c) => c.statut === 'Actif' || c.statut === 'Terminé').sort((a, b) => b.debut.localeCompare(a.debut));
  return [...vus.filter((c) => c.statut === 'Actif'), ...vus.filter((c) => c.statut !== 'Actif')];
}

export function EntrainementClient({
  coachId,
  clientId,
  avecNom,
  onOuvrirProgramme,
}: {
  coachId: string;
  clientId: string;
  /** Depuis l'onglet Clients : le nom du client en titre (la fiche l'affiche déjà). */
  avecNom?: boolean;
  onOuvrirProgramme?: (id: string) => void;
}) {
  const profils = useCharger(() => entrainement.suivis(coachId), `suivi-entrainement-${coachId}`);
  const profil = profils.donnee?.find((p) => p.clientId === clientId);
  const cycles = useMemo(() => cyclesVisibles(profil?.cycles ?? []), [profil]);
  const [cycleChoisi, setCycleChoisi] = useState<string>();
  const cycle = cycles.find((c) => c.id === cycleChoisi) ?? cycles[0];

  const donnees = useCharger(
    async () => {
      if (!cycle) return null;
      const [res, creneaux, prog] = await Promise.all([
        entrainement.resultats(clientId),
        entrainement.calendrier(clientId, cycle.id),
        cycle.programmeId ? entrainement.programme(cycle.programmeId).catch(() => undefined) : undefined,
      ]);
      return { cycleId: cycle.id, ...res, creneaux, seancesParSemaine: prog?.programme.seancesParSemaine };
    },
    `suivi-entrainement-${clientId}-${cycle?.id ?? ''}`,
  );

  // Vidéos de mouvement du client ; les plus de 30 jours sont effacées (fichiers compris) au passage.
  const videosClient = useCharger(async () => {
    await videos.purger().catch(() => 0);
    return videos.videosClient(clientId);
  }, `videos-mouvement-coach-${clientId}`);
  useRechargerSur(videosClient.recharger, ecouterVideos);
  // Activités hors programme : saisies par le client (marche, cours, muscu à lui…) ou venues de sa montre.
  const libres = useActivitesClient(clientId);

  const jour = aujourdhuiParis();
  const vue = useMemo(() => {
    const d = donnees.donnee;
    if (!d || !cycle || d.cycleId !== cycle.id) return null;
    const realisations = d.realisations.filter((r) => r.cycleId === cycle.id);
    const semaines = semainesDuCycle({
      cycle,
      planifications: d.creneaux,
      realisations,
      seancesParSemaine: d.seancesParSemaine,
      jour,
      libres: (libres.donnee ?? []).map((a) => ({ id: a.id, titre: titreActivite(a), date: jourParis(a.debut) })),
    });
    return {
      realisations,
      toutes: d.realisations,
      prescriptions: d.prescriptions,
      semaines,
      assiduite: assiduite(semaines),
      ressenti: ressentiMoyen(realisations, ajouterJours(jour, -28)),
      derniere: [...realisations].sort((a, b) => b.fin.localeCompare(a.fin))[0],
      courbes: courbesExercices(realisations),
      bilan: bilanParSemaine(semaines, realisations),
    };
  }, [donnees.donnee, cycle, jour, libres.donnee]);

  if (profils.erreur || donnees.erreur) return <Text style={ts.erreur}>{profils.erreur ?? donnees.erreur}</Text>;
  if (!profils.donnee) return <Text style={ts.doux}>Chargement…</Text>;
  if (!cycle)
    return (
      <View style={ts.carte}>
        <Text style={ts.titre}>Pas encore de cycle en cours</Text>
        <Text style={ts.doux}>
          Dès qu’un programme est attribué à {profil?.nom ?? 'ce client'} (fiche › Programme › Séances) et son cycle activé, son entraînement s’affiche ici.
        </Text>
      </View>
    );

  return (
    <View style={{ gap: 16 }}>
      {cycles.length > 1 && (
        <Puces>
          {cycles.map((c) => (
            <Puce key={c.id} libelle={`${c.nom}${c.statut === 'Actif' ? ' · en cours' : ''}`} actif={c.id === cycle.id} onPress={() => setCycleChoisi(c.id)} />
          ))}
        </Puces>
      )}
      <EnTete cycle={cycle} nom={avecNom ? profil?.nom : undefined} vue={vue} jour={jour} onOuvrirProgramme={onOuvrirProgramme} />
      {!vue ? (
        <Text style={ts.doux}>Chargement…</Text>
      ) : (
        <>
          {videosClient.donnee && <VideosMouvementCoach videos={videosClient.donnee} realisations={vue.toutes} onChange={videosClient.recharger} />}
          {videosClient.erreur && <Text style={ts.erreur}>Vidéos de mouvement : {videosClient.erreur}</Text>}
          <Semaines
            semaines={vue.semaines}
            realisations={vue.realisations}
            toutes={vue.toutes}
            prescriptions={vue.prescriptions}
            videos={videosClient.donnee ?? []}
            libres={libres.donnee ?? []}
          />
          <ActivitesHorsProgramme liste={libres.donnee} proprietaire={false} />
          <Evolutions courbes={vue.courbes} />
          <ParSemaine bilan={vue.bilan} semaines={vue.semaines} />
        </>
      )}
    </View>
  );
}

type Vue = {
  assiduite: ReturnType<typeof assiduite>;
  ressenti?: number;
  derniere?: RealisationLue;
} | null;

function EnTete({
  cycle,
  nom,
  vue,
  jour,
  onOuvrirProgramme,
}: {
  cycle: CycleClient;
  nom?: string;
  vue: Vue;
  jour: string;
  onOuvrirProgramme?: (id: string) => void;
}) {
  const { nbSemaines, semaine } = avancementCycle(cycle, jour);
  const a = vue?.assiduite;
  const derniere = vue?.derniere && jourParis(vue.derniere.fin);
  return (
    <View style={ts.carte}>
      <View style={{ gap: 2 }}>
        <Text style={ts.kicker}>{nom ? `Entraînement de ${nom}` : 'Entraînement'}</Text>
        <Text style={[ts.titre, { fontSize: 18 }]}>{cycle.programmeNom ? titreClient(cycle.programmeNom) : 'Programme non lié'}</Text>
        <Text style={ts.doux}>
          {cycle.nom} · {jourCourt(cycle.debut)} → {jourCourt(cycle.fin)}
          {cycle.statut === 'Actif' && semaine ? ` · semaine ${Math.min(semaine, nbSemaines)}/${nbSemaines}` : cycle.statut === 'Terminé' ? ' · terminé' : ''}
        </Text>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        <Chiffre
          libelle="Assiduité"
          valeur={a?.taux !== undefined ? `${a.taux} %` : '—'}
          detail={a ? `${a.faites} faite${a.faites > 1 ? 's' : ''} sur ${a.faites + a.manquees}` : undefined}
        />
        <Chiffre libelle="À venir" valeur={a ? String(a.aVenir) : '—'} detail="séances du cycle" />
        <Chiffre
          libelle="Dernière séance"
          valeur={derniere ? jourMois(derniere) : '—'}
          detail={derniere ? ilYa(joursDepuis(derniere, jour)) : 'aucune pour l’instant'}
        />
        <Chiffre libelle="Ressenti" valeur={vue?.ressenti !== undefined ? `${formaterNombre(vue.ressenti)}/10` : '—'} detail="moyenne sur 4 semaines" />
      </View>
      {cycle.programmeId && onOuvrirProgramme && (
        <Ligne>
          <Action petit variante="contour" icone={ArrowRight} libelle="Voir le programme" onPress={() => onOuvrirProgramme(cycle.programmeId!)} />
        </Ligne>
      )}
    </View>
  );
}

function Chiffre({ libelle, valeur, detail }: { libelle: string; valeur: string; detail?: string }) {
  return (
    <View style={{ flexGrow: 1, flexBasis: 130, backgroundColor: couleurs.fond, borderRadius: 10, padding: 12, gap: 2 }}>
      <Text style={ts.doux}>{libelle}</Text>
      <Text style={{ fontFamily: polices.texteGras, fontSize: 20, color: couleurs.texte }}>{valeur}</Text>
      {detail && <Text style={ts.doux}>{detail}</Text>}
    </View>
  );
}

function Semaines({
  semaines,
  realisations,
  toutes,
  prescriptions,
  videos: liste,
  libres,
}: {
  semaines: ReturnType<typeof semainesDuCycle>;
  realisations: RealisationLue[];
  toutes: RealisationLue[];
  prescriptions: Record<string, { series: number; repetitions?: string }>;
  videos: VideoMouvement[];
  libres: Activite[];
}) {
  // Par défaut : la dernière séance faite.
  const derniere = [...realisations].sort((a, b) => b.fin.localeCompare(a.fin))[0];
  const [choix, setChoix] = useState<{ semaine: number; index: number }>();
  const pastilleChoisie = choix ? semaines[choix.semaine - 1]?.pastilles[choix.index] : undefined;
  const realisationId = choix ? pastilleChoisie?.realisationId : derniere?.id;
  const r = realisations.find((x) => x.id === realisationId);
  const libre = pastilleChoisie?.activiteId ? libres.find((a) => a.id === pastilleChoisie.activiteId) : undefined;

  return (
    <View style={ts.carte}>
      <Text style={ts.titreSection}>Semaine par semaine</Text>
      <Legende />
      <GrilleSemaines
        semaines={semaines}
        estChoisi={(c, p) => (choix ? choix.semaine === c.semaine && choix.index === c.index : p.realisationId === derniere?.id && !!p.realisationId)}
        onChoisir={setChoix}
      />
      {libre ? (
        <View style={{ borderTopWidth: 1, borderTopColor: couleurs.bordure, paddingTop: 12, gap: 8 }}>
          <Text style={ts.titre}>{titreActivite(libre)}</Text>
          <Text style={ts.doux}>
            {estLibre(libre) ? 'Activité ajoutée par le client' : `Activité de sa montre (${SOURCES[libre.source]})`}, le {jourCourt(jourParis(libre.debut))} · {resumeActivite(libre)}
          </Text>
          <DetailActiviteLibre a={libre} />
        </View>
      ) : r ? (
        <DetailSeance r={r} toutes={toutes} prescriptions={prescriptions} videos={liste} />
      ) : pastilleChoisie ? (
        <View style={{ borderTopWidth: 1, borderTopColor: couleurs.bordure, paddingTop: 12, gap: 2 }}>
          <Text style={ts.titre}>{titreClient(pastilleChoisie.titre)}</Text>
          <Text style={ts.doux}>
            {pastilleChoisie.statut === 'manquee'
              ? pastilleChoisie.date
                ? `Prévue le ${jourCourt(pastilleChoisie.date)}, pas faite.`
                : 'Séance attendue cette semaine-là (fréquence du programme), pas faite.'
              : pastilleChoisie.date
                ? `Prévue le ${jourCourt(pastilleChoisie.date)}.`
                : 'Séance attendue cette semaine, pas encore planifiée par le client.'}
          </Text>
        </View>
      ) : (
        <Text style={ts.doux}>Touchez une séance verte ou une activité bleue pour voir ce que le client a fait.</Text>
      )}
    </View>
  );
}

export function DetailSeance({
  r,
  toutes,
  prescriptions,
  videos: liste,
}: {
  r: RealisationLue;
  toutes: RealisationLue[];
  prescriptions: Record<string, { series: number; repetitions?: string }>;
  videos: VideoMouvement[];
}) {
  const exercices = detailSeance(r, toutes, prescriptions);
  const maintenant = new Date();
  const filmes = new Set(liste.filter((v) => v.realisationId === r.id && !expiree(v, maintenant)).map((v) => v.ligneId));
  const duree = Math.round((new Date(r.fin).getTime() - new Date(r.debut).getTime()) / 60000);
  return (
    <View style={{ borderTopWidth: 1, borderTopColor: couleurs.bordure, paddingTop: 12, gap: 12 }}>
      <View style={{ gap: 2 }}>
        <Text style={ts.titre}>{titreClient(r.seanceTitre)}</Text>
        <Text style={ts.doux}>
          Faite le {jourCourt(jourParis(r.fin))}
          {duree > 0 && duree < 600 ? ` · ${duree} min` : ''}
        </Text>
      </View>
      {(r.note !== undefined || r.commentaire) && (
        <View style={{ backgroundColor: couleurs.fond, borderRadius: 10, padding: 12, gap: 4 }}>
          {r.note !== undefined && (
            <Text style={ts.texte}>
              <Text style={{ fontFamily: polices.texteGras }}>Ressenti : </Text>
              {r.note}/10
            </Text>
          )}
          <TexteLong libelle="Commentaire" texte={r.commentaire} />
        </View>
      )}
      {exercices.length === 0 && <Text style={ts.doux}>Aucune série enregistrée.</Text>}
      {exercices.map((e) => (
        <View key={e.ligneId} style={{ gap: 4 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <Text style={[ts.titreChamp, { flexShrink: 1 }]}>{e.nom}</Text>
            {e.evolution && <Tendance e={e.evolution} avant={e.precedente ? serieLisible(e.precedente.valeurs) : undefined} />}
            {filmes.has(e.ligneId) && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }} accessibilityLabel="Vidéo envoyée, à voir dans Vidéos de mouvement">
                <Video size={14} color={couleurs.rouge} />
                <Text style={{ fontFamily: polices.texteMoyen, fontSize: 12, color: couleurs.rouge }}>vidéo</Text>
              </View>
            )}
          </View>
          {e.prescription && (
            <Text style={ts.doux}>
              Prévu : {e.prescription.series} série{e.prescription.series > 1 ? 's' : ''}
              {e.prescription.repetitions ? ` × ${e.prescription.repetitions}` : ''}
            </Text>
          )}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {e.series.map((s, i) => (
              <View key={s.id} style={{ borderWidth: 1, borderColor: couleurs.bordure, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 }}>
                <Text style={ts.mono}>
                  {i + 1}. {serieLisible(s.valeurs)}
                </Text>
              </View>
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}

function Tendance({ e, avant }: { e: 'hausse' | 'baisse' | 'egal'; avant?: string }) {
  const c = e === 'hausse' ? couleurs.vert : e === 'baisse' ? couleurs.rouge : couleurs.texteDoux;
  const Icone = e === 'hausse' ? ArrowUp : e === 'baisse' ? ArrowDown : ArrowRight;
  return (
    <View
      style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}
      accessibilityLabel={`${e === 'hausse' ? 'Mieux' : e === 'baisse' ? 'Moins bien' : 'Pareil'} que la fois précédente${avant ? ` (${avant})` : ''}`}
    >
      <Icone size={14} color={c} />
      <Text style={{ fontFamily: polices.texteMoyen, fontSize: 12, color: c }}>{avant ? `vs ${avant}` : ''}</Text>
    </View>
  );
}

function Evolutions({ courbes }: { courbes: ReturnType<typeof courbesExercices> }) {
  const [exo, setExo] = useState<string>();
  const [mesure, setMesure] = useState<(typeof MESURES)[number]['cle']>();
  const c = courbes.find((x) => x.exerciceId === exo) ?? courbes[0];
  const possibles = c ? MESURES.filter((m) => c.points.filter((p) => p[m.cle] !== undefined).length > 0) : [];
  const m = possibles.find((x) => x.cle === mesure) ?? possibles[0];
  const points = c && m ? c.points.filter((p) => p[m.cle] !== undefined).map((p) => ({ date: p.date, valeur: p[m.cle]! })) : [];
  return (
    <View style={ts.carte}>
      <Text style={ts.titreSection}>Évolution par exercice</Text>
      {!c ? (
        <Text style={ts.doux}>Les courbes apparaissent après les premières séances.</Text>
      ) : (
        <>
          {/* Une seule ligne qui défile : la liste des exercices ne repousse pas la courbe hors de l'écran. */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {courbes.map((x) => (
              <Puce key={x.exerciceId} libelle={x.nom} actif={x.exerciceId === c.exerciceId} onPress={() => setExo(x.exerciceId)} />
            ))}
          </ScrollView>
          <Ligne>
            {possibles.map((x) => (
              <Action key={x.cle} petit variante={x.cle === m?.cle ? 'plein' : 'contour'} libelle={x.libelle} onPress={() => setMesure(x.cle)} />
            ))}
          </Ligne>
          {m && points.length >= 2 ? (
            <Courbe key={`${c.exerciceId}-${m.cle}`} points={points} unite={m.unite} libelle={`${c.nom}, ${m.libelle}`} />
          ) : (
            <Text style={ts.doux}>
              {m && points.length === 1
                ? `Une seule séance pour l’instant : ${formaterNombre(points[0].valeur)} ${m.unite}.`
                : 'Pas de mesure pour cet exercice.'}
            </Text>
          )}
        </>
      )}
    </View>
  );
}

function ParSemaine({ bilan, semaines }: { bilan: ReturnType<typeof bilanParSemaine>; semaines: ReturnType<typeof semainesDuCycle> }) {
  const max = Math.max(1, ...bilan.map((b) => b.volume));
  return (
    <View style={ts.carte}>
      <Text style={ts.titreSection}>Bilan par semaine</Text>
      {bilan.map((b, i) => {
        const s = semaines[i];
        const attendues = s.pastilles.filter((p) => p.statut !== 'prevue').length;
        return (
          <View key={b.debut} style={{ gap: 4 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
              <Text style={ts.titreChamp}>Semaine {s.numero}</Text>
              <Text style={ts.doux}>
                {b.seances}
                {attendues ? `/${Math.max(attendues, b.seances)}` : ''} séance{b.seances > 1 ? 's' : ''}
                {b.volume ? ` · ${b.volume.toLocaleString('fr-FR')} kg` : ''}
                {b.ressenti !== undefined ? ` · ressenti ${formaterNombre(b.ressenti)}/10` : ''}
              </Text>
            </View>
            <View style={{ height: 8, borderRadius: 4, backgroundColor: couleurs.discret, overflow: 'hidden' }}>
              <View style={{ width: `${(b.volume / max) * 100}%`, height: 8, borderRadius: 4, backgroundColor: couleurs.rouge }} />
            </View>
          </View>
        );
      })}
      <Text style={ts.doux}>La barre montre le tonnage (charges × répétitions) de la semaine.</Text>
    </View>
  );
}
