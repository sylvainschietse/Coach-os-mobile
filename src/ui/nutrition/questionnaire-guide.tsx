// Questionnaire guidé « Mes objectifs en 2 minutes » : une question par écran, de grandes cartes avec icônes, des
// compteurs pour l'âge, la taille et le poids, et le poids visé. Il remplit le même profil alimentaire que le
// formulaire complet (Mon profil alimentaire), plus le lieu d'entraînement et le matériel.
import { useState } from 'react';
import { Pressable, Text, TextInput, View, useWindowDimensions } from 'react-native';

import type { Preferences } from '@/domain/nutrition/calcul';
import { choisirSalle, MATERIELS, SALLES } from '@/domain/salle-sport';
import { etatA11y } from '@/lib/accessibilite';
import {
  Armchair,
  Beef,
  Dumbbell,
  Fish,
  Footprints,
  HardHat,
  HeartPulse,
  House,
  MapPin,
  Mars,
  Minus,
  Plus,
  Salad,
  Scale,
  Sprout,
  Trees,
  TrendingDown,
  UserRound,
  Venus,
  type LucideIcon,
} from '@/ui/icones';

import { Modale } from '../crm/dossier';
import { Action, ts } from '../entrainement/commun';
import { couleurs, polices } from '../theme';
import { doux } from './commun';

type Etape = 'objectif' | 'sexe' | 'mesures' | 'poidsVise' | 'activite' | 'seances' | 'salle' | 'regime' | 'repas';

const OBJECTIFS: { cle: Preferences['objectif']; libelle: string; detail: string; icone: LucideIcon }[] = [
  { cle: 'perte', libelle: 'Perdre du poids', detail: 'Affiner la silhouette en gardant le muscle', icone: TrendingDown },
  { cle: 'muscle', libelle: 'Prendre du muscle', detail: 'Gagner en force et en volume', icone: Dumbbell },
  { cle: 'maintien', libelle: 'Rester en forme', detail: 'Garder mon poids et mon énergie', icone: HeartPulse },
];
const ACTIVITES: { cle: Exclude<Preferences['activite'], ''>; libelle: string; detail: string; icone: LucideIcon }[] = [
  { cle: 'faible', libelle: 'Assis', detail: 'Bureau, voiture, peu de marche', icone: Armchair },
  { cle: 'legere', libelle: 'Je bouge un peu', detail: 'Marche, escaliers, quelques séances', icone: Footprints },
  { cle: 'moderee', libelle: 'Actif', detail: 'Debout souvent et entraînements réguliers', icone: UserRound },
  { cle: 'elevee', libelle: 'Très physique', detail: 'Travail physique et séances soutenues', icone: HardHat },
];
const REGIMES: { cle: Preferences['regime']; libelle: string; icone: LucideIcon }[] = [
  { cle: 'aucun', libelle: 'Je mange de tout', icone: Beef },
  { cle: 'pescetarien', libelle: 'Pescétarien', icone: Fish },
  { cle: 'vegetarien', libelle: 'Végétarien', icone: Salad },
  { cle: 'vegetalien', libelle: 'Végétalien', icone: Sprout },
];
const ICONE_LIEU: Record<string, LucideIcon> = { salle: Dumbbell, coach: UserRound, maison: House, exterieur: Trees };

const nombre = (t: string) => Number(t.replace(',', '.').trim());
const arrondi = (n: number, pas: number) => Math.round(n / pas) * pas;

