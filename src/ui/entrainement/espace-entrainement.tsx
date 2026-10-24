// ClientView.tsx d'origine (U02) : hero, cycle en cours et avancement, « Mon accompagnement », calendrier, consignes
// du programme et « Mes séances au programme » à noter sur place. La vue « historique » montre les séances
// enregistrées (U06). Repos entre les séries : bandeau en bas de l'écran, comme le minuteur actif de l'original.
import { ArrowUpRight, CalendarRange, Lock, RefreshCw, X } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Platform, Text, View } from 'react-native';

import { depot } from '@/data';
import { entrainement } from '@/data/entrainement';
import { titreClient, type Reference } from '@/domain/entrainement';
import type { EspaceEntrainement } from '@/domain/entrainement-etat';
import { demanderSortie, enregistrerGarde } from '@/lib/brouillon';
import { maintenantMs } from '@/lib/temps';
import { useCharger } from '@/lib/useCharger';
import { vibrer } from '@/lib/vibrer';

import { BoutonContour, Hero } from '../coque';
import { Badge, Repliable } from '../crm/dossier';
import { couleurs, polices } from '../theme';
import { MonCalendrier } from './calendrier';
import { Action, Confirmation, TexteLong, jourCourt, ts } from './commun';
import { Historique, nbSeries } from './historique';
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

/** Monté hors du défilement par l'espace client, juste au-dessus de la barre du bas. */
export function BandeauRepos({ fin, libelle, onFermer }: { fin: number; libelle: string; onFermer: () => void }) {
  const [maintenant, setMaintenant] = useState(maintenantMs);
  useEffect(() => {
    const t = setInterval(() => setMaintenant(maintenantMs()), 250);
    return () => clearInterval(t);
  }, []);
  // Calculé depuis l'heure de fin : reste juste si l'écran a été verrouillé.
  const restant = Math.max(0, Math.ceil((fin - maintenant) / 1000));
  useEffect(() => {
    if (restant === 0) vibrer();
  }, [restant]);
  return (
    <View
      accessibilityLabel="Minuteur actif"
      style={[
        { position: 'absolute', left: 12, right: 12, bottom: 84, zIndex: 40, maxWidth: 576, marginHorizontal: 'auto' },
        ts.carte,
        { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 16, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 16 },
      ]}
    >
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={ts.doux}>
          {libelle}
        </Text>
        <Text style={[ts.texte, { fontFamily: polices.texteGras }]}>
          {restant ? 'Repos' : 'Terminé'}{' '}
          <Text role="timer" style={{ fontFamily: polices.chiffres, fontSize: 22 }}>
            {Math.floor(restant / 60)}:{String(restant % 60).padStart(2, '0')}
          </Text>
        </Text>
      </View>
      <Action variante="fantome" icone={X} nom="Arrêter et fermer le minuteur" onPress={onFermer} />
    </View>
  );
}

