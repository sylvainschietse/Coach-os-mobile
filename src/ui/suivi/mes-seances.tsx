// Suivi › Mes séances : le même tableau « semaine par semaine » que le coach, vu par le client, avec un seul bouton
// « Ajouter une séance » : soit une séance de son programme (y compris faite un jour précédent), soit une autre
// activité (cours collectif, sport, séance à lui) avec ses détails.
import { router } from 'expo-router';
import { Dumbbell, PlayCircle, Plus, Sparkles } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { depot } from '@/data';
import { activites } from '@/data/activites';
import { entrainement } from '@/data/entrainement';
import { estLibre, titreActivite, type Activite } from '@/domain/activites';
import { ajouterJours, aujourdhuiParis, jourParis, titreClient, type Reference } from '@/domain/entrainement';
import { lireDate } from '@/domain/programmes';
import { assiduite, semainesDuCycle } from '@/domain/suivi-entrainement';
import { useCharger } from '@/lib/useCharger';

import { ChampTexte, Puce, Puces } from '../composants';
import { Action, jourCourt, Ligne, ts } from '../entrainement/commun';
import { GrilleSemaines, Legende, type Choix } from '../entrainement/grille-semaines';
import { useMinuteurs } from '../entrainement/minuteurs';
import { SeanceLog } from '../entrainement/seance-log';
import { DetailSeance } from '../entrainement/suivi-client';
import { couleurs, polices } from '../theme';
import { DetailActiviteLibre, FormulaireActiviteLibre, resumeActivite } from './activite-libre';

type Jour = 'aujourdhui' | 'hier' | 'avant-hier' | 'autre';
type Ajout = null | { quoi: 'menu' } | { quoi: 'autre' } | { quoi: 'programme'; seanceId?: string; jour?: string; depuisPastille?: boolean };