export function QuestionnaireGuide({
  initial,
  ageConnu,
  occupe,
  onTerminer,
  onFermer,
}: {
  initial: Preferences;
  /** L'âge vient de la date de naissance du client : il n'est pas redemandé. */
  ageConnu: boolean;
  occupe: boolean;
  onTerminer: (p: Preferences) => void;
  onFermer: () => void;
}) {
  const [p, setP] = useState<Preferences>(() => ({
    ...initial,
    age: initial.age ?? 30,
    taille: initial.taille ?? 170,
    poids: initial.poids ?? 70,
    poidsVise: initial.poidsVise ?? initial.poids ?? 70,
    sexe: initial.sexe,
  }));
  const etapes: Etape[] = ['objectif', 'sexe', 'mesures', 'poidsVise', 'activite', 'seances', 'salle', 'regime', 'repas'];
  const [i, setI] = useState(0);
  const etape = etapes[i];
  const maj = (suite: Partial<Preferences>) => setP((x) => ({ ...x, ...suite }));
  const pret: Record<Etape, boolean> = {
    objectif: true,
    sexe: !!p.sexe,
    mesures: !!p.age && !!p.taille && !!p.poids,
    poidsVise: !!p.poidsVise,
    activite: !!p.activite,
    seances: true,
    salle: !!p.salle,
    regime: true,
    repas: true,
  };
  const derniere = i === etapes.length - 1;

  return (
    <Modale
      titre="Mes objectifs en 2 minutes"
      onFermer={onFermer}
      enTete={
        <View style={{ gap: 6 }}>
          <View accessibilityLabel={`Étape ${i + 1} sur ${etapes.length}`} style={{ height: 6, borderRadius: 3, backgroundColor: couleurs.discret, overflow: 'hidden' }}>
            <View style={{ width: `${((i + 1) / etapes.length) * 100}%`, height: 6, backgroundColor: couleurs.rouge }} />
          </View>
          <Text style={doux}>
            Étape {i + 1} sur {etapes.length}
          </Text>
        </View>
      }
      pied={
        <View style={{ flexDirection: 'row', gap: 8, justifyContent: 'space-between' }}>
          <Action variante="contour" libelle={i === 0 ? 'Annuler' : 'Retour'} desactive={occupe} onPress={() => (i === 0 ? onFermer() : setI(i - 1))} />
          <Action
            libelle={derniere ? (occupe ? 'Enregistrement…' : 'Enregistrer et calculer') : 'Continuer'}
            chargement={derniere && occupe}
            desactive={!pret[etape] || occupe}
            onPress={() => (derniere ? onTerminer(p) : setI(i + 1))}
          />
        </View>
      }
    >
      {etape === 'objectif' && (
        <Question titre="Quel objectif vises-tu ?" aide="On calcule tes calories et tes macros à partir de là.">
          {OBJECTIFS.map((o) => (
            <GrandeCarte key={o.cle} icone={o.icone} libelle={o.libelle} detail={o.detail} actif={p.objectif === o.cle} onPress={() => maj({ objectif: o.cle })} />
          ))}
        </Question>
      )}
      {etape === 'sexe' && (
        <Question titre="Qui es-tu ?" aide="Pour la formule de ton métabolisme de base.">
          <Grille>
            <CarteCarree icone={Mars} libelle="Homme" actif={p.sexe === 'homme'} onPress={() => maj({ sexe: 'homme' })} />
            <CarteCarree icone={Venus} libelle="Femme" actif={p.sexe === 'femme'} onPress={() => maj({ sexe: 'femme' })} />
          </Grille>
        </Question>
      )}
      {etape === 'mesures' && (
        <Question titre={ageConnu ? 'Ta taille et ton poids' : 'Ton âge, ta taille, ton poids'} aide="Fais défiler avec − et +, ou touche le chiffre pour le saisir.">
          {!ageConnu && <Compteur libelle="Âge" unite="ans" valeur={p.age} pas={1} min={14} max={100} onChange={(age) => maj({ age })} />}
          <Compteur libelle="Taille" unite="cm" valeur={p.taille} pas={1} min={120} max={230} onChange={(taille) => maj({ taille })} />
          <Compteur libelle="Poids" unite="kg" valeur={p.poids} pas={0.5} min={30} max={250} onChange={(poids) => maj({ poids })} />
        </Question>
      )}
      {etape === 'poidsVise' && (
        <Question titre="Quel poids vises-tu ?" aide="Un repère pour suivre ta progression. Pas de pression : on ajuste en route.">
          <PoidsVise poids={p.poids ?? 70} valeur={p.poidsVise ?? p.poids ?? 70} onChange={(poidsVise) => maj({ poidsVise })} />
        </Question>
      )}
      {etape === 'activite' && (
        <Question titre="Et au quotidien, tu es plutôt…" aide="Ton travail et tes journées, entraînements compris.">
          {ACTIVITES.map((a) => (
            <GrandeCarte key={a.cle} icone={a.icone} libelle={a.libelle} detail={a.detail} actif={p.activite === a.cle} onPress={() => maj({ activite: a.cle })} />
          ))}
        </Question>
      )}
      {etape === 'seances' && (
        <Question titre="Combien de séances par semaine ?" aide="Sport, entraînements avec ton coach et activités comprises.">
          <Barres valeur={p.seances} onChange={(seances) => maj({ seances })} />
        </Question>
      )}
      {etape === 'salle' && (
        <Question titre="Où t’entraînes-tu ?" aide="Ton coach pourra choisir des exercices faisables avec ton matériel.">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {SALLES.map((s) => {
              const Icone = ICONE_LIEU[s.type] ?? MapPin;
              const actif = p.salle === s.cle;
              return (
                <Pressable
                  key={s.cle}
                  accessibilityRole="button"
                  {...etatA11y({ selected: actif })}
                  onPress={() => maj({ salle: s.cle, materiel: choisirSalle(s.cle, p.materiel, p.salle) })}
                  style={[styles.puce, actif && styles.puceActive]}
                >
                  <Icone size={16} color={actif ? couleurs.blanc : couleurs.texte} />
                  <Text style={[styles.puceTexte, actif && { color: couleurs.blanc }]}>{s.libelle}</Text>
                </Pressable>
              );
            })}
          </View>
          {!!p.salle && (
            <>
              <Text style={[ts.titreChamp, { marginTop: 8 }]}>Le matériel à ta disposition</Text>
              <Text style={doux}>Coché d’après ton lieu : décoche ce qui manque, ajoute ce que tu as en plus.</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {MATERIELS.map((m) => {
                  const actif = p.materiel.includes(m);
                  return (
                    <Pressable
                      key={m}
                      accessibilityRole="checkbox"
                      {...etatA11y({ checked: actif })}
                      onPress={() => maj({ materiel: actif ? p.materiel.filter((x) => x !== m) : MATERIELS.filter((x) => x === m || p.materiel.includes(x)) })}
                      style={[styles.puce, styles.puceFine, actif && styles.puceCochee]}
                    >
                      <Text style={[styles.puceTexte, { fontSize: 13 }, actif && { color: couleurs.rouge }]}>{(actif ? '✓ ' : '') + m}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </>
          )}
        </Question>
      )}
      {etape === 'regime' && (
        <Question titre="Un régime particulier ?" aide="Les recettes proposées s’y adaptent. Allergies et aliments exclus se règlent dans le profil complet.">
          <Grille>
            {REGIMES.map((r) => (
              <CarteCarree key={r.cle} icone={r.icone} libelle={r.libelle} actif={p.regime === r.cle} onPress={() => maj({ regime: r.cle })} />
            ))}
          </Grille>
        </Question>
      )}
      {etape === 'repas' && (
        <Question titre="Combien de repas par jour ?" aide="Collations comprises. Ta semaine de menus suivra ce rythme.">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {[2, 3, 4, 5].map((n) => (
              <CarteCarree key={n} grand={String(n)} libelle={n <= 3 ? 'repas' : n === 4 ? 'dont 1 collation' : 'dont 2 collations'} actif={p.repas === n} onPress={() => maj({ repas: n })} />
            ))}
          </View>
        </Question>
      )}
    </Modale>
  );
}

function Question({ titre, aide, children }: { titre: string; aide: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: 12 }}>
      <View style={{ gap: 4 }}>
        <Text accessibilityRole="header" style={{ fontFamily: polices.titre, fontSize: 30, lineHeight: 34, color: couleurs.texte }}>
          {titre}
        </Text>
        <Text style={doux}>{aide}</Text>
      </View>
      {children}
    </View>
  );
}

function Grille({ children }: { children: React.ReactNode }) {
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{children}</View>;
}

/** Carte pleine largeur : icône dans une pastille, libellé et détail. Choisie : fond sombre, comme dans Ma semaine. */
function GrandeCarte({ icone: Icone, libelle, detail, actif, onPress }: { icone: LucideIcon; libelle: string; detail: string; actif: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="radio"
      {...etatA11y({ checked: actif })}
      onPress={onPress}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
        minHeight: 76,
        borderRadius: 16,
        borderWidth: 1.5,
        borderColor: actif ? couleurs.noir : couleurs.bordure,
        backgroundColor: actif ? couleurs.noir : couleurs.carte,
        padding: 14,
      }}
    >
      <View style={{ width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: actif ? couleurs.rouge : couleurs.rougeClair }}>
        <Icone size={24} color={actif ? couleurs.blanc : couleurs.rouge} />
      </View>
      <View style={{ flexShrink: 1 }}>
        <Text style={{ fontFamily: polices.texteGras, fontSize: 17, color: actif ? couleurs.blanc : couleurs.texte }}>{libelle}</Text>
        <Text style={{ fontFamily: polices.texte, fontSize: 13, color: actif ? '#C9CBD2' : couleurs.texteDoux }}>{detail}</Text>
      </View>
    </Pressable>
  );
}