export function EntrainementClient({
  clientId,
  prenom,
  apercu,
  vue,
  onAller,
  onRepos,
}: {
  clientId: string;
  prenom: string;
  apercu?: boolean;
  vue: 'programme' | 'historique';
  onAller?: (o: 'suivi' | 'nutrition') => void;
  onRepos: (r: { fin: number; libelle: string }) => void;
}) {
  const { donnee: espace, erreur, recharger } = useCharger(() => entrainement.espaceClient(clientId), `espace-${clientId}`);
  const records = useCharger(() => depot.records(clientId), `records-${clientId}`);
  const [version, setVersion] = useState(0);
  const [ouverture, setOuverture] = useState<{ seanceId: string; planificationId?: string; jeton: number } | null>(null);
  const references: Reference[] = (records.donnee ?? [])
    .filter((r) => r.unite === 'kg' && r.exerciceId)
    .map((r) => ({ exerciceId: r.exerciceId!, charge: r.valeur, repetitions: r.repetitions ?? 1, date: r.date }));

  const historique = vue === 'historique';
  const ouvrir = (seanceId: string, planificationId?: string) => {
    setOuverture({ seanceId, planificationId, jeton: Date.now() });
    if (Platform.OS === 'web')
      requestAnimationFrame(() => document.getElementById(`seance-${seanceId}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };

  return (
    <>
      <GardeBrouillon />
      <Hero
        kicker={historique ? 'Votre progression' : 'Votre entraînement'}
        titre={historique ? 'Mes séances' : `Bonjour, ${prenom.trim().split(/\s+/)[0]}`}
        sousTitre={historique ? 'Retrouvez vos séances enregistrées et vos ressentis.' : 'Votre prochaine séance commence ici.'}
        droite={<BoutonContour nom="Actualiser mon programme" icone={RefreshCw} onPress={() => demanderSortie(recharger)} />}
      >
        {!historique && onAller && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            <BoutonContour libelle="Mon bilan de la semaine" icone={ArrowUpRight} onPress={() => onAller('suivi')} />
            <BoutonContour libelle="Ma nutrition" icone={ArrowUpRight} onPress={() => onAller('nutrition')} />
          </View>
        )}
      </Hero>

      {erreur && !espace ? (
        <View accessibilityRole="alert" style={[ts.carte, { borderColor: 'rgba(195,24,30,0.4)' }]}>
          <Text style={ts.texte}>{erreur}</Text>
          <View style={{ alignSelf: 'flex-start' }}>
            <Action libelle="Réessayer" onPress={recharger} />
          </View>
        </View>
      ) : !espace ? (
        <View style={{ height: 256, borderRadius: 12, backgroundColor: couleurs.discret }} />
      ) : historique ? (
        <>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={ts.titreSection}>Historique</Text>
            <Badge libelle={`${nbSeries(espace)} série${nbSeries(espace) > 1 ? 's' : ''}`} />
          </View>
          <Historique espace={espace} />
        </>
      ) : (
        <>
          {espace.cycle ? (
            <View style={[ts.carte, { borderRadius: 16, gap: 4 }]}>
              <Text style={ts.kicker}>{espace.cycle.etat === 'a_venir' ? 'Cycle à venir' : espace.cycle.etat === 'depasse' ? 'Cycle terminé (dates dépassées)' : 'Cycle en cours'}</Text>
              <Text style={{ fontFamily: polices.titre, fontSize: 24, letterSpacing: 0.5, color: couleurs.texte }}>{espace.cycle.nom}</Text>
              <Text style={ts.texte}>
                {espace.cycle.semaine ? (
                  <>
                    Semaine <Text style={{ fontFamily: polices.texteGras }}>{espace.cycle.semaine}</Text>
                    {espace.cycle.nbSemaines ? ` sur ${espace.cycle.nbSemaines}` : ''} ·{' '}
                  </>
                ) : espace.cycle.etat === 'a_venir' ? (
                  'Commence le '
                ) : (
                  ''
                )}
                {jourCourt(espace.cycle.debut)} → {jourCourt(espace.cycle.fin)}
              </Text>
              {espace.programme && <Text style={ts.doux}>{titreClient(espace.programme.titre)}</Text>}
              <View style={{ marginTop: 4 }}>
                <TexteLong texte={espace.cycle.objectif} />
              </View>
              {espace.cycle.etat === 'en_cours' && !!espace.cycle.semaine && espace.cycle.nbSemaines > 0 && (
                <View style={{ marginTop: 12, gap: 8 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text style={ts.doux}>Avancement du cycle</Text>
                    <Text style={ts.doux}>
                      {espace.cycle.semaine} / {espace.cycle.nbSemaines} semaines
                    </Text>
                  </View>
                  <View
                    accessibilityRole="progressbar"
                    aria-label="Avancement du cycle"
                    aria-valuemin={0}
                    aria-valuemax={espace.cycle.nbSemaines}
                    aria-valuenow={Math.min(espace.cycle.semaine, espace.cycle.nbSemaines)}
                    style={{ height: 8, borderRadius: 4, overflow: 'hidden', backgroundColor: couleurs.discret }}
                  >
                    <View style={{ height: '100%', backgroundColor: couleurs.rouge, width: `${(Math.min(espace.cycle.semaine, espace.cycle.nbSemaines) / espace.cycle.nbSemaines) * 100}%` }} />
                  </View>
                </View>
              )}
            </View>
          ) : (
            <View style={[ts.carte, { borderRadius: 16, padding: 24 }]}>
              <Text style={ts.titre}>Votre programme se prépare</Text>
              <Text style={[ts.texte, { color: couleurs.texteDoux }]}>Votre coach activera votre prochain cycle ici. Vous pourrez alors consulter vos séances.</Text>
            </View>
          )}
          <Planning espace={espace} />
          {espace.cycle && (
            <MonCalendrier
              key={`${clientId}:${espace.cycle.id}`}
              clientId={clientId}
              espace={espace}
              version={version}
              apercu={apercu}
              onOuvrir={ouvrir}
              onChange={() => setOuverture(null)}
            />
          )}
          <TexteLong texte={espace.programme?.consignes} libelle="Consignes" />
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
                  <Text style={ts.doux}>{apercu ? 'Aperçu : seul le client peut noter une séance.' : 'Suivez les consignes, puis notez ce que vous avez réalisé.'}</Text>
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
                  planificationId={ouverture?.seanceId === s.id ? ouverture.planificationId : undefined}
                  ouverture={ouverture?.seanceId === s.id ? ouverture.jeton : undefined}
                  apercu={apercu}
                  onRepos={(secondes, libelle) => onRepos({ fin: maintenantMs() + secondes * 1000, libelle })}
                  onEnregistre={() => {
                    setOuverture(null);
                    setVersion((v) => v + 1);
                    recharger();
                  }}
                />
              ))}
            </View>
          )}
        </>
      )}
    </>
  );
}