export function MesSeances({ clientId, apercu }: { clientId: string; apercu?: boolean }) {
  const espace = useCharger(() => entrainement.espaceClient(clientId), `espace-suivi-${clientId}`);
  const cycle = espace.donnee?.cycle;
  const calendrier = useCharger(() => (cycle ? entrainement.calendrier(clientId, cycle.id) : Promise.resolve([])), `calendrier-suivi-${clientId}-${cycle?.id ?? ''}`);
  // Toutes ses activités hors programme (saisies ou venues de la montre) ; seules les saisies se modifient.
  const libres = useCharger(() => activites.liste(clientId, 200).catch(() => [] as Activite[]), `libres-suivi-${clientId}`);
  const records = useCharger(() => depot.records(clientId).catch(() => []), `records-suivi-${clientId}`);
  const minuteurs = useMinuteurs();
  const [choix, setChoix] = useState<Choix>();
  const [ajout, setAjout] = useState<Ajout>(null);
  const [modif, setModif] = useState<Activite>();
  const [merci, setMerci] = useState('');

  const jour = aujourdhuiParis();
  const realisations = useMemo(() => (espace.donnee?.realisations ?? []).filter((r) => cycle && r.cycleId === cycle.id), [espace.donnee, cycle]);
  const semaines = useMemo(
    () =>
      cycle && calendrier.donnee
        ? semainesDuCycle({
            cycle,
            planifications: calendrier.donnee,
            realisations,
            seancesParSemaine: espace.donnee?.programme?.seancesParSemaine,
            jour,
            libres: (libres.donnee ?? []).map((a) => ({ id: a.id, titre: titreActivite(a), date: jourParis(a.debut) })),
          })
        : [],
    [cycle, calendrier.donnee, realisations, espace.donnee, jour, libres.donnee],
  );
  const prescriptions = useMemo(() => {
    const p: Record<string, { series: number; repetitions?: string }> = {};
    for (const s of espace.donnee?.seances ?? []) for (const b of s.blocs) for (const l of b.lignes) p[l.id] = { series: l.series, repetitions: l.repetitions };
    return p;
  }, [espace.donnee]);
  const references: Reference[] = (records.donnee ?? [])
    .filter((r) => r.reference && r.unite === 'kg' && r.exerciceId)
    .map((r) => ({ exerciceId: r.exerciceId!, charge: r.valeur, repetitions: r.repetitions ?? 1, date: r.date }));

  const toutRecharger = () => {
    espace.recharger();
    calendrier.recharger();
    libres.recharger();
  };
  const fini = (message: string) => {
    setAjout(null);
    setModif(undefined);
    setMerci(message);
    setChoix(undefined);
    toutRecharger();
  };

  const derniere = [...realisations].sort((a, b) => b.fin.localeCompare(a.fin))[0];
  const pastille = choix ? semaines[choix.semaine - 1]?.pastilles[choix.index] : undefined;
  const r = realisations.find((x) => x.id === (choix ? pastille?.realisationId : derniere?.id));
  const libre = pastille?.activiteId ? libres.donnee?.find((a) => a.id === pastille.activiteId) : undefined;
  const a = assiduite(semaines);

  if (espace.erreur && !espace.donnee) return <Text style={ts.erreur}>{espace.erreur}</Text>;
  if (!espace.donnee) return <Text style={ts.doux}>Chargement…</Text>;

  const bouton = !apercu && (
    <Action
      icone={Plus}
      libelle="Ajouter une séance"
      onPress={() => {
        setMerci('');
        setModif(undefined);
        setAjout({ quoi: 'menu' });
      }}
    />
  );

  return (
    <View style={{ gap: 16 }}>
      {ajout?.quoi === 'menu' && (
        <View style={[ts.carte, { borderColor: couleurs.noir, borderWidth: 2 }]}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={ts.titre}>Quelle séance ?</Text>
            <Pressable accessibilityRole="button" onPress={() => setAjout(null)} hitSlop={12}>
              <Text style={ts.doux}>Fermer</Text>
            </Pressable>
          </View>
          {cycle && espace.donnee.seances.length > 0 && (
            <GrosChoix
              icone={Dumbbell}
              titre="Une séance de mon programme"
              detail="Je note ce que j’ai fait : charges, répétitions, ressenti."
              onPress={() => setAjout({ quoi: 'programme' })}
            />
          )}
          <GrosChoix
            icone={Sparkles}
            titre="Une autre activité"
            detail="Cours collectif, sport, séance à moi… avec la durée, l’effort et les kcal si je les connais."
            onPress={() => setAjout({ quoi: 'autre' })}
          />
        </View>
      )}
      {ajout?.quoi === 'autre' && (
        <FormulaireActiviteLibre clientId={clientId} onFermer={() => setAjout(null)} onEnregistre={() => fini('C’est noté, ton activité est dans ton tableau.')} />
      )}
      {modif && <FormulaireActiviteLibre clientId={clientId} existante={modif} onFermer={() => setModif(undefined)} onEnregistre={() => fini('Activité mise à jour.')} />}
      {ajout?.quoi === 'programme' && !ajout.depuisPastille && cycle && (
        <SeanceDuProgramme
          clientId={clientId}
          cycle={cycle}
          seances={espace.donnee.seances}
          historique={espace.donnee.realisations}
          references={references}
          seanceInitiale={ajout.seanceId}
          jourInitial={ajout.jour}
          onRepos={(s, l) => minuteurs?.repos(s, l)}
          onFermer={() => setAjout(null)}
          onEnregistre={() => fini('C’est noté, ta séance est dans ton tableau.')}
        />
      )}

      <View style={ts.carte}>
        <Text style={ts.titreSection}>Semaine par semaine</Text>
        {!cycle ? (
          <>
            <Text style={ts.doux}>Ton coach n’a pas encore lancé ton programme. Tu peux déjà noter tes autres activités.</Text>
            {!ajout && bouton}
          </>
        ) : (
          <>
            <Text style={ts.doux}>
              {cycle.nom} · {jourCourt(cycle.debut)} → {jourCourt(cycle.fin)}
              {a.taux !== undefined ? ` · ${a.faites} séance${a.faites > 1 ? 's' : ''} faite${a.faites > 1 ? 's' : ''} sur ${a.faites + a.manquees} (${a.taux} %)` : ''}
            </Text>
            {!ajout && !modif && bouton}
            {!!merci && <Text style={{ fontFamily: polices.texteMoyen, fontSize: 14, color: couleurs.vert }}>{merci}</Text>}
            <Legende />
            {!calendrier.donnee ? (
              <Text style={ts.doux}>Chargement…</Text>
            ) : (
              <GrilleSemaines
                semaines={semaines}
                estChoisi={(c, p) => (choix ? choix.semaine === c.semaine && choix.index === c.index : !!p.realisationId && p.realisationId === derniere?.id)}
                onChoisir={(c) => {
                  if (ajout?.quoi === 'programme' && ajout.depuisPastille) setAjout(null);
                  setChoix(c);
                }}
              />
            )}
            {libre ? (
              <View style={{ borderTopWidth: 1, borderTopColor: couleurs.bordure, paddingTop: 12, gap: 8 }}>
                <Text style={ts.titre}>{titreActivite(libre)}</Text>
                <Text style={ts.doux}>
                  Le {jourCourt(jourParis(libre.debut))} · {resumeActivite(libre)}
                </Text>
                <DetailActiviteLibre a={libre} />
                {!apercu && estLibre(libre) && (
                  <Ligne>
                    <Action petit variante="contour" libelle="Modifier" onPress={() => (setAjout(null), setModif(libre))} />
                  </Ligne>
                )}
              </View>
            ) : r ? (
              <DetailSeance r={r} toutes={espace.donnee.realisations} prescriptions={prescriptions} videos={[]} />
            ) : pastille ? (
              <View style={{ borderTopWidth: 1, borderTopColor: couleurs.bordure, paddingTop: 12, gap: 8 }}>
                <Text style={ts.titre}>{titreClient(pastille.titre)}</Text>
                <Text style={ts.doux}>
                  {pastille.statut === 'manquee'
                    ? pastille.date
                      ? `Prévue le ${jourCourt(pastille.date)}, pas notée.`
                      : 'Séance attendue cette semaine-là, pas notée.'
                    : pastille.date
                      ? `Prévue le ${jourCourt(pastille.date)}.`
                      : 'Séance attendue cette semaine, pas encore planifiée.'}
                </Text>
                {/* Faite mais oubliée : on la note pour ce jour-là, juste ici sous le tableau. */}
                {ajout?.quoi === 'programme' && ajout.depuisPastille ? (
                  <SeanceDuProgramme
                    key={`${ajout.seanceId}:${ajout.jour}`}
                    integre
                    clientId={clientId}
                    cycle={cycle}
                    seances={espace.donnee.seances}
                    historique={espace.donnee.realisations}
                    references={references}
                    seanceInitiale={ajout.seanceId}
                    jourInitial={ajout.jour}
                    onRepos={(s, l) => minuteurs?.repos(s, l)}
                    onFermer={() => setAjout(null)}
                    onEnregistre={() => fini('C’est noté, ta séance est dans ton tableau.')}
                  />
                ) : !apercu && pastille.statut === 'manquee' && espace.donnee.seances.length > 0 ? (
                  <Ligne>
                    <Action
                      petit
                      variante="contour"
                      libelle="Je l’ai faite, la noter"
                      onPress={() => {
                        setMerci('');
                        setAjout({
                          quoi: 'programme',
                          seanceId: espace.donnee!.seances.find((s) => s.titre === pastille.titre)?.id,
                          jour: pastille.date,
                          depuisPastille: true,
                        });
                      }}
                    />
                  </Ligne>
                ) : null}
              </View>
            ) : (
              <Text style={ts.doux}>Touche une pastille pour voir le détail de la séance.</Text>
            )}
          </>
        )}
      </View>
    </View>
  );
}

