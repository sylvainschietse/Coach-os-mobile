// Fiche client › Suivi : les progrès du client domaine par domaine (séances, force, corps, bien-être, nutrition, pas),
// sur un jour, une semaine, un mois ou une année qu'on remonte avec ‹ ›, puis l'historique semaine par semaine.
// Toucher une semaine de l'historique l'ouvre. Chaque source se lit à part : une source en panne n'efface pas les autres.
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Animated, Pressable, StyleSheet, Text, View } from 'react-native';

import { depot } from '@/data';
import { alimentation } from '@/data/alimentation';
import { activites } from '@/data/activites';
import { entrainement } from '@/data/entrainement';
import { quotidien } from '@/data/quotidien';
import { suiviHebdo } from '@/data/suivi-hebdo';
import { titreActivite } from '@/domain/activites';
import { ajouterJours, aujourdhuiParis, jourParis } from '@/domain/entrainement';
import { indicateursDuClient, type Indicateur } from '@/domain/quotidien';
import { formaterNombre, type ChampMensuration } from '@/domain/suivi';
import { courbesExercices } from '@/domain/suivi-entrainement';
import {
  dateCourte,
  decaler,
  derniereAvant,
  DOMAINES,
  fenetre,
  historiqueSemaines,
  moyenneParJour,
  parCase,
  PERIODES,
  peutAvancer,
  resumeSemaine,
  surPeriode,
  type Domaine,
  type Fenetre,
  type Periode,
  type PointDate,
} from '@/domain/suivi-periode';
import { useCharger } from '@/lib/useCharger';

import { Courbe } from './courbe';
import { couleurs, espace, polices } from '../theme';

const TEINTES: Record<Domaine, string> = {
  seances: '#B3141A',
  force: '#2F4CC0',
  corps: '#1B7A45',
  'bien-etre': '#6B4BC9',
  nutrition: '#8A4B00',
  pas: '#262931',
};

