// MyCalendar.tsx d'origine (U03) : semaine du lundi au dimanche, objectif hebdomadaire du programme, créneaux
// prévus (Ouvrir, Déplacer, Annuler) ou réalisés, et formulaire « Planifier une séance » gardé en brouillon.
// Écart : date et heure en saisie texte (jj/mm/aaaa, hh:mm) au lieu des sélecteurs natifs du navigateur.
import { CalendarDays, CheckCircle2, ChevronLeft, ChevronRight } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { entrainement } from '@/data/entrainement';
import { ecrireJour, lireJour } from '@/domain/crm';
import { ajouterJours, aujourdhuiParis, jourParis, lundiDe, titreClient } from '@/domain/entrainement';
import type { EspaceEntrainement, Planification } from '@/domain/entrainement-etat';
import { demanderSortie, ecrireBrouillon, lireBrouillon } from '@/lib/brouillon';
import { nouvelId } from '@/lib/identifiant';

import { Selecteur } from '../coque';
import { Repliable, Saisie } from '../crm/dossier';
import { couleurs, polices } from '../theme';
import { Action, Etat, Ligne, ts } from './commun';

type Formulaire = { id?: string; seanceId: string; date: string; heure: string; envoiId: string };

const court = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const long = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'UTC' });
const HEURE = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;