function GrosChoix({ icone: Icone, titre, detail, onPress }: { icone: typeof Plus; titre: string; detail: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        borderWidth: 1,
        borderColor: couleurs.bordure,
        borderRadius: 12,
        padding: 14,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: couleurs.fond, alignItems: 'center', justifyContent: 'center' }}>
        <Icone size={20} color={couleurs.rouge} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={ts.titre}>{titre}</Text>
        <Text style={ts.doux}>{detail}</Text>
      </View>
    </Pressable>
  );
}

type Espace = NonNullable<Awaited<ReturnType<typeof entrainement.espaceClient>>>;

/** Une séance du programme à noter : laquelle, quel jour, puis la saisie habituelle. */
function SeanceDuProgramme({
  clientId,
  cycle,
  seances,
  historique,
  references,
  seanceInitiale,
  jourInitial,
  onRepos,
  onFermer,
  onEnregistre,
  integre,
}: {
  /** Ouverte sous une pastille du tableau : sans cadre, déjà dans la carte. */
  integre?: boolean;
  clientId: string;
  cycle: NonNullable<Espace['cycle']>;
  seances: Espace['seances'];
  historique: Espace['realisations'];
  references: Reference[];
  seanceInitiale?: string;
  jourInitial?: string;
  onRepos: (secondes: number, libelle: string) => void;
  onFermer: () => void;
  onEnregistre: () => void;
}) {
  const aujourdhui = aujourdhuiParis();
  const [seanceId, setSeanceId] = useState(seanceInitiale);
  const initial: Jour =
    !jourInitial || jourInitial === aujourdhui ? 'aujourdhui' : jourInitial === ajouterJours(aujourdhui, -1) ? 'hier' : jourInitial === ajouterJours(aujourdhui, -2) ? 'avant-hier' : 'autre';
  const [quand, setQuand] = useState<Jour>(initial);
  const [autreDate, setAutreDate] = useState((jourInitial ?? aujourdhui).split('-').reverse().join('/'));
  const date =
    quand === 'aujourdhui' ? aujourdhui : quand === 'hier' ? ajouterJours(aujourdhui, -1) : quand === 'avant-hier' ? ajouterJours(aujourdhui, -2) : lireDate(autreDate);
  const horsCycle = !!date && (date < cycle.debut || date > aujourdhui);
  const seance = seances.find((s) => s.id === seanceId);
  const ouvert = cycle.statut === 'Actif' && cycle.etat !== 'depasse';

  return (
    <View style={integre ? { gap: 12 } : [ts.carte, { borderColor: couleurs.noir, borderWidth: 2 }]}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <Text style={[ts.titre, { flexShrink: 1 }]}>{integre ? 'Noter cette séance' : 'Une séance de mon programme'}</Text>
        <Pressable accessibilityRole="button" onPress={onFermer} hitSlop={12}>
          <Text style={ts.doux}>Fermer</Text>
        </Pressable>
      </View>
      {!ouvert ? (
        <Text style={ts.doux}>Ton programme est terminé : demande à ton coach de lancer le suivant.</Text>
      ) : (
        <>
          <View style={{ gap: 8 }}>
            <Text style={ts.titreChamp}>Laquelle ?</Text>
            <Puces>
              {seances.map((s) => (
                <Puce key={s.id} libelle={`J${s.ordre || '?'} · ${titreClient(s.titre)}`} actif={s.id === seanceId} onPress={() => setSeanceId(s.id)} />
              ))}
            </Puces>
          </View>
          <View style={{ gap: 8 }}>
            <Text style={ts.titreChamp}>Quand ?</Text>
            <Puces>
              <Puce libelle="Aujourd’hui" actif={quand === 'aujourdhui'} onPress={() => setQuand('aujourdhui')} />
              <Puce libelle="Hier" actif={quand === 'hier'} onPress={() => setQuand('hier')} />
              <Puce libelle="Avant-hier" actif={quand === 'avant-hier'} onPress={() => setQuand('avant-hier')} />
              <Puce libelle="Autre jour" actif={quand === 'autre'} onPress={() => setQuand('autre')} />
            </Puces>
            {quand === 'autre' && (
              <ChampTexte libelle="Date" valeur={autreDate} onChange={setAutreDate} placeholder="26/10" erreur={autreDate && !date ? 'Écris la date comme 26/10' : undefined} />
            )}
            {horsCycle && (
              <Text style={ts.erreur}>Choisis un jour entre le début de ton programme ({jourCourt(cycle.debut)}) et aujourd’hui.</Text>
            )}
          </View>
          {/* Faite maintenant : la même séance guidée que depuis l'accueil (un bloc par page, vidéos). */}
          {seance && quand === 'aujourdhui' && seance.blocs.some((b) => b.lignes.length) && (
            <Action
              icone={PlayCircle}
              libelle="Démarrer la séance guidée"
              onPress={() => router.push({ pathname: '/client/seance-bloc', params: { seance: seance.id, plan: '' } })}
            />
          )}
          {seance && date && !horsCycle && (
            <SeanceLog
              key={`${seance.id}:${date}`}
              clientId={clientId}
              cycleId={cycle.id}
              seance={seance}
              historique={historique}
              references={references}
              jour={date}
              ouverteAuDepart
              onRepos={onRepos}
              onEnregistre={onEnregistre}
            />
          )}
        </>
      )}
    </View>
  );
}
