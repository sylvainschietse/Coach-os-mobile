// MyCalendar.tsx d'origine (U03) : semaine du lundi au dimanche, objectif hebdomadaire du programme, créneaux
// prévus (Démarrer, Déplacer, Annuler) ou réalisés, et « Planifier une séance ».
// Écart : la planification s'ouvre dans une fenêtre (séance, jour en un appui, heure facultative) au lieu d'un
// formulaire replié en bas de carte, où l'erreur s'affichait hors de l'écran et le jour se tapait en jj/mm/aaaa.
// Seuls les jours qui ont une séance s'affichent : l'accueil reste court.
import { CalendarDays, CalendarPlus, CheckCircle2, ChevronLeft, ChevronRight } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';

import { entrainement } from '@/data/entrainement';
import { ajouterJours, aujourdhuiParis, jourParis, lundiDe, titreClient } from '@/domain/entrainement';
import type { EspaceEntrainement, Planification } from '@/domain/entrainement-etat';
import { ecrireBrouillon } from '@/lib/brouillon';
import { nouvelId } from '@/lib/identifiant';

import { Puce, Puces } from '../composants';
import { Saisie } from '../crm/dossier';
import { couleurs, polices } from '../theme';
import { Action, Confirmation, Etat, Ligne, ts } from './commun';

type Formulaire = { id?: string; seanceId: string; date: string; heure: string; envoiId: string };

const court = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const long = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'UTC' });
const puce = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', timeZone: 'UTC' });
const HEURE = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;
/** Jours proposés dans la fenêtre : du premier jour possible à la fin du cycle, six semaines au plus. */
const MAX_JOURS = 42;

/** Le jour où compte un créneau : celui de la réalisation pour une séance faite. */
export const jourDuCreneau = (e: Planification) => (e.statut === 'Réalisée' && e.realiseeLe ? jourParis(e.realiseeLe) : e.date);