/** Carte carrée : une grande icône (ou un grand chiffre) au-dessus du libellé. */
function CarteCarree({ icone: Icone, grand, libelle, actif, onPress }: { icone?: LucideIcon; grand?: string; libelle: string; actif: boolean; onPress: () => void }) {
  const { width } = useWindowDimensions();
  const cote = width < 400 ? '47%' : 140;
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={grand ? `${grand} ${libelle}` : libelle}
      {...etatA11y({ checked: actif })}
      onPress={onPress}
      style={{
        width: cote,
        minHeight: 120,
        borderRadius: 16,
        borderWidth: 1.5,
        borderColor: actif ? couleurs.noir : couleurs.bordure,
        backgroundColor: actif ? couleurs.noir : couleurs.carte,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        padding: 12,
      }}
    >
      {Icone && <Icone size={34} color={actif ? couleurs.rouge : couleurs.texte} />}
      {grand && <Text style={{ fontFamily: polices.titre, fontSize: 44, lineHeight: 46, color: actif ? couleurs.rouge : couleurs.texte }}>{grand}</Text>}
      <Text style={{ fontFamily: polices.texteGras, fontSize: 14, textAlign: 'center', color: actif ? couleurs.blanc : couleurs.texte }}>{libelle}</Text>
    </Pressable>
  );
}

