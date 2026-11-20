// Choix d'une date et d'une heure sans rien écrire : un appui sur le champ ouvre, juste en dessous, un mini calendrier
// (date) ou une grille d'heures et de minutes (heure). En pur React Native : même rendu sur iPhone, Android et ordinateur.
import { CalendarDays, ChevronLeft, ChevronRight, Clock, X } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ajouterJours, cleJour, grilleMois } from '@/domain/agenda';

import { Libelle } from './crm/dossier';
import { couleurs, espace, polices } from './theme';

const deux = (n: number) => String(n).padStart(2, '0');
/** « jeudi 12 novembre 2026 ». */
const dateLongue = (jour: string) =>
  new Date(`${jour}T12:00:00`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

/** Date au format AAAA-MM-JJ (vide : pas encore choisie). */
export function ChampDate({
  libelle,
  jour,
  onChange,
  erreur,
  aide,
  effacable,
}: {
  libelle: string;
  jour: string;
  onChange: (jour: string) => void;
  erreur?: string;
  aide?: string;
  /** Petite croix pour vider le champ (date facultative). */
  effacable?: boolean;
}) {
  const [ouvert, setOuvert] = useState(false);
  const valide = /^\d{4}-\d{2}-\d{2}$/.test(jour);
  return (
    <View style={{ gap: espace(2) }}>
      <Libelle>{libelle}</Libelle>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: espace(2) }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${libelle} : ${valide ? dateLongue(jour) : 'choisir une date'}`}
          accessibilityState={{ expanded: ouvert }}
          onPress={() => setOuvert((o) => !o)}
          style={[styles.champ, { flex: 1 }, ouvert && styles.champOuvert, !!erreur && { borderColor: couleurs.rouge }]}
        >
          <CalendarDays size={18} color={couleurs.texteDoux} />
          <Text style={[styles.valeur, !valide && { color: couleurs.suggestion }]} numberOfLines={1}>
            {valide ? majuscule(dateLongue(jour)) : 'Choisir une date'}
          </Text>
        </Pressable>
        {effacable && valide && (
          <Pressable accessibilityRole="button" accessibilityLabel={`Effacer : ${libelle}`} hitSlop={8} onPress={() => onChange('')} style={styles.effacer}>
            <X size={16} color={couleurs.texteDoux} />
          </Pressable>
        )}
      </View>
      {ouvert && (
        <MiniCalendrier
          jour={valide ? jour : undefined}
          onChoisir={(j) => {
            onChange(j);
            setOuvert(false);
          }}
        />
      )}
      {erreur ? <Text style={styles.erreur}>{erreur}</Text> : aide ? <Text style={styles.aide}>{aide}</Text> : null}
    </View>
  );
}

const majuscule = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

export function MiniCalendrier({ jour, onChoisir }: { jour?: string; onChoisir: (jour: string) => void }) {
  const [mois, setMois] = useState(() => {
    const d = jour ? new Date(`${jour}T12:00:00`) : new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const aujourdhui = cleJour(new Date());
  const jours = grilleMois(mois);
  const semaines = Array.from({ length: jours.length / 7 }, (_, i) => jours.slice(i * 7, i * 7 + 7));
  const changer = (sens: 1 | -1) => setMois((m) => new Date(m.getFullYear(), m.getMonth() + sens, 1));
  return (
    <View style={styles.panneau}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Mois précédent" hitSlop={6} onPress={() => changer(-1)} style={styles.fleche}>
          <ChevronLeft size={18} color={couleurs.texte} />
        </Pressable>
        <Text style={styles.mois}>{majuscule(mois.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }))}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Mois suivant" hitSlop={6} onPress={() => changer(1)} style={styles.fleche}>
          <ChevronRight size={18} color={couleurs.texte} />
        </Pressable>
      </View>
      <View style={{ flexDirection: 'row' }}>
        {['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((j, i) => (
          <Text key={i} style={styles.jourSemaine}>
            {j}
          </Text>
        ))}
      </View>
      {semaines.map((s) => (
        <View key={cleJour(s[0])} style={{ flexDirection: 'row' }}>
          {s.map((d) => {
            const cle = cleJour(d);
            const choisi = cle === jour;
            const horsMois = d.getMonth() !== mois.getMonth();
            return (
              <Pressable
                key={cle}
                accessibilityRole="button"
                accessibilityLabel={dateLongue(cle)}
                accessibilityState={{ selected: choisi }}
                onPress={() => onChoisir(cle)}
                style={({ pressed }) => [styles.case, pressed && { backgroundColor: couleurs.rougeClair }]}
              >
                <View style={[styles.rond, cle === aujourdhui && styles.rondAujourdhui, choisi && styles.rondChoisi]}>
                  <Text
                    style={[
                      styles.numero,
                      horsMois && { color: couleurs.suggestion },
                      cle === aujourdhui && { color: couleurs.rouge, fontFamily: polices.texteGras },
                      choisi && { color: '#FFFFFF', fontFamily: polices.texteGras },
                    ]}
                  >
                    {d.getDate()}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      ))}
      <View style={{ flexDirection: 'row', gap: espace(2), justifyContent: 'center', marginTop: espace(1) }}>
        <Raccourci libelle="Aujourd’hui" onPress={() => onChoisir(aujourdhui)} />
        <Raccourci libelle="Demain" onPress={() => onChoisir(cleJour(ajouterJours(new Date(), 1)))} />
      </View>
    </View>
  );
}

function Raccourci({ libelle, onPress }: { libelle: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.raccourci}>
      <Text style={styles.raccourciTexte}>{libelle}</Text>
    </Pressable>
  );
}

const HEURES = Array.from({ length: 24 }, (_, h) => h);
const MINUTES = Array.from({ length: 12 }, (_, i) => i * 5);
/** Heures de travail montrées d'abord ; « Toutes les heures » ouvre la nuit. */
const PREMIERE = 6;
const DERNIERE = 22;

/** Heure « HH:MM » (vide : pas encore choisie). */
export function ChampHeure({ libelle, heure, onChange, erreur, aide }: { libelle: string; heure: string; onChange: (heure: string) => void; erreur?: string; aide?: string }) {
  const [ouvert, setOuvert] = useState(false);
  const m = heure.trim().match(/^(\d{1,2}):(\d{2})$/);
  const h = m ? Number(m[1]) : undefined;
  const mi = m ? Number(m[2]) : undefined;
  const [toutes, setToutes] = useState(h !== undefined && (h < PREMIERE || h > DERNIERE));
  const heures = toutes ? HEURES : HEURES.filter((x) => x >= PREMIERE && x <= DERNIERE);
  const choisir = (nh: number, nmi: number) => onChange(`${deux(nh)}:${deux(nmi)}`);
  return (
    <View style={{ gap: espace(2) }}>
      <Libelle>{libelle}</Libelle>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${libelle} : ${m ? heure : 'choisir une heure'}`}
        accessibilityState={{ expanded: ouvert }}
        onPress={() => setOuvert((o) => !o)}
        style={[styles.champ, ouvert && styles.champOuvert, !!erreur && { borderColor: couleurs.rouge }]}
      >
        <Clock size={18} color={couleurs.texteDoux} />
        <Text style={[styles.valeur, { fontFamily: polices.chiffres }, !m && { color: couleurs.suggestion, fontFamily: polices.texte }]}>
          {m ? `${deux(h!)}:${deux(mi!)}` : 'Choisir une heure'}
        </Text>
      </Pressable>
      {ouvert && (
        <View style={styles.panneau}>
          <Text style={styles.sousLibelle}>Heure</Text>
          <View style={styles.grille}>
            {heures.map((x) => (
              <Pastille key={x} libelle={`${x} h`} actif={x === h} onPress={() => choisir(x, mi ?? 0)} />
            ))}
          </View>
          {!toutes && (
            <Pressable accessibilityRole="button" onPress={() => setToutes(true)} hitSlop={6}>
              <Text style={styles.lien}>Toutes les heures</Text>
            </Pressable>
          )}
          <Text style={[styles.sousLibelle, { marginTop: espace(2) }]}>Minutes</Text>
          <View style={styles.grille}>
            {MINUTES.map((x) => (
              <Pastille
                key={x}
                libelle={`:${deux(x)}`}
                actif={h !== undefined && x === mi}
                desactive={h === undefined}
                onPress={() => {
                  if (h === undefined) return;
                  choisir(h, x);
                  setOuvert(false);
                }}
              />
            ))}
          </View>
          {h === undefined ? (
            <Text style={styles.aide}>Choisis d’abord l’heure, puis les minutes.</Text>
          ) : (
            <Pressable accessibilityRole="button" onPress={() => setOuvert(false)} style={[styles.raccourci, { alignSelf: 'flex-end' }]}>
              <Text style={styles.raccourciTexte}>OK</Text>
            </Pressable>
          )}
        </View>
      )}
      {erreur ? <Text style={styles.erreur}>{erreur}</Text> : aide ? <Text style={styles.aide}>{aide}</Text> : null}
    </View>
  );
}