export function MonCalendrier({
  clientId,
  espace,
  creneaux,
  erreurChargement,
  apercu,
  onDemarrer,
  onChange,
}: {
  clientId: string;
  espace: EspaceEntrainement;
  /** null : en cours de lecture. */
  creneaux: Planification[] | null;
  erreurChargement?: string | null;
  apercu?: boolean;
  onDemarrer: (seanceId: string, planificationId?: string) => void;
  /** Un créneau a été ajouté, déplacé ou annulé : le calendrier se relit. */
  onChange: () => void;
}) {
  const c = espace.cycle!;
  const aujourdhui = aujourdhuiParis();
  const premierJour = [aujourdhui, c.debut].sort().pop()!;
  const [semaine, setSemaine] = useState(lundiDe(aujourdhui));
  const [f, setF] = useState<Formulaire | null>(null);
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState('');
  const [message, setMessage] = useState('');
  const verrou = useRef(false);

  // L'ancien formulaire replié gardait un brouillon sur l'appareil : on l'efface, la fenêtre n'en a plus besoin.
  useEffect(() => {
    ecrireBrouillon(`coachos-calendar:${clientId}:${c.id}`, null);
  }, [clientId, c.id]);

  const joursPossibles: string[] = [];
  for (let j = premierJour; j <= c.fin && joursPossibles.length < MAX_JOURS; j = ajouterJours(j, 1)) joursPossibles.push(j);

  const nouveau = (date?: string) => {
    setMessage('');
    setErreur('');
    setF({ seanceId: espace.seances[0]?.id ?? '', date: date && joursPossibles.includes(date) ? date : (joursPossibles[0] ?? ''), heure: '', envoiId: nouvelId() });
  };

  const enregistrer = async () => {
    if (!f || apercu) return;
    if (!f.seanceId) throw new Error('Choisissez une séance');
    if (!f.date) throw new Error('Choisissez un jour');
    const heure = f.heure.trim().replace(/[h.]/i, ':');
    if (heure && !HEURE.test(heure)) throw new Error('Heure invalide : écrivez-la comme 18:30');
    await entrainement.planifier(clientId, { id: f.id, cycleId: c.id, seanceId: f.seanceId, date: f.date, heure: heure || undefined, envoiId: f.envoiId });
    setSemaine(lundiDe(f.date));
    setMessage(f.id ? 'Séance déplacée.' : 'Séance ajoutée à votre calendrier.');
    onChange();
  };

  const annuler = async (id: string) => {
    if (verrou.current || apercu) return;
    verrou.current = true;
    setOccupe(true);
    setErreur('');
    setMessage('');
    try {
      await entrainement.annulerCreneau(clientId, id);
      setMessage('Créneau annulé.');
      onChange();
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Annulation impossible');
    } finally {
      setOccupe(false);
      verrou.current = false;
    }
  };

  const fin = ajouterJours(semaine, 6);
  const visibles = (creneaux ?? []).filter((e) => e.statut !== 'Annulée' && jourDuCreneau(e) >= semaine && jourDuCreneau(e) <= fin);
  const jours = [...new Set(visibles.map(jourDuCreneau))].sort();
  const faites = visibles.filter((e) => e.statut === 'Réalisée').length;
  const prevues = visibles.filter((e) => e.statut === 'Prévue').length;
  const objectif = espace.programme?.seancesParSemaine || 0;
  const disponible = c.statut === 'Actif' && c.etat !== 'depasse' && espace.seances.length > 0 && joursPossibles.length > 0 && !apercu;
  const s = (n: number) => (n > 1 ? 's' : '');

  return (
    <View style={[ts.carte, { borderRadius: 16, padding: 18, gap: 14 }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <CalendarDays size={20} color={couleurs.rouge} />
        <Text style={ts.titre}>Mon calendrier</Text>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <Action variante="contour" icone={ChevronLeft} nom="Semaine précédente" onPress={() => setSemaine(ajouterJours(semaine, -7))} />
        <View style={{ alignItems: 'center', flexShrink: 1 }}>
          <Text style={[ts.texte, { fontFamily: polices.texteGras }]}>
            {court(semaine)} – {court(fin)}
          </Text>
          {semaine !== lundiDe(aujourdhui) && (
            <Text accessibilityRole="button" onPress={() => setSemaine(lundiDe(aujourdhui))} style={{ marginTop: 2, fontFamily: polices.texte, fontSize: 12, color: couleurs.rouge, textDecorationLine: 'underline' }}>
              Revenir à cette semaine
            </Text>
          )}
        </View>
        <Action variante="contour" icone={ChevronRight} nom="Semaine suivante" onPress={() => setSemaine(ajouterJours(semaine, 7))} />
      </View>

      <View style={{ borderRadius: 12, backgroundColor: 'rgba(195,24,30,0.05)', padding: 14, gap: 4 }}>
        <Text style={ts.texte}>
          <Text style={{ fontFamily: polices.texteGras }}>
            {faites}
            {objectif ? ` / ${objectif}` : ''}
          </Text>{' '}
          séance{s(faites)} réalisée{s(faites)}
          {prevues ? ` · ${prevues} prévue${s(prevues)}` : ''}
        </Text>
        {!!objectif && (
          <View
            accessibilityRole="progressbar"
            aria-label="Séances réalisées par rapport à l’objectif hebdomadaire"
            aria-valuemin={0}
            aria-valuemax={objectif}
            aria-valuenow={Math.min(faites, objectif)}
            style={{ marginTop: 6, height: 8, borderRadius: 4, overflow: 'hidden', backgroundColor: 'rgba(195,24,30,0.1)' }}
          >
            <View style={{ height: '100%', borderRadius: 4, backgroundColor: couleurs.rouge, width: `${Math.min(100, (faites / objectif) * 100)}%` }} />
          </View>
        )}
      </View>

      <Etat erreur={erreur || erreurChargement || undefined} message={message} />
      {!creneaux && !erreurChargement ? (
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
          <ActivityIndicator size="small" color={couleurs.rouge} />
          <Text style={ts.texte}>Chargement du calendrier…</Text>
        </View>
      ) : !jours.length ? (
        <Text style={ts.doux}>Aucune séance prévue cette semaine.</Text>
      ) : (
        <View style={{ gap: 8 }}>
          {jours.map((jour) => {
            const auj = jour === aujourdhui;
            return (
              <View key={jour} style={{ borderWidth: 1, borderColor: auj ? 'rgba(195,24,30,0.4)' : couleurs.bordure, backgroundColor: auj ? 'rgba(195,24,30,0.05)' : undefined, borderRadius: 12, padding: 12, gap: 8 }}>
                <Text style={{ fontFamily: polices.texteGras, fontSize: 12, color: auj ? couleurs.rouge : couleurs.texte }}>{auj ? `Aujourd’hui · ${long(jour)}` : long(jour)}</Text>
                {visibles
                  .filter((e) => jourDuCreneau(e) === jour)
                  .map((e) => (
                    <View key={e.id} style={{ borderRadius: 8, backgroundColor: couleurs.fond, padding: 12, gap: 6 }}>
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                        <Text style={[ts.texte, { fontFamily: polices.texteMoyen, flexShrink: 1 }]}>{titreClient(e.seanceTitre)}</Text>
                        {e.statut === 'Réalisée' ? (
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                            <CheckCircle2 size={12} color={couleurs.rouge} />
                            <Text style={{ fontFamily: polices.texte, fontSize: 12, color: couleurs.rouge }}>Réalisée</Text>
                          </View>
                        ) : (
                          <Text style={ts.doux}>{e.date < aujourdhui ? 'À reprogrammer' : e.heure ? `à ${e.heure}` : 'Prévue'}</Text>
                        )}
                      </View>
                      {e.statut === 'Réalisée' && e.date !== jourDuCreneau(e) && <Text style={ts.doux}>Initialement prévue le {court(e.date)}</Text>}
                      {e.statut === 'Prévue' && (
                        <Ligne style={{ marginTop: 4 }}>
                          <Action
                            petit
                            libelle="Démarrer"
                            desactive={occupe || !disponible || !espace.seances.some((x) => x.id === e.seanceId)}
                            onPress={() => onDemarrer(e.seanceId, e.id)}
                          />
                          <Action
                            petit
                            variante="contour"
                            libelle="Déplacer"
                            desactive={occupe || !disponible}
                            onPress={() => {
                              setMessage('');
                              setF({ id: e.id, seanceId: e.seanceId, date: joursPossibles.includes(e.date) ? e.date : (joursPossibles[0] ?? ''), heure: e.heure ?? '', envoiId: nouvelId() });
                            }}
                          />
                          <Action petit variante="fantome" libelle="Annuler" desactive={occupe || apercu} onPress={() => annuler(e.id)} />
                        </Ligne>
                      )}
                    </View>
                  ))}
              </View>
            );
          })}
        </View>
      )}

      {disponible && <Action libelle="Planifier une séance" icone={CalendarPlus} variante="contour" onPress={() => nouveau()} />}

      {f && (
        <Confirmation titre={f.id ? 'Déplacer la séance' : 'Planifier une séance'} action={f.id ? 'Déplacer' : 'Ajouter au calendrier'} onConfirmer={enregistrer} onFermer={() => setF(null)}>
          <View style={{ gap: 8 }}>
            <Text style={ts.titreChamp}>Quelle séance ?</Text>
            <Puces>
              {espace.seances.map((x) => (
                <Puce key={x.id} libelle={titreClient(x.titre)} actif={f.seanceId === x.id} onPress={() => setF({ ...f, seanceId: x.id })} />
              ))}
            </Puces>
          </View>
          <View style={{ gap: 8 }}>
            <Text style={ts.titreChamp}>Quel jour ?</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {joursPossibles.map((j) => (
                <Puce key={j} libelle={j === aujourdhui ? 'Aujourd’hui' : puce(j)} actif={f.date === j} onPress={() => setF({ ...f, date: j })} />
              ))}
            </ScrollView>
            {!!f.date && <Text style={ts.doux}>{long(f.date)}</Text>}
          </View>
          <Saisie libelle="Heure (facultatif)" placeholder="18:30" valeur={f.heure} onChange={(v) => setF({ ...f, heure: v })} />
        </Confirmation>
      )}
    </View>
  );
}