/** Grand chiffre réglable avec − et +, ou saisi directement. */
function Compteur({
  libelle,
  unite,
  valeur,
  pas,
  min,
  max,
  onChange,
}: {
  libelle: string;
  unite: string;
  valeur: number | null;
  pas: number;
  min: number;
  max: number;
  onChange: (n: number) => void;
}) {
  const [texte, setTexte] = useState<string | null>(null);
  const v = valeur ?? min;
  const borne = (n: number) => Math.min(max, Math.max(min, arrondi(n, pas)));
  return (
    <View style={{ borderRadius: 16, borderWidth: 1, borderColor: couleurs.bordure, backgroundColor: couleurs.carte, padding: 12, gap: 4 }}>
      <Text style={[ts.kicker, { fontSize: 12 }]}>{libelle}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Rond icone={Minus} nom={`${libelle} : moins`} onPress={() => onChange(borne(v - pas))} desactive={v <= min} />
        <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center', gap: 6, flexShrink: 1 }}>
          <TextInput
            accessibilityLabel={`${libelle} en ${unite}`}
            keyboardType="decimal-pad"
            value={texte ?? v.toLocaleString('fr-FR')}
            onFocus={() => setTexte(String(v).replace('.', ','))}
            onChangeText={setTexte}
            onBlur={() => {
              const n = nombre(texte ?? '');
              if (Number.isFinite(n) && n > 0) onChange(borne(n));
              setTexte(null);
            }}
            style={{ width: 120, textAlign: 'center', fontFamily: polices.titre, fontSize: 52, lineHeight: 56, color: couleurs.texte, padding: 0 }}
          />
          <Text style={{ fontFamily: polices.texteMoyen, fontSize: 16, color: couleurs.texteDoux }}>{unite}</Text>
        </View>
        <Rond icone={Plus} nom={`${libelle} : plus`} onPress={() => onChange(borne(v + pas))} desactive={v >= max} />
      </View>
    </View>
  );
}

function Rond({ icone: Icone, nom, onPress, desactive }: { icone: LucideIcon; nom: string; onPress: () => void; desactive?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={nom}
      disabled={desactive}
      onPress={onPress}
      style={{ width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: couleurs.discret, opacity: desactive ? 0.4 : 1 }}
    >
      <Icone size={22} color={couleurs.texte} />
    </Pressable>
  );
}