function Pastille({ libelle, actif, desactive, onPress }: { libelle: string; actif: boolean; desactive?: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: actif, disabled: desactive }}
      onPress={onPress}
      style={({ pressed }) => [styles.pastille, actif && styles.pastilleActive, pressed && !actif && { backgroundColor: couleurs.rougeClair }, desactive && { opacity: 0.4 }]}
    >
      <Text style={[styles.pastilleTexte, actif && { color: '#FFFFFF' }]}>{libelle}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  champ: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: espace(2),
    borderWidth: 1,
    borderColor: couleurs.saisie,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: couleurs.carte,
  },
  champOuvert: { borderColor: couleurs.texte },
  valeur: { flexShrink: 1, fontFamily: polices.texte, fontSize: 14, color: couleurs.texte },
  effacer: { padding: espace(2), borderRadius: 8, borderWidth: 1, borderColor: couleurs.bordure, backgroundColor: couleurs.carte },
  erreur: { fontFamily: polices.texte, fontSize: 12, color: couleurs.rouge },
  aide: { fontFamily: polices.texte, fontSize: 12, color: couleurs.texteDoux },
  panneau: {
    borderWidth: 1,
    borderColor: couleurs.bordure,
    borderRadius: 12,
    padding: espace(3),
    gap: espace(1),
    backgroundColor: couleurs.carte,
    maxWidth: 360,
    width: '100%',
  },
  fleche: { padding: espace(2), borderRadius: 8 },
  mois: { flex: 1, textAlign: 'center', fontFamily: polices.texteGras, fontSize: 15, color: couleurs.texte },
  jourSemaine: { flex: 1, textAlign: 'center', paddingVertical: 4, fontFamily: polices.texteMoyen, fontSize: 12, color: couleurs.texteDoux },
  case: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 2, borderRadius: 8 },
  rond: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  rondAujourdhui: { borderWidth: 1, borderColor: couleurs.rouge },
  rondChoisi: { backgroundColor: couleurs.rouge, borderColor: couleurs.rouge },
  numero: { fontFamily: polices.texte, fontSize: 14, color: couleurs.texte },
  raccourci: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor: couleurs.bordure },
  raccourciTexte: { fontFamily: polices.texteMoyen, fontSize: 13, color: couleurs.texte },
  sousLibelle: { fontFamily: polices.texteMoyen, fontSize: 12, color: couleurs.texteDoux, textTransform: 'uppercase', letterSpacing: 0.5 },
  grille: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  pastille: {
    minWidth: 50,
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: couleurs.bordure,
    backgroundColor: couleurs.carte,
  },
  pastilleActive: { backgroundColor: couleurs.rouge, borderColor: couleurs.rouge },
  pastilleTexte: { fontFamily: polices.chiffres, fontSize: 13, color: couleurs.texte },
  lien: { fontFamily: polices.texteMoyen, fontSize: 13, color: couleurs.rouge, paddingVertical: 4 },
});
