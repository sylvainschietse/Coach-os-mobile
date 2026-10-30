// SeanceLog.tsx d'origine (U04) : carte repliable d'une séance du cycle, prescription de chaque exercice, saisie série
// par série (charge précédente en gris, ✓ pour la reprendre), suggestion au % du 1RM, ressenti, difficulté, commentaire
// et bouton d'enregistrement collant. Le brouillon reste sur l'appareil jusqu'à l'enregistrement réussi.
// Écart corrigé : un exercice au temps (gainage) ou à l'objectif (cardio) se saisit en durée, distance, calories ou
// watts au lieu de « charge × répétitions ».
import { router } from 'expo-router';
import { AlertCircle, CheckCircle2, ChevronDown, PlayCircle, Timer } from 'lucide-react-native';
import { Fragment, useEffect, useRef, useState, type ComponentRef } from 'react';
import { Linking, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { entrainement } from '@/data/entrainement';
import { dureeCourte, formatDeLigne, lireObjectif, prescriptionClient, suggestionPourcentage, titreClient, typeDeLigne, type Reference } from '@/domain/entrainement';
import type { RealisationLue } from '@/domain/entrainement-etat';
import { circuitAlterne, resumeAlternance, resumeMinuteur } from '@/domain/minuteur';
import type { LignePrescription, Mesure, Seance, SerieRealisee, Valeurs } from '@/domain/types';
import { demanderSortie, ecrireBrouillon, lireBrouillon } from '@/lib/brouillon';
import { nouvelId } from '@/lib/identifiant';

import { couleurs, polices } from '../theme';
import { Action, Ligne, TexteLong, ts } from './commun';

type Champ = { m: Mesure; titre: string; unite: string; decimal: boolean; max: number };
type Brouillon = { vals: Record<string, Partial<Record<Mesure, string>>>; note: number | null; com: string; envoiId: string; debut: string };

const CHARGE: Champ = { m: 'charge', titre: 'Charge (kg)', unite: 'kg', decimal: true, max: 1000 };
const REPS: Champ = { m: 'repetitions', titre: 'Répétitions', unite: 'reps', decimal: false, max: 500 };
const DUREE: Champ = { m: 'duree', titre: 'Durée (s)', unite: 's', decimal: false, max: 86400 };
const DISTANCE: Champ = { m: 'distance', titre: 'Distance (m)', unite: 'm', decimal: true, max: 1000000 };
const CALORIES: Champ = { m: 'calories', titre: 'Calories', unite: 'cal', decimal: false, max: 10000 };
const WATTS: Champ = { m: 'watts', titre: 'Puissance (W)', unite: 'W', decimal: false, max: 5000 };

/** Les cases d'une série selon le format de travail prescrit par le coach. */
export function champsSaisie(l: LignePrescription): Champ[] {
  const format = formatDeLigne(l, typeDeLigne(l));
  if (format === 'reps') return [CHARGE, REPS];
  if (format === 'temps') return [DUREE, CHARGE];
  const objectif = lireObjectif(l).type;
  return [DUREE, DISTANCE, ...(objectif === 'calories' ? [CALORIES] : objectif === 'watts' ? [WATTS] : [])];
}

const nombre = (v: string) => Number(v.trim().replace(',', '.'));
const invalide = (c: Champ, v?: string) => {
  if (!v?.trim()) return false;
  const n = nombre(v);
  return !Number.isFinite(n) || n < 0 || n > c.max || (!c.decimal && !Number.isInteger(n));
};
const vide = (): Brouillon => ({ vals: {}, note: null, com: '', envoiId: nouvelId(), debut: new Date().toISOString() });
const sale = (d: Brouillon) => Object.values(d.vals).some((v) => Object.values(v).some((x) => x?.trim())) || d.note !== null || !!d.com.trim();
const DIFFICULTES = ['Trop difficile', 'Matériel indisponible', 'Besoin d’explication'];

export type Enregistrement = { resultat: 'enregistree' | 'doublon' };

export function SeanceLog({
  clientId,
  cycleId,
  seance,
  historique,
  references,
  planificationId,
  ouverture,
  ouverteAuDepart,
  apercu,
  onRepos,
  onEnregistre,
}: {
  clientId: string;
  cycleId: string;
  seance: Seance;
  historique: RealisationLue[];
  references: Reference[];
  /** Créneau du calendrier depuis lequel la séance a été ouverte. */
  planificationId?: string;
  /** Change à chaque « Ouvrir la séance » du calendrier. */
  ouverture?: number;
  /** Démarrée depuis l'accueil ou le calendrier : la séance s'affiche déjà ouverte. */
  ouverteAuDepart?: boolean;
  apercu?: boolean;
  onRepos: (secondes: number, libelle: string) => void;
  onEnregistre: (r: Enregistrement) => void;
}) {
  const cle = `coachos:brouillon:${clientId}:${cycleId}:${seance.id}`;
  const [d, setD] = useState<Brouillon>(vide);
  const [pret, setPret] = useState(false);
  const [ouvert, setOuvert] = useState(!!ouverteAuDepart);
  const [vu, setVu] = useState(ouverture);
  const [etat, setEtat] = useState<'repos' | 'envoi' | 'ok' | 'doublon' | 'erreur'>('repos');
  const [erreur, setErreur] = useState('');
  const [difficulte, setDifficulte] = useState(false);
  const envoi = useRef(false);
  const commentaire = useRef<ComponentRef<typeof TextInput>>(null);
  const lignes = seance.blocs.flatMap((b) => b.lignes);
  const brouillon = sale(d);

  if (ouverture !== vu) {
    setVu(ouverture);
    if (ouverture) setOuvert(true);
  }

  useEffect(() => {
    let annule = false;
    lireBrouillon<Brouillon>(cle).then((b) => {
      if (annule) return;
      if (b && !apercu) {
        const suite = { ...vide(), ...b };
        setD(suite);
        if (sale(suite)) setOuvert(true);
      }
      setPret(true);
    });
    return () => {
      annule = true;
    };
  }, [cle, apercu]);

  useEffect(() => {
    if (!pret || apercu) return;
    ecrireBrouillon(cle, brouillon ? d : null);
  }, [pret, apercu, cle, d, brouillon]);

  /** Dernière séance où cet exercice a des valeurs : la référence grisée, série par série. */
  const precedentes = (ligneId: string): Record<number, Valeurs> => {
    const r = historique.find((x) => x.series.some((s) => s.ligneId === ligneId && Object.keys(s.valeurs).length));
    const parSerie: Record<number, Valeurs> = {};
    r?.series.filter((s) => s.ligneId === ligneId).forEach((s) => (parSerie[s.index + 1] = s.valeurs));
    return parSerie;
  };

  const changer = (k: string, m: Mesure, v: string) => {
    setEtat('repos');
    setD((c) => ({ ...c, vals: { ...c.vals, [k]: { ...c.vals[k], [m]: v } } }));
  };
  const fautif = lignes.some((l) => {
    const champs = champsSaisie(l);
    return Object.entries(d.vals).some(([k, v]) => k.startsWith(`${l.id}:`) && champs.some((c) => invalide(c, v[c.m])));
  });
  const fermer = () => demanderSortie(() => setOuvert(false), [cle]);

  const ajouterDifficulte = (libelle: string) => {
    setEtat('repos');
    setD((c) => {
      if (c.com.split('\n').some((x) => x.trim() === `${libelle} :`)) return c;
      const ajout = `${libelle} : `;
      const separateur = c.com && !c.com.endsWith('\n') ? '\n' : '';
      if (1000 - c.com.length - separateur.length < ajout.length) return c;
      return { ...c, com: c.com + separateur + ajout };
    });
    setDifficulte(false);
    requestAnimationFrame(() => commentaire.current?.focus());
  };

  const enregistrer = async () => {
    if (envoi.current || apercu) return;
    envoi.current = true;
    setEtat('envoi');
    setErreur('');
    try {
      const series: SerieRealisee[] = [];
      for (const l of lignes) {
        const champs = champsSaisie(l);
        for (let n = 1; n <= Math.max(1, l.series); n++) {
          const v = d.vals[`${l.id}:${n}`] ?? {};
          const valeurs: Valeurs = {};
          champs.forEach((c) => v[c.m]?.trim() && (valeurs[c.m] = nombre(v[c.m]!)));
          if (Object.keys(valeurs).length) series.push({ id: nouvelId(), ligneId: l.id, exerciceId: l.exercice.id, index: n - 1, valeurs, suggestion: {} });
        }
      }
      const resultat = await entrainement.enregistrerRealisation({
        id: d.envoiId,
        clientId,
        seanceId: seance.id,
        cycleId,
        planificationId,
        debut: d.debut,
        fin: new Date().toISOString(),
        note: d.note ?? undefined,
        commentaire: d.com,
        series,
      });
      ecrireBrouillon(cle, null);
      setD(vide());
      setEtat(resultat === 'doublon' ? 'doublon' : 'ok');
      onEnregistre({ resultat });
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Échec de l’enregistrement');
      setEtat('erreur');
    }
    envoi.current = false;
  };

  return (
    <View nativeID={`seance-${seance.id}`} style={[ts.carte, { padding: 0, gap: 0, borderRadius: 16 }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: ouvert }}
        onPress={() => (ouvert ? fermer() : setOuvert(true))}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, minHeight: 56 }}
      >
        <View style={styles.jour}>
          <Text style={styles.jourTexte}>J{seance.ordre || '?'}</Text>
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[ts.titre, { fontSize: 16 }]}>{titreClient(seance.titre)}</Text>
          <Text style={ts.doux}>
            {lignes.length} exercice{lignes.length > 1 ? 's' : ''}
            {brouillon && ' · brouillon non enregistré'}
          </Text>
        </View>
        <ChevronDown size={20} color={couleurs.texteDoux} style={ouvert ? { transform: [{ rotate: '180deg' }] } : undefined} />
      </Pressable>

      {ouvert && (
        <View style={{ borderTopWidth: 1, borderTopColor: couleurs.bordure, padding: 14, gap: 12 }}>
          <TexteLong texte={seance.consignes} />
          {seance.blocs.map((b) => {
            const alterne = circuitAlterne(b);
            return (
              <Fragment key={b.id}>
                {alterne && (
                  <View style={{ gap: 6 }}>
                    <Text style={ts.doux}>
                      {b.titre} · en alternance, un exercice par intervalle : {resumeAlternance(alterne.noms, alterne.config.tours)}.
                    </Text>
                    <Ligne>
                      <Action
                        petit
                        variante="contour"
                        icone={Timer}
                        libelle={`Chrono · ${resumeMinuteur(alterne.config)}`}
                        onPress={() =>
                          router.push({ pathname: '/client/minuteur', params: { config: JSON.stringify(alterne.config), titre: b.titre, noms: JSON.stringify(alterne.noms) } })
                        }
                      />
                    </Ligne>
                  </View>
                )}
                {b.lignes.map((l) => (
            <LigneSaisie
              key={l.id}
              l={l}
              d={d}
              precedentes={precedentes(l.id)}
              references={references}
              apercu={apercu}
              occupe={etat === 'envoi'}
              onChanger={changer}
              onRepos={onRepos}
              onRemplir={(charge) => {
                setEtat('repos');
                setD((c) => {
                  const vals = { ...c.vals };
                  for (let n = 1; n <= Math.max(1, l.series); n++) {
                    const k = `${l.id}:${n}`;
                    if (!vals[k]?.charge?.trim()) vals[k] = { ...vals[k], charge: String(charge) };
                  }
                  return { ...c, vals };
                });
              }}
            />
                ))}
              </Fragment>
            );
          })}

          <View style={{ gap: 8, marginTop: 4 }}>
            <Text nativeID={`note-${seance.id}`} style={ts.titreChamp}>
              Ressenti (effort perçu) : <Text style={{ fontFamily: polices.chiffres }}>{d.note ?? '—'}/10</Text>
            </Text>
            <Text style={ts.doux}>1 = très facile · 10 = effort maximal. Facultatif.</Text>
            <View accessibilityRole="radiogroup" aria-labelledby={`note-${seance.id}`} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => {
                const choisi = d.note === n;
                return (
                  <Pressable
                    key={n}
                    accessibilityRole="radio"
                    accessibilityLabel={`Ressenti ${n} sur 10`}
                    accessibilityState={{ checked: choisi, disabled: apercu }}
                    disabled={apercu || etat === 'envoi'}
                    onPress={() => {
                      setEtat('repos');
                      setD((c) => ({ ...c, note: choisi ? null : n }));
                    }}
                    style={[styles.note, choisi && { backgroundColor: couleurs.rouge, borderColor: couleurs.rouge }]}
                  >
                    <Text style={[styles.noteTexte, choisi && { color: '#FFFFFF' }]}>{n}</Text>
                  </Pressable>
                );
              })}
            </View>
            <View style={{ alignSelf: 'flex-start', marginLeft: -12 }}>
              <Action petit variante="fantome" libelle="Signaler une difficulté" desactive={apercu || etat === 'envoi'} onPress={() => setDifficulte(!difficulte)} />
            </View>
            {difficulte && (
              <Ligne>
                {DIFFICULTES.map((x) => (
                  <Action key={x} petit variante="contour" libelle={x} desactive={etat === 'envoi' || d.com.length + x.length + 4 > 1000} onPress={() => ajouterDifficulte(x)} />
                ))}
              </Ligne>
            )}
            <TextInput
              ref={commentaire}
              multiline
              maxLength={1000}
              editable={!apercu}
              accessibilityLabel="Commentaire pour le coach"
              placeholder="Commentaire pour le coach (facultatif). En cas de difficulté, précisez l’exercice."
              placeholderTextColor={couleurs.suggestion}
              value={d.com}
              onChangeText={(v) => {
                setEtat('repos');
                setD((c) => ({ ...c, com: v }));
              }}
              style={[styles.saisie, { minHeight: 64, paddingTop: 10, textAlignVertical: 'top' }]}
            />
          </View>
          {fautif && (
            <Text accessibilityRole="alert" style={[ts.erreur, { fontSize: 12 }]}>
              Charge : de 0 à 1 000 kg. Répétitions, durée en secondes et calories : nombres entiers. Distance en mètres.
            </Text>
          )}
          <View style={[styles.pied, Platform.OS === 'web' && ({ position: 'sticky', bottom: 8, zIndex: 10 } as object)]}>
            <Action
              libelle={etat === 'envoi' ? 'Enregistrement…' : 'Enregistrer la séance'}
              chargement={etat === 'envoi'}
              desactive={apercu || fautif || !brouillon}
              onPress={enregistrer}
            />
            <View aria-live="polite" style={{ flexShrink: 1 }}>
              {apercu && <Text style={ts.doux}>Aperçu : seul le client peut noter une séance.</Text>}
              {etat === 'ok' && <Statut ok texte="Enregistrée" />}
              {etat === 'doublon' && <Statut ok texte="Déjà enregistrée" />}
              {etat === 'erreur' && <Statut texte={`${erreur} — votre brouillon est conservé.`} />}
              {etat === 'repos' && brouillon && !apercu && <Text style={ts.doux}>Brouillon gardé sur cet appareil</Text>}
            </View>
          </View>
        </View>
      )}
    </View>
  );
}