/** 7300 → « 7 300 » (espace fine insécable, comme en français). */
const milliers = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
const signe = (n: number, unite: string) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${formaterNombre(Math.abs(n))} ${unite}`;
const sur = <T,>(p: Promise<T>, vide: T) => p.catch(() => vide);

const CORPS: { cle: ChampMensuration; libelle: string; unite: string }[] = [
  { cle: 'poidsKg', libelle: 'Poids', unite: 'kg' },
  { cle: 'tourTailleCm', libelle: 'Taille', unite: 'cm' },
  { cle: 'tourHanchesCm', libelle: 'Hanches', unite: 'cm' },
];
const BIEN_ETRE: { cle: Indicateur; libelle: string; unite: string; inverse?: boolean; echelle?: number }[] = [
  { cle: 'sommeil', libelle: 'Sommeil', unite: 'h' },
  { cle: 'energie', libelle: 'Énergie', unite: '/ 5', echelle: 5 },
  { cle: 'stress', libelle: 'Stress', unite: '/ 5', inverse: true, echelle: 5 },
];

function useDonnees(clientId: string) {
  return useCharger(async () => {
    const depuis = ajouterJours(aujourdhuiParis(), -800);
    const [resultats, libres, mensurations, records, releves, reglages, bilans, photos, repas] = await Promise.all([
      sur(entrainement.resultats(clientId), { realisations: [], prescriptions: {} }),
      sur(activites.liste(clientId, 500), []),
      sur(depot.mensurations(clientId), []),
      sur(depot.records(clientId), []),
      sur(quotidien.releves(clientId, depuis), []),
      sur(quotidien.reglages(clientId), []),
      sur(suiviHebdo.bilansClient(clientId), []),
      sur(suiviHebdo.photos(clientId, false), []),
      sur(alimentation.repas(clientId, depuis), []),
    ]);
    const kcalParJour = new Map<string, number>();
    for (const r of repas) kcalParJour.set(r.date, (kcalParJour.get(r.date) ?? 0) + r.kcal);
    const releve = (i: Indicateur): PointDate[] => releves.filter((r) => r.indicateur === i).map((r) => ({ date: r.jour, valeur: r.valeur }));
    return {
      seances: resultats.realisations.map((r) => ({ date: jourParis(r.fin), titre: r.seanceTitre, note: r.note })),
      libres: libres.map((a) => ({ date: jourParis(a.debut), titre: titreActivite(a), dureeS: a.dureeS })),
      courbes: courbesExercices(resultats.realisations),
      mensurations,
      records,
      releve,
      ciblePas: indicateursDuClient(reglages).find((x) => x.def.cle === 'pas')!.cible,
      bilans,
      photos,
      kcal: [...kcalParJour].map(([date, valeur]) => ({ date, valeur })),
      repasPhoto: repas.filter((r) => r.source === 'photo').map((r) => r.date),
    };
  }, `suivi-coach-${clientId}`);
}
type Donnees = NonNullable<ReturnType<typeof useDonnees>['donnee']>;

export function SuiviCoach({ clientId, prenom }: { clientId: string; prenom: string }) {
  const aujourdhui = aujourdhuiParis();
  const [periode, setPeriode] = useState<Periode>('semaine');
  const [ancre, setAncre] = useState(aujourdhui);
  const [domaine, setDomaine] = useState<Domaine | 'tout'>('tout');
  const charge = useDonnees(clientId);
  const f = useMemo(() => fenetre(periode, ancre), [periode, ancre]);
  const avancer = peutAvancer(periode, ancre, aujourdhui);
  const d = charge.donnee;

  return (
    <View style={{ gap: espace(4), marginTop: espace(4) }}>
      <Text accessibilityRole="header" style={styles.titre}>
        Suivi de {prenom || 'ton client'}
      </Text>
      <View accessibilityRole="tablist" style={styles.segments}>
        {PERIODES.map((p) => (
          <Pressable
            key={p.cle}
            accessibilityRole="tab"
            accessibilityState={{ selected: periode === p.cle }}
            onPress={() => setPeriode(p.cle)}
            style={[styles.segment, periode === p.cle && styles.segmentActif]}
          >
            <Text style={[styles.segmentTexte, periode === p.cle && { color: couleurs.carte }]}>{p.libelle}</Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.navigation}>
        <Pressable accessibilityRole="button" accessibilityLabel="Période précédente" onPress={() => setAncre(decaler(periode, ancre, -1))} style={styles.fleche}>
          <ChevronLeft size={20} color={couleurs.texte} />
        </Pressable>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={styles.periode} aria-live="polite">
            {f.titre}
          </Text>
          {f.fin < aujourdhui && (
            <Pressable accessibilityRole="button" onPress={() => setAncre(aujourdhui)} hitSlop={8}>
              <Text style={styles.lien}>Revenir à aujourd’hui</Text>
            </Pressable>
          )}
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Période suivante"
          accessibilityState={{ disabled: !avancer }}
          disabled={!avancer}
          onPress={() => setAncre(decaler(periode, ancre, 1))}
          style={[styles.fleche, !avancer && { opacity: 0.35 }]}
        >
          <ChevronRight size={20} color={couleurs.texte} />
        </Pressable>
      </View>
      <View style={styles.bulles}>
        {[{ cle: 'tout' as const, libelle: 'Tout' }, ...DOMAINES].map((x) => (
          <Pressable
            key={x.cle}
            accessibilityRole="button"
            accessibilityState={{ selected: domaine === x.cle }}
            onPress={() => setDomaine(x.cle)}
            style={[styles.bulle, domaine === x.cle && { backgroundColor: x.cle === 'tout' ? couleurs.noir : TEINTES[x.cle], borderColor: 'transparent' }]}
          >
            <Text style={[styles.bulleTexte, domaine === x.cle && { color: couleurs.carte }]}>{x.libelle}</Text>
          </Pressable>
        ))}
      </View>
      {charge.erreur && <Text style={styles.doux}>{charge.erreur}</Text>}
      {!d && !charge.erreur && <Text style={styles.doux}>Chargement…</Text>}
      {d && (
        <>
          {(domaine === 'tout' || domaine === 'seances') && <BlocSeances d={d} f={f} />}
          {(domaine === 'tout' || domaine === 'force') && <BlocForce d={d} f={f} />}
          {(domaine === 'tout' || domaine === 'corps') && <BlocCorps d={d} f={f} />}
          {(domaine === 'tout' || domaine === 'bien-etre') && <BlocBienEtre d={d} f={f} />}
          {(domaine === 'tout' || domaine === 'nutrition') && <BlocNutrition d={d} f={f} />}
          {(domaine === 'tout' || domaine === 'pas') && <BlocPas d={d} f={f} />}
          <Historique
            d={d}
            fin={f.fin < aujourdhui ? f.fin : aujourdhui}
            semaineOuverte={periode === 'semaine' ? f.debut : undefined}
            onOuvrir={(lundi) => {
              setPeriode('semaine');
              setAncre(lundi);
            }}
          />
        </>
      )}
    </View>
  );
}

// ---------- Blocs ----------

function Bloc({ domaine, titre, chiffre, detail, children }: { domaine: Domaine; titre: string; chiffre?: string; detail?: string; children?: ReactNode }) {
  return (
    <View style={[styles.bloc, { backgroundColor: TEINTES[domaine] }]}>
      <Text style={styles.kicker}>{titre}</Text>
      {(chiffre !== undefined || !!detail) && (
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
          {chiffre !== undefined && <Text style={styles.chiffre}>{chiffre}</Text>}
          {!!detail && <Text style={styles.detailBloc}>{detail}</Text>}
        </View>
      )}
      {children}
    </View>
  );
}

/** Fond blanc dans un bloc coloré, pour une courbe ou une liste. */
const Panneau = ({ children }: { children: ReactNode }) => <View style={styles.panneau}>{children}</View>;
const Vide = ({ children }: { children: ReactNode }) => <Text style={styles.vide}>{children}</Text>;

function BlocSeances({ d, f }: { d: Donnees; f: Fenetre }) {
  const dans = (x: { date: string }) => x.date >= f.debut && x.date <= f.fin;
  const seances = d.seances.filter(dans);
  const libres = d.libres.filter(dans);
  const un = (x: { date: string }) => ({ date: x.date, valeur: 1 });
  const notes = seances.filter((s) => s.note !== undefined);
  const ressenti = notes.length ? notes.reduce((s, x) => s + (x.note ?? 0), 0) / notes.length : undefined;
  const dernieres = [...seances.map((s) => ({ ...s, libre: false })), ...libres.map((l) => ({ ...l, note: undefined, libre: true }))]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 3);
  return (
    <Bloc
      domaine="seances"
      titre="Séances"
      chiffre={String(seances.length)}
      detail={[`séance${seances.length > 1 ? 's' : ''} du programme`, libres.length ? `+ ${libres.length} hors programme` : '', ressenti !== undefined ? `ressenti ${formaterNombre(ressenti)}/10` : '']
        .filter(Boolean)
        .join(' · ')}
    >
      {f.periode !== 'jour' && (
        <Barres
          f={f}
          series={[
            { valeurs: parCase(seances.map(un), f.cases, 'somme'), opacite: 1 },
            { valeurs: parCase(libres.map(un), f.cases, 'somme'), opacite: 0.45 },
          ]}
          format={(v) => `${v} séance${v > 1 ? 's' : ''}`}
          legende="Plein : séances du programme · clair : sport hors programme"
        />
      )}
      {dernieres.length ? (
        <Panneau>
          {dernieres.map((s, i) => (
            <Text key={`${s.date}-${i}`} style={styles.ligne} numberOfLines={1}>
              <Text style={{ fontFamily: polices.texteGras }}>{dateCourte(s.date)}</Text> · {s.titre}
              {s.libre ? ' · hors programme' : s.note !== undefined ? ` · ressenti ${s.note}/10` : ''}
            </Text>
          ))}
        </Panneau>
      ) : (
        <Vide>Aucune séance sur cette période.</Vide>
      )}
    </Bloc>
  );
}

function BlocForce({ d, f }: { d: Donnees; f: Fenetre }) {
  const [choix, setChoix] = useState<string>();
  // Les exercices faits sur la période d'abord : c'est eux qu'on regarde.
  const faits = (c: Donnees['courbes'][number]) => c.points.some((p) => p.date >= f.debut && p.date <= f.fin);
  const courbes = [...d.courbes.filter(faits), ...d.courbes.filter((c) => !faits(c))];
  const courbe = courbes.find((c) => c.exerciceId === choix) ?? courbes[0];
  if (!courbe) return <Bloc domaine="force" titre="Force">{<Vide>Pas encore de séance avec des charges ou des répétitions notées.</Vide>}</Bloc>;
  const charge = courbe.points.some((p) => p.chargeMax !== undefined);
  const unite = charge ? 'kg' : courbe.points.some((p) => p.repetitions !== undefined) ? 'reps' : 's';
  const points = courbe.points
    .map((p) => ({ date: p.date, valeur: charge ? p.chargeMax : (p.repetitions ?? p.duree) }))
    .filter((p): p is PointDate => p.valeur !== undefined);
  const { points: dedans } = surPeriode(points, f.debut, f.fin);
  const avant = derniereAvant(points, ajouterJours(f.debut, -1));
  const dernier = dedans.at(-1);
  const meilleur = dedans.length ? Math.max(...dedans.map((p) => p.valeur)) : undefined;
  const records = d.records.filter((r) => r.date >= f.debut && r.date <= f.fin).length;
  return (
    <Bloc
      domaine="force"
      titre={`Force · ${charge ? 'charge max' : 'meilleure série'}`}
      chiffre={meilleur !== undefined ? `${formaterNombre(meilleur)} ${unite}` : undefined}
      detail={[
        meilleur === undefined && avant ? `Dernière fois le ${dateCourte(avant.date)} : ${formaterNombre(avant.valeur)} ${unite}` : '',
        dernier && avant ? `${signe(dernier.valeur - avant.valeur, unite)} par rapport à la fois d’avant` : '',
        records ? `${records} record${records > 1 ? 's' : ''} noté${records > 1 ? 's' : ''}` : '',
      ]
        .filter(Boolean)
        .join(' · ')}
    >
      {courbes.length > 1 && (
        <View style={styles.choix}>
          {courbes.slice(0, 6).map((c) => (
            <Pressable
              key={c.exerciceId}
              accessibilityRole="button"
              accessibilityState={{ selected: c.exerciceId === courbe.exerciceId }}
              onPress={() => setChoix(c.exerciceId)}
              style={[styles.choixPuce, c.exerciceId === courbe.exerciceId && styles.choixActif]}
            >
              <Text style={[styles.choixTexte, c.exerciceId === courbe.exerciceId && { color: TEINTES.force }]} numberOfLines={1}>
                {c.nom}
              </Text>
            </Pressable>
          ))}
        </View>
      )}
      {dedans.length ? (
        <Panneau>
          <Courbe points={dedans} unite={unite} libelle={`${courbe.nom}, ${charge ? 'charge max' : 'meilleure série'}`} couleur={TEINTES.force} />
        </Panneau>
      ) : (
        <Vide>{courbe.nom} n’a pas été fait sur cette période.</Vide>
      )}
    </Bloc>
  );
}

function BlocCorps({ d, f }: { d: Donnees; f: Fenetre }) {
  const [champ, setChamp] = useState<ChampMensuration>('poidsKg');
  const serie = (c: ChampMensuration) =>
    d.mensurations.flatMap((m) => (m[c] === undefined ? [] : [{ date: m.date, valeur: m[c] as number }]));
  const choisi = CORPS.find((c) => c.cle === champ)!;
  const { points } = surPeriode(serie(champ), f.debut, f.fin);
  const photos = d.photos.filter((p) => p.date >= f.debut && p.date <= f.fin).length;
  const derniere = derniereAvant(
    d.mensurations.map((m) => ({ date: m.date, valeur: 0 })),
    f.fin,
  );
  return (
    <Bloc domaine="corps" titre="Corps · mesures et photos">
      <View style={styles.tuiles}>
        {CORPS.map((c) => {
          const s = serie(c.cle);
          const v = derniereAvant(s, f.fin);
          const debut = derniereAvant(s, ajouterJours(f.debut, -1)) ?? surPeriode(s, f.debut, f.fin).points[0];
          return (
            <Pressable
              key={c.cle}
              accessibilityRole="button"
              accessibilityState={{ selected: c.cle === champ }}
              onPress={() => setChamp(c.cle)}
              style={[styles.tuile, c.cle === champ && styles.tuileActive]}
            >
              <Text style={styles.tuileChiffre}>{v ? `${formaterNombre(v.valeur)} ${c.unite}` : '—'}</Text>
              <Text style={styles.tuileTexte}>
                {c.libelle}
                {v && debut && v.date !== debut.date ? ` · ${signe(v.valeur - debut.valeur, '')}`.trimEnd() : ''}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {points.length ? (
        <Panneau>
          <Courbe points={points} unite={choisi.unite} libelle={choisi.libelle} couleur={TEINTES.corps} />
        </Panneau>
      ) : (
        <Vide>{derniere ? `Pas de mesure sur cette période (dernière prise le ${dateCourte(derniere.date)})` : 'Pas encore de mesure.'}</Vide>
      )}
      {photos > 0 && (
        <Text style={styles.detailBloc}>
          {photos} photo{photos > 1 ? 's' : ''} partagée{photos > 1 ? 's' : ''} sur cette période
        </Text>
      )}
    </Bloc>
  );
}

function BlocBienEtre({ d, f }: { d: Donnees; f: Fenetre }) {
  const bilans = d.bilans.filter((b) => b.semaine >= ajouterJours(f.debut, -6) && b.semaine <= f.fin);
  const moyenneBilan = (cle: 'energie' | 'sommeil' | 'stress' | 'motivation') =>
    bilans.length ? bilans.reduce((s, b) => s + b.reponses[cle], 0) / bilans.length : undefined;
  return (
    <Bloc domaine="bien-etre" titre="Bien-être">
      {BIEN_ETRE.map((x) => {
        const pts = d.releve(x.cle);
        const moyenne = moyenneParJour(pts, f.debut, f.fin);
        return (
          <View key={x.cle} style={{ gap: 4 }}>
            <Text style={styles.sousTitre}>
              {x.libelle} · {moyenne === undefined ? 'pas de relevé' : `${formaterNombre(moyenne)} ${x.unite}${f.periode === 'jour' ? '' : ' en moyenne'}`}
              {x.inverse ? ' (plus bas = mieux)' : ''}
            </Text>
            {f.periode !== 'jour' && moyenne !== undefined && (
              <Barres f={f} hauteur={48} max={x.echelle} series={[{ valeurs: parCase(pts, f.cases, 'moyenne'), opacite: 1 }]} format={(v) => `${formaterNombre(v)} ${x.unite}`} />
            )}
          </View>
        );
      })}
      {bilans.length > 0 && (
        <Panneau>
          <Text style={styles.ligne}>
            <Text style={{ fontFamily: polices.texteGras }}>Bilan{bilans.length > 1 ? 's' : ''} de la semaine</Text> ({bilans.length}) · énergie{' '}
            {formaterNombre(moyenneBilan('energie'))}/10 · sommeil {formaterNombre(moyenneBilan('sommeil'))}/10 · stress {formaterNombre(moyenneBilan('stress'))}/10 ·
            motivation {formaterNombre(moyenneBilan('motivation'))}/10
          </Text>
        </Panneau>
      )}
    </Bloc>
  );
}

function BlocNutrition({ d, f }: { d: Donnees; f: Fenetre }) {
  const kcal = moyenneParJour(d.kcal, f.debut, f.fin);
  const eau = moyenneParJour(d.releve('eau'), f.debut, f.fin);
  const photos = d.repasPhoto.filter((x) => x >= f.debut && x <= f.fin).length;
  const jour = f.periode === 'jour';
  return (
    <Bloc
      domaine="nutrition"
      titre="Nutrition"
      chiffre={kcal === undefined ? undefined : `${milliers(kcal)} kcal`}
      detail={[kcal === undefined ? 'aucun repas noté' : jour ? 'ce jour-là' : 'par jour noté, en moyenne', eau !== undefined ? `eau ${formaterNombre(eau)} L${jour ? '' : '/j'}` : '', photos ? `${photos} repas en photo` : '']
        .filter(Boolean)
        .join(' · ')}
    >
      {!jour && kcal !== undefined && (
        <Barres f={f} series={[{ valeurs: parCase(d.kcal, f.cases, 'moyenne'), opacite: 1 }]} format={(v) => `${milliers(v)} kcal`} />
      )}
    </Bloc>
  );
}

function BlocPas({ d, f }: { d: Donnees; f: Fenetre }) {
  const pts = d.releve('pas');
  const moyenne = moyenneParJour(pts, f.debut, f.fin);
  const jour = f.periode === 'jour';
  return (
    <Bloc
      domaine="pas"
      titre="Pas"
      chiffre={moyenne === undefined ? undefined : milliers(moyenne)}
      detail={`${moyenne === undefined ? 'pas de relevé' : jour ? 'pas ce jour-là' : 'pas par jour en moyenne'} · objectif ${milliers(d.ciblePas)}`}
    >
      {!jour && moyenne !== undefined && (
        <Barres f={f} cible={d.ciblePas} series={[{ valeurs: parCase(pts, f.cases, 'moyenne'), opacite: 1 }]} format={(v) => `${milliers(v)} pas`} legende="Trait : objectif du jour" />
      )}
    </Bloc>
  );
}

// ---------- Barres ----------

/** Barres blanches qui montent à l'ouverture (sauf si le téléphone demande moins d'animations) ; séries empilées. */
function Barres({
  f,
  series,
  format,
  cible,
  hauteur = 96,
  legende,
  max: plafond,
}: {
  f: Fenetre;
  series: { valeurs: (number | undefined)[]; opacite: number }[];
  format: (v: number) => string;
  cible?: number;
  hauteur?: number;
  legende?: string;
  /** Haut de l'échelle (5 pour une note sur 5) ; sinon la plus grande valeur. */
  max?: number;
}) {
  const [pousse] = useState(() => new Animated.Value(0));
  useEffect(() => {
    let fini = false;
    pousse.setValue(0);
    AccessibilityInfo.isReduceMotionEnabled()
      .catch(() => false)
      .then((reduit) => {
        if (fini) return;
        if (reduit) pousse.setValue(1);
        else Animated.timing(pousse, { toValue: 1, duration: 700, useNativeDriver: false }).start();
      });
    return () => {
      fini = true;
    };
  }, [pousse, f.debut, f.periode]);
  const totaux = f.cases.map((_, i) => series.reduce((s, x) => s + (x.valeurs[i] ?? 0), 0));
  const max = plafond ?? (Math.max(cible ?? 0, ...totaux) || 1);
  const nombreux = f.cases.length > 12;
  const resume = f.cases
    .map((c, i) => (series.some((s) => s.valeurs[i] !== undefined) ? `${c.libelle} : ${format(totaux[i])}` : ''))
    .filter(Boolean)
    .join(', ');
  return (
    <View style={{ gap: 4 }}>
      <View accessible accessibilityLabel={resume || 'Aucune valeur sur cette période'} style={{ height: hauteur, flexDirection: 'row', alignItems: 'flex-end', gap: nombreux ? 2 : 6 }}>
        {cible !== undefined && <View style={[styles.cible, { bottom: (cible / max) * hauteur }]} />}
        {f.cases.map((c, i) => (
          <View key={c.debut} style={{ flex: 1, height: '100%', justifyContent: 'flex-end' }}>
            {[...series].reverse().map((s, j) => {
              const v = s.valeurs[i];
              if (!v) return null;
              return (
                <Animated.View
                  key={j}
                  style={{
                    height: pousse.interpolate({ inputRange: [0, 1], outputRange: [0, Math.max(3, (v / max) * hauteur)] }),
                    backgroundColor: `rgba(255,255,255,${s.opacite})`,
                    borderRadius: nombreux ? 2 : 4,
                    marginTop: 1,
                  }}
                />
              );
            })}
            {series.every((s) => s.valeurs[i] === undefined) && <View style={styles.caseVide} />}
          </View>
        ))}
      </View>
      {nombreux ? (
        // Un mois : trop de cases pour un libellé chacune ; le 1er, puis tous les cinq jours, centrés sous leur barre.
        <View style={{ height: 14 }}>
          {f.cases.map((c, i) =>
            i === 0 || (i + 1) % 5 === 0 ? (
              <Text key={c.debut} style={[styles.axe, styles.axeMois, { left: `${((i + 0.5) / f.cases.length) * 100}%` }]}>
                {c.libelle}
              </Text>
            ) : null,
          )}
        </View>
      ) : (
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {f.cases.map((c) => (
            <Text key={c.debut} style={styles.axe} numberOfLines={1}>
              {c.libelle}
            </Text>
          ))}
        </View>
      )}
      {legende && <Text style={styles.legende}>{legende}</Text>}
    </View>
  );
}

// ---------- Historique ----------

function Historique({ d, fin, semaineOuverte, onOuvrir }: { d: Donnees; fin: string; semaineOuverte?: string; onOuvrir: (lundi: string) => void }) {
  const semaines = useMemo(
    () =>
      historiqueSemaines(
        {
          seances: d.seances.map((s) => s.date),
          horsProgramme: d.libres.map((l) => l.date),
          bilans: d.bilans.map((b) => b.semaine),
          records: d.records.map((r) => r.date),
          mesures: d.mensurations.map((m) => m.date),
          repasPhoto: d.repasPhoto,
        },
        fin,
      ),
    [d, fin],
  );
  return (
    <View style={{ gap: espace(2) }}>
      <Text accessibilityRole="header" style={styles.sectionTitre}>
        Historique semaine par semaine
      </Text>
      {semaines.map((s) => (
        <Pressable
          key={s.lundi}
          accessibilityRole="button"
          accessibilityHint="Ouvre cette semaine"
          onPress={() => onOuvrir(s.lundi)}
          style={({ pressed }) => [styles.semaine, s.lundi === semaineOuverte && styles.semaineOuverte, pressed && { backgroundColor: couleurs.discret }]}
        >
          <Text style={styles.semaineDate}>{dateCourte(s.lundi)}</Text>
          <Text style={styles.semaineTexte}>{resumeSemaine(s)}</Text>
          <ChevronRight size={16} color={couleurs.texteDoux} />
        </Pressable>
      ))}
    </View>
  );
}

const blanc = (a: number) => `rgba(255,255,255,${a})`;
const styles = StyleSheet.create({
  titre: { fontFamily: polices.titre, fontSize: 30, color: couleurs.texte, letterSpacing: 1 },
  segments: { flexDirection: 'row', backgroundColor: couleurs.discret, borderRadius: 14, padding: 4, gap: 4 },
  segment: { flex: 1, minHeight: 38, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  segmentActif: { backgroundColor: couleurs.noir },
  segmentTexte: { fontFamily: polices.texteGras, fontSize: 13, color: couleurs.texte },
  navigation: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  fleche: { width: 44, height: 44, borderRadius: 12, backgroundColor: couleurs.carte, borderWidth: 1, borderColor: couleurs.bordure, alignItems: 'center', justifyContent: 'center' },
  periode: { fontFamily: polices.texteGras, fontSize: 16, color: couleurs.texte, textAlign: 'center' },
  lien: { fontFamily: polices.texteMoyen, fontSize: 13, color: couleurs.rouge, marginTop: 2 },
  bulles: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  bulle: { minHeight: 36, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: couleurs.bordure, backgroundColor: couleurs.carte, justifyContent: 'center' },
  bulleTexte: { fontFamily: polices.texteGras, fontSize: 13, color: couleurs.texte },
  doux: { fontFamily: polices.texte, fontSize: 14, color: couleurs.texteDoux },
  bloc: { borderRadius: 22, padding: 16, gap: 10 },
  kicker: { fontFamily: polices.texteGras, fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase', color: blanc(0.85) },
  chiffre: { fontFamily: polices.titre, fontSize: 40, lineHeight: 42, color: couleurs.carte, letterSpacing: 1 },
  detailBloc: { fontFamily: polices.texte, fontSize: 13, color: blanc(0.9), flexShrink: 1 },
  sousTitre: { fontFamily: polices.texteMoyen, fontSize: 13, color: couleurs.carte },
  panneau: { backgroundColor: couleurs.carte, borderRadius: 14, padding: 12, gap: 6 },
  ligne: { fontFamily: polices.texte, fontSize: 13, color: couleurs.texte, lineHeight: 18 },
  vide: { fontFamily: polices.texte, fontSize: 13, color: blanc(0.9), fontStyle: 'italic' },
  axe: { flex: 1, fontFamily: polices.texte, fontSize: 10, color: blanc(0.8), textAlign: 'center' },
  axeMois: { position: 'absolute', width: 24, marginLeft: -12, flex: undefined },
  legende: { fontFamily: polices.texte, fontSize: 11, color: blanc(0.8) },
  cible: { position: 'absolute', left: 0, right: 0, height: 0, borderTopWidth: 1.5, borderStyle: 'dashed', borderColor: blanc(0.85) },
  caseVide: { height: 3, borderRadius: 2, backgroundColor: blanc(0.2) },
  choix: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  choixPuce: { minHeight: 32, maxWidth: 180, paddingHorizontal: 10, borderRadius: 999, backgroundColor: blanc(0.16), justifyContent: 'center' },
  choixActif: { backgroundColor: couleurs.carte },
  choixTexte: { fontFamily: polices.texteGras, fontSize: 12, color: couleurs.carte },
  tuiles: { flexDirection: 'row', gap: 8 },
  tuile: { flex: 1, minWidth: 0, borderRadius: 14, padding: 10, backgroundColor: blanc(0.14), gap: 2 },
  tuileActive: { backgroundColor: blanc(0.3) },
  tuileChiffre: { fontFamily: polices.titre, fontSize: 24, color: couleurs.carte, letterSpacing: 0.5 },
  tuileTexte: { fontFamily: polices.texte, fontSize: 12, color: blanc(0.9) },
  sectionTitre: { fontFamily: polices.texteGras, fontSize: 18, color: couleurs.texte, marginTop: espace(2) },
  semaine: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 16, backgroundColor: couleurs.carte, borderWidth: 1, borderColor: couleurs.bordure },
  semaineOuverte: { borderColor: couleurs.noir, borderWidth: 1.5 },
  semaineDate: { fontFamily: polices.texteGras, fontSize: 14, color: couleurs.texte, width: 62 },
  semaineTexte: { flex: 1, fontFamily: polices.texte, fontSize: 13, color: couleurs.texteDoux },
});