export function MonCalendrier({
  clientId,
  espace,
  version,
  apercu,
  onOuvrir,
  onChange,
}: {
  clientId: string;
  espace: EspaceEntrainement;
  /** Augmente après chaque séance enregistrée : le calendrier se relit. */
  version: number;
  apercu?: boolean;
  onOuvrir: (seanceId: string, planificationId?: string) => void;
  onChange: () => void;
}) {
  const c = espace.cycle!;
  const aujourdhui = aujourdhuiParis();
  const premierJour = [aujourdhui, c.debut].sort().pop()!;
  const cle = `coachos-calendar:${clientId}:${c.id}`;
  const initial = (): Formulaire => ({ date: ecrireJour(premierJour), heure: '', seanceId: espace.seances[0]?.id ?? '', envoiId: nouvelId() });
  const [creneaux, setCreneaux] = useState<Planification[] | null>(null);
  const [semaine, setSemaine] = useState(lundiDe(aujourdhui));
  const [f, setF] = useState<Formulaire>(initial);
  const [ouvert, setOuvert] = useState(false);
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState('');
  const [message, setMessage] = useState('');
  const verrou = useRef(false);

  const [lecture, setLecture] = useState(0);
  const charger = () => setLecture((n) => n + 1);
  useEffect(() => {
    let annule = false;
    entrainement.calendrier(clientId, c.id).then(
      (x) => {
        if (annule) return;
        setCreneaux(x);
        setErreur('');
      },
      (e) => !annule && setErreur(e instanceof Error ? e.message : 'Calendrier indisponible'),
    );
    return () => {
      annule = true;
    };
  }, [clientId, c.id, version, lecture]);

  useEffect(() => {
    let annule = false;
    lireBrouillon<Formulaire>(cle).then((b) => {
      if (b && !annule && !apercu) {
        setF((x) => ({ ...x, ...b }));
        setOuvert(true);
        ecrireBrouillon(cle, b);
      }
    });
    return () => {
      annule = true;
    };
  }, [cle, apercu]);

  const changer = (suite: Formulaire) => {
    setF(suite);
    setMessage('');
    ecrireBrouillon(cle, suite);
  };

  const enregistrer = async (annulerId?: string) => {
    if (verrou.current || apercu) return;
    verrou.current = true;
    setOccupe(true);
    setErreur('');
    setMessage('');
    try {
      if (annulerId) await entrainement.annulerCreneau(clientId, annulerId);
      else {
        const date = lireJour(f.date);
        if (!date) throw new Error('Date invalide : écrivez-la au format jj/mm/aaaa');
        if (f.heure.trim() && !HEURE.test(f.heure.trim())) throw new Error('Heure invalide : écrivez-la au format hh:mm');
        await entrainement.planifier(clientId, { id: f.id, cycleId: c.id, seanceId: f.seanceId, date, heure: f.heure.trim() || undefined, envoiId: f.envoiId });
      }
      if (!annulerId || f.id === annulerId) {
        ecrireBrouillon(cle, null);
        setF(initial());
        setOuvert(false);
      }
      charger();
      onChange();
      setMessage(annulerId ? 'Créneau annulé.' : 'Créneau enregistré.');
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Enregistrement impossible');
    } finally {
      setOccupe(false);
      verrou.current = false;
    }
  };

  const fin = ajouterJours(semaine, 6);
  const jours = Array.from({ length: 7 }, (_, i) => ajouterJours(semaine, i));
  const jourDe = (e: Planification) => (e.statut === 'Réalisée' && e.realiseeLe ? jourParis(e.realiseeLe) : e.date);
  const visibles = (creneaux ?? []).filter((e) => e.statut !== 'Annulée' && jourDe(e) >= semaine && jourDe(e) <= fin);
  const faites = visibles.filter((e) => e.statut === 'Réalisée').length;
  const prevues = visibles.filter((e) => e.statut === 'Prévue').length;
  const objectif = espace.programme?.seancesParSemaine || 0;
  const disponible = c.statut === 'Actif' && c.etat !== 'depasse' && espace.seances.length > 0 && !apercu;
  const s = (n: number) => (n > 1 ? 's' : '');

  return (
    <View style={[ts.carte, { borderRadius: 16, padding: 18, gap: 14 }]}>
      <View style={{ gap: 6 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <CalendarDays size={20} color={couleurs.rouge} />
          <Text style={ts.titre}>Mon calendrier</Text>
        </View>
        <Text style={ts.doux}>Choisissez vos créneaux. Les séances enregistrées passent automatiquement en réalisées.</Text>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <Action variante="contour" icone={ChevronLeft} nom="Semaine précédente" onPress={() => setSemaine(ajouterJours(semaine, -7))} />
        <View style={{ alignItems: 'center', flexShrink: 1 }}>
          <Text style={[ts.texte, { fontFamily: polices.texteGras }]}>
            {court(semaine)} – {court(fin)}
          </Text>
          <Text accessibilityRole="button" onPress={() => setSemaine(lundiDe(aujourdhui))} style={{ marginTop: 2, fontFamily: polices.texte, fontSize: 12, color: couleurs.rouge, textDecorationLine: 'underline' }}>
            Cette semaine
          </Text>
        </View>
        <Action variante="contour" icone={ChevronRight} nom="Semaine suivante" onPress={() => setSemaine(ajouterJours(semaine, 7))} />
      </View>

      <View style={{ borderRadius: 12, backgroundColor: 'rgba(195,24,30,0.05)', padding: 16, gap: 4 }}>
        <Text style={ts.texte}>
          <Text style={{ fontFamily: polices.texteGras }}>
            {faites}
            {objectif ? ` / ${objectif}` : ''}
          </Text>{' '}
          séance{s(faites)} réalisée{s(faites)}
          {objectif ? ' · objectif hebdomadaire du programme' : ''}
        </Text>
        <Text style={ts.doux}>
          {prevues} séance{s(prevues)} encore prévue{s(prevues)} cette semaine
        </Text>
        {!!objectif && (
          <View
            accessibilityRole="progressbar"
            aria-label="Séances réalisées par rapport à l’objectif hebdomadaire"
            aria-valuemin={0}
            aria-valuemax={objectif}
            aria-valuenow={Math.min(faites, objectif)}
            style={{ marginTop: 8, height: 8, borderRadius: 4, overflow: 'hidden', backgroundColor: 'rgba(195,24,30,0.1)' }}
          >
            <View style={{ height: '100%', borderRadius: 4, backgroundColor: couleurs.rouge, width: `${Math.min(100, (faites / objectif) * 100)}%` }} />
          </View>
        )}
      </View>

      <Etat erreur={erreur} message={message} />
      {!creneaux && !erreur ? (
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
          <ActivityIndicator size="small" color={couleurs.rouge} />
          <Text style={ts.texte}>Chargement du calendrier…</Text>
        </View>
      ) : (
        <View style={{ gap: 8 }}>
          {jours.map((jour) => {
            const lignes = visibles.filter((e) => jourDe(e) === jour);
            const auj = jour === aujourdhui;
            return (
              <View key={jour} style={{ borderWidth: 1, borderColor: auj ? 'rgba(195,24,30,0.4)' : couleurs.bordure, backgroundColor: auj ? 'rgba(195,24,30,0.05)' : undefined, borderRadius: 12, padding: 12 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
                  <Text style={{ fontFamily: polices.texteGras, fontSize: 12, color: couleurs.texte }}>{long(jour)}</Text>
                  {auj && <Text style={{ fontFamily: polices.texte, fontSize: 12, color: couleurs.rouge }}>Aujourd’hui</Text>}
                </View>
                {!lignes.length ? (
                  <Text style={[ts.doux, { marginTop: 4 }]}>Aucune séance</Text>
                ) : (
                  lignes.map((e) => (
                    <View key={e.id} style={{ marginTop: 8, borderRadius: 8, backgroundColor: couleurs.fond, padding: 12, gap: 6 }}>
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                        <Text style={[ts.texte, { fontFamily: polices.texteMoyen, flexShrink: 1 }]}>{titreClient(e.seanceTitre)}</Text>
                        {e.statut === 'Réalisée' ? (
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                            <CheckCircle2 size={12} color={couleurs.rouge} />
                            <Text style={{ fontFamily: polices.texte, fontSize: 12, color: couleurs.rouge }}>Réalisée</Text>
                          </View>
                        ) : (
                          <Text style={ts.doux}>{e.date < aujourdhui ? 'Prévue · à reprogrammer' : `Prévue${e.heure ? ` · ${e.heure}` : ''}`}</Text>
                        )}
                      </View>
                      {e.statut === 'Réalisée' && e.date !== jourDe(e) && <Text style={ts.doux}>Initialement prévue le {court(e.date)}</Text>}
                      {e.statut === 'Prévue' && (
                        <Ligne style={{ marginTop: 4 }}>
                          <Action
                            petit
                            libelle="Ouvrir la séance"
                            desactive={occupe || !disponible || !espace.seances.some((x) => x.id === e.seanceId)}
                            onPress={() => onOuvrir(e.seanceId, e.id)}
                          />
                          <Action
                            petit
                            variante="contour"
                            libelle="Déplacer"
                            desactive={occupe || !disponible}
                            onPress={() =>
                              demanderSortie(() => {
                                changer({ id: e.id, seanceId: e.seanceId, date: ecrireJour(e.date < aujourdhui ? aujourdhui : e.date), heure: e.heure ?? '', envoiId: nouvelId() });
                                setOuvert(true);
                              }, [cle])
                            }
                          />
                          <Action petit variante="fantome" libelle="Annuler" desactive={occupe || apercu} onPress={() => enregistrer(e.id)} />
                        </Ligne>
                      )}
                    </View>
                  ))
                )}
              </View>
            );
          })}
        </View>
      )}

      {disponible && (
        <Repliable key={`${ouvert}`} ouvert={ouvert} resume={f.id ? 'Déplacer une séance' : 'Planifier une séance'} style={{ borderWidth: 1, borderColor: couleurs.bordure, borderRadius: 12, paddingHorizontal: 14, paddingBottom: 6 }}>
          <View style={{ gap: 14, paddingBottom: 10 }}>
            <Selecteur
              libelle="Séance"
              options={espace.seances.map((x) => ({ cle: x.id, libelle: titreClient(x.titre) }))}
              valeur={f.seanceId}
              onChange={(v) => changer({ ...f, seanceId: v })}
            />
            <Ligne style={{ alignItems: 'flex-start' }}>
              <View style={{ flex: 1, minWidth: 130 }}>
                <Saisie libelle="Date" placeholder="jj/mm/aaaa" aide={`Du ${court(premierJour)} au ${court(c.fin)}`} valeur={f.date} onChange={(v) => changer({ ...f, date: v })} />
              </View>
              <View style={{ flex: 1, minWidth: 130 }}>
                <Saisie libelle="Heure (facultatif)" placeholder="hh:mm" valeur={f.heure} onChange={(v) => changer({ ...f, heure: v })} />
              </View>
            </Ligne>
            <Action
              libelle={occupe ? 'Enregistrement…' : f.id ? 'Enregistrer le nouveau créneau' : 'Ajouter au calendrier'}
              chargement={occupe}
              desactive={!f.seanceId || !f.date.trim()}
              onPress={() => enregistrer()}
            />
            {f.id && (
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  ecrireBrouillon(cle, null);
                  setF(initial());
                }}
              >
                <Text style={[ts.doux, { textAlign: 'center', textDecorationLine: 'underline' }]}>Ne pas déplacer</Text>
              </Pressable>
            )}
          </View>
        </Repliable>
      )}
    </View>
  );
}