function Statut({ ok, texte }: { ok?: boolean; texte: string }) {
  const Icone = ok ? CheckCircle2 : AlertCircle;
  return (
    <View accessibilityRole={ok ? ('status' as never) : 'alert'} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      <Icone size={16} color={ok ? couleurs.vert : couleurs.rouge} />
      <Text style={{ flexShrink: 1, fontFamily: polices.texte, fontSize: 12, color: ok ? couleurs.vert : couleurs.rouge }}>{texte}</Text>
    </View>
  );
}

function LigneSaisie({
  l,
  d,
  precedentes,
  references,
  apercu,
  occupe,
  onChanger,
  onRemplir,
  onRepos,
}: {
  l: LignePrescription;
  d: Brouillon;
  precedentes: Record<number, Valeurs>;
  references: Reference[];
  apercu?: boolean;
  occupe: boolean;
  onChanger: (k: string, m: Mesure, v: string) => void;
  onRemplir: (charge: number) => void;
  onRepos: (secondes: number, libelle: string) => void;
}) {
  const champs = champsSaisie(l);
  const premier = champs[0];
  const suggestion = premier === CHARGE ? suggestionPourcentage(l.exercice.id, l.chargeIntensite ?? '', l.consignes ?? '', references) : null;
  const repos = l.recuperationS && l.recuperationS > 0 ? Math.min(3600, Math.round(l.recuperationS)) : 60;
  const fourchette = (a: number | null, b: number | null) => `${a}${b !== a ? `–${b}` : ''}`;
  const aPrecedent = Object.values(precedentes).some((v) => v[premier.m] !== undefined);
  const colonnes = { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8 };

  return (
    <View accessibilityLabel={l.exercice.nom} style={{ borderRadius: 10, backgroundColor: 'rgba(237,239,242,0.5)', padding: 12, gap: 4 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <Text style={[ts.titre, { flex: 1, fontSize: 15 }]}>{l.exercice.nom}</Text>
        {l.exercice.videoUrl && (
          <Pressable accessibilityRole="link" onPress={() => Linking.openURL(l.exercice.videoUrl!)} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 32 }}>
            <PlayCircle size={16} color={couleurs.rouge} />
            <Text style={{ fontFamily: polices.texteMoyen, fontSize: 12, color: couleurs.rouge }}>Vidéo</Text>
          </Pressable>
        )}
      </View>
      <Text style={ts.mono}>{prescriptionClient(l)}</Text>
      <TexteLong texte={l.consignes} style={{ fontSize: 12, color: couleurs.texteDoux }} />
      <Ligne style={{ marginTop: 8 }}>
        <Action
          petit
          variante="contour"
          icone={Timer}
          libelle={`Repos ${dureeCourte(repos)}${l.recuperationS ? '' : ' · ajustable'}`}
          onPress={() => onRepos(repos, l.exercice.nom)}
        />
        {l.minuteur && (
          <Action
            petit
            variante="contour"
            icone={Timer}
            libelle={`Chrono · ${resumeMinuteur(l.minuteur)}`}
            onPress={() => router.push({ pathname: '/client/minuteur', params: { config: JSON.stringify(l.minuteur), titre: l.exercice.nom } })}
          />
        )}
      </Ligne>

      {suggestion && (
        <View style={styles.suggestion}>
          {suggestion.rm !== null ? (
            <>
              <Text style={[ts.texte, { fontFamily: polices.texteGras }]}>
                {fourchette(suggestion.pourcentMin, suggestion.pourcentMax)} % du 1RM : {fourchette(suggestion.brutMin, suggestion.brutMax)} kg
              </Text>
              <Text style={ts.doux}>
                Référence {suggestion.estime ? 'estimée' : 'réalisée'} : {suggestion.rm} kg · {new Date(`${suggestion.dateReference}T12:00:00`).toLocaleDateString('fr-FR')}
              </Text>
              {suggestion.chargeMin !== null ? (
                <>
                  <Text style={[ts.texte, { fontSize: 12 }]}>
                    Suggestion : {fourchette(suggestion.chargeMin, suggestion.chargeMax)} kg · arrondi inférieur par {String(suggestion.pas).replace('.', ',')} kg. Ajustez selon le
                    matériel et les consignes du coach.
                  </Text>
                  <View style={{ alignSelf: 'flex-start' }}>
                    <Action petit variante="contour" libelle={`Utiliser ${suggestion.chargeMin} kg dans les cases vides`} desactive={occupe || apercu} onPress={() => onRemplir(suggestion.chargeMin!)} />
                  </View>
                </>
              ) : (
                <Text style={[ts.texte, { fontSize: 12 }]}>Charge calculée trop faible pour un arrondi par 2,5 kg. Saisissez la charge adaptée à votre matériel.</Text>
              )}
            </>
          ) : (
            <Text style={[ts.texte, { fontSize: 12 }]}>
              Ajoutez une référence pour cet exercice dans Mon suivi → Performances & PR pour calculer {fourchette(suggestion.pourcentMin, suggestion.pourcentMax)} % du 1RM.
            </Text>
          )}
        </View>
      )}
      {aPrecedent && (
        <Text style={[ts.doux, { marginTop: 6 }]}>
          En gris : {premier === CHARGE ? 'charge précédente' : 'valeur précédente'}. Validez avec ✓ ou saisissez votre {premier === CHARGE ? 'charge' : 'valeur'}.
        </Text>
      )}

      <View style={[colonnes, { marginTop: 10 }]}>
        <Text style={[ts.doux, { width: 36 }]}>Série</Text>
        {champs.map((c) => (
          <Text key={c.m} style={[ts.doux, { flex: 1, minWidth: 0 }]} numberOfLines={1}>
            {c.titre}
          </Text>
        ))}
      </View>
      {Array.from({ length: Math.max(1, l.series) }, (_, i) => i + 1).map((n) => {
        const k = `${l.id}:${n}`;
        const v = d.vals[k] ?? {};
        return (
          <View key={n} style={[colonnes, { marginTop: 6 }]}>
            <Text style={[ts.doux, { width: 36, fontFamily: polices.texteGras }]}>S{n}</Text>
            {champs.map((c, i) => {
              const avant = precedentes[n]?.[c.m];
              const valider = i === 0 && !v[c.m] && avant !== undefined;
              return (
                <View key={c.m} style={{ flex: 1, minWidth: 0 }}>
                  <TextInput
                    accessibilityLabel={`${l.exercice.nom}, série ${n}, ${c.titre.toLowerCase().replace(/ \(.*\)/, '')}${c.m === 'repetitions' ? '' : ` en ${c.unite}`}`}
                    aria-invalid={invalide(c, v[c.m])}
                    inputMode={c.decimal ? 'decimal' : 'numeric'}
                    keyboardType={c.decimal ? 'decimal-pad' : 'number-pad'}
                    editable={!apercu && !occupe}
                    placeholder={avant !== undefined ? String(avant).replace('.', ',') : c.unite}
                    placeholderTextColor={avant !== undefined ? '#9EA3AD' : couleurs.suggestion}
                    value={v[c.m] ?? ''}
                    onChangeText={(x) => onChanger(k, c.m, x)}
                    style={[styles.saisie, valider && { paddingRight: 44 }, invalide(c, v[c.m]) && { borderColor: couleurs.rouge }]}
                  />
                  {valider && (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Valider ${String(avant).replace('.', ',')} ${c.unite} pour ${l.exercice.nom}, série ${n}`}
                      disabled={occupe || apercu}
                      onPress={() => onChanger(k, c.m, String(avant).replace('.', ','))}
                      style={styles.valider}
                    >
                      <CheckCircle2 size={16} color={couleurs.texteDoux} />
                    </Pressable>
                  )}
                </View>
              );
            })}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  jour: { width: 36, height: 36, borderRadius: 12, backgroundColor: 'rgba(195,24,30,0.05)', alignItems: 'center', justifyContent: 'center' },
  jourTexte: { fontFamily: polices.texteGras, fontSize: 12, color: couleurs.rouge },
  saisie: {
    height: 44,
    minWidth: 0,
    borderWidth: 1,
    borderColor: couleurs.saisie,
    borderRadius: 8,
    backgroundColor: couleurs.carte,
    paddingHorizontal: 10,
    fontFamily: polices.texte,
    fontSize: 16,
    color: couleurs.texte,
  },
  valider: { position: 'absolute', right: 0, top: 0, width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  suggestion: { marginTop: 10, borderWidth: 1, borderColor: 'rgba(195,24,30,0.2)', backgroundColor: 'rgba(195,24,30,0.05)', borderRadius: 10, padding: 12, gap: 6 },
  note: { width: 36, height: 36, borderRadius: 8, borderWidth: 1, borderColor: couleurs.saisie, backgroundColor: couleurs.carte, alignItems: 'center', justifyContent: 'center' },
  noteTexte: { fontFamily: polices.texteMoyen, fontSize: 14, color: couleurs.texte },
  pied: {
    marginTop: 4,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: couleurs.bordure,
    borderRadius: 12,
    backgroundColor: couleurs.carte,
    padding: 12,
  },
});