/** Poids visé : grand chiffre, écart avec le poids actuel en couleur, et une réglette de −15 à +15 kg. */
function PoidsVise({ poids, valeur, onChange }: { poids: number; valeur: number; onChange: (n: number) => void }) {
  const ecart = Math.round((valeur - poids) * 10) / 10;
  const crans = [-10, -5, -2, 0, 2, 5, 10];
  return (
    <View style={{ gap: 12 }}>
      <View style={{ alignItems: 'center', borderRadius: 16, backgroundColor: couleurs.rougeClair, paddingVertical: 18, gap: 4 }}>
        <Scale size={26} color={couleurs.rouge} />
        <Text style={{ fontFamily: polices.titre, fontSize: 64, lineHeight: 66, color: couleurs.texte }}>
          {valeur.toLocaleString('fr-FR')} <Text style={{ fontFamily: polices.texteMoyen, fontSize: 18 }}>kg</Text>
        </Text>
        <Text style={{ fontFamily: polices.texteGras, fontSize: 15, color: ecart === 0 ? couleurs.texteDoux : couleurs.rouge }}>
          {ecart === 0 ? 'Garder mon poids actuel' : `${ecart > 0 ? '+' : ''}${ecart.toLocaleString('fr-FR')} kg par rapport à aujourd’hui`}
        </Text>
      </View>
      <Compteur libelle="Poids visé" unite="kg" valeur={valeur} pas={0.5} min={30} max={250} onChange={onChange} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'center' }}>
        {crans.map((c) => (
          <Pressable
            key={c}
            accessibilityRole="button"
            accessibilityLabel={c === 0 ? 'Mon poids actuel' : `${c > 0 ? 'plus' : 'moins'} ${Math.abs(c)} kilos`}
            onPress={() => onChange(Math.round((poids + c) * 10) / 10)}
            style={[styles.puce, styles.puceFine, valeur === Math.round((poids + c) * 10) / 10 && styles.puceCochee]}
          >
            <Text style={[styles.puceTexte, { fontSize: 13 }]}>{c === 0 ? 'Actuel' : `${c > 0 ? '+' : ''}${c} kg`}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

/** Séances par semaine : des barres de plus en plus hautes, de 0 à 7. */
function Barres({ valeur, onChange }: { valeur: number; onChange: (n: number) => void }) {
  return (
    <View style={{ gap: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 6, height: 150 }}>
        {Array.from({ length: 8 }, (_, n) => {
          const actif = n === valeur;
          const rempli = n <= valeur;
          return (
            <Pressable
              key={n}
              accessibilityRole="radio"
              accessibilityLabel={`${n} séance${n > 1 ? 's' : ''} par semaine`}
              {...etatA11y({ checked: actif })}
              onPress={() => onChange(n)}
              style={{ flex: 1, alignItems: 'center', justifyContent: 'flex-end', gap: 6, height: '100%' }}
            >
              <View
                style={{
                  width: '100%',
                  height: 22 + n * 14,
                  borderRadius: 8,
                  backgroundColor: actif ? couleurs.rouge : rempli ? '#F3A6A9' : couleurs.discret,
                }}
              />
              <Text style={{ fontFamily: polices.texteGras, fontSize: 15, color: actif ? couleurs.rouge : couleurs.texte }}>{n === 7 ? '7+' : n}</Text>
            </Pressable>
          );
        })}
      </View>
      <Text style={[ts.texte, { textAlign: 'center' }]}>
        {valeur === 0 ? 'Pas encore de séance : on démarre en douceur.' : `${valeur} séance${valeur > 1 ? 's' : ''} par semaine`}
      </Text>
    </View>
  );
}

const styles = {
  puce: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 6,
    minHeight: 44,
    borderRadius: 22,
    borderWidth: 1.5,
    borderColor: couleurs.bordure,
    backgroundColor: couleurs.carte,
    paddingHorizontal: 14,
  },
  puceFine: { minHeight: 36, paddingHorizontal: 12 },
  puceActive: { borderColor: couleurs.noir, backgroundColor: couleurs.noir },
  puceCochee: { borderColor: couleurs.rouge, backgroundColor: couleurs.rougeClair },
  puceTexte: { fontFamily: polices.texteMoyen, fontSize: 14, color: couleurs.texte },
};
