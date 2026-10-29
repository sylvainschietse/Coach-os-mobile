// Suivis du quotidien (objectifs secondaires) : une saisie rapide par jour, une cible et une courbe sur 30 jours
// par indicateur. Le client choisit ses suivis ; le coach voit la même chose et peut régler les cibles.
import { Activity, ChevronLeft, ChevronRight, Minus, Plus, RefreshCw, Watch } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import Svg, { Line, Path } from 'react-native-svg';

import { quotidien } from '@/data/quotidien';
import { ecrireJour } from '@/domain/crm';
import { aujourdhuiParis } from '@/domain/entrainement';
import {
  aImporter,
  atteint,
  decalerJour,
  erreurCible,
  erreurValeur,
  formaterHeure,
  formaterValeur,
  indicateursDuClient,
  lireValeur,
  LUS_SUR_TELEPHONE,
  resumer,
  type DefinitionIndicateur,
  type Indicateur,
  type IndicateurSuivi,
  type Releve,
  type Resume,
} from '@/domain/quotidien';
import { accesAccordes, demanderAcces, etatHealthConnect, lirePas, lireSommeil, ouvrirReglages, type EtatHealthConnect } from '@/lib/health-connect';
import { useCharger } from '@/lib/useCharger';

import { BoutonContour } from '../coque';
import { Repliable, Saisie } from '../crm/dossier';
import { Action, Etat, ts } from '../entrainement/commun';
import { couleurs, polices } from '../theme';

const JOURS_GRAPHIQUE = 30;
/** Jusqu'où on peut revenir pour compléter une journée oubliée. */
const JOURS_RATTRAPAGE = 30;

const fmtJour = (j: string) => new Date(`${j}T12:00:00Z`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
const fmtCourt = (j: string) => new Date(`${j}T12:00:00Z`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const nombreFr = (n: number) => n.toLocaleString('fr-FR', { maximumFractionDigits: 2 });
/** Arrondi pour une moyenne ou un écart : des pas entiers, le reste au dixième. */
const arrondiPas = (def: DefinitionIndicateur, v: number) => (def.pas >= 10 ? Math.round(v) : Math.round(v * 10) / 10);
/** Texte à mettre dans le champ pour une valeur enregistrée. */
const texteDe = (def: DefinitionIndicateur, v?: number) => (v === undefined ? '' : def.saisie === 'heure' ? formaterHeure(v) : String(v).replace('.', ','));

async function charger(clientId: string, aujourdhui: string) {
  const [reglages, releves] = await Promise.all([
    quotidien.reglages(clientId),
    // Deux fois la période du graphique : la tendance compare aux 7 jours d'avant.
    quotidien.releves(clientId, decalerJour(aujourdhui, -2 * JOURS_GRAPHIQUE)),
  ]);
  return { suivis: indicateursDuClient(reglages), releves };
}

export function Quotidien({
  clientId,
  saisie = true,
  cibles = saisie,
  parCoach,
}: {
  clientId: string;
  /** Le client note ses journées ; le coach et l'aperçu ne font que lire. */
  saisie?: boolean;
  /** Choisir les suivis et régler les cibles (client, ou coach depuis le dossier). */
  cibles?: boolean;
  parCoach?: boolean;
}) {
  const aujourdhui = aujourdhuiParis();
  const { donnee, erreur: erreurChargement, recharger } = useCharger(() => charger(clientId, aujourdhui), `quotidien-${clientId}`);
  const [jour, setJour] = useState(aujourdhui);
  const [brouillon, setBrouillon] = useState<Partial<Record<Indicateur, string>>>({});
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState('');
  const [message, setMessage] = useState('');

  const actifs = donnee?.suivis.filter((s) => s.actif) ?? [];
  const duJour = (k: Indicateur) => donnee?.releves.find((r) => r.jour === jour && r.indicateur === k);
  const modifie = Object.keys(brouillon).length > 0;

  const changerJour = (n: number) => {
    setJour(decalerJour(jour, n));
    setBrouillon({});
    setErreur('');
    setMessage('');
  };
  const changer = (k: Indicateur, texte: string) => {
    setMessage('');
    setErreur('');
    setBrouillon({ ...brouillon, [k]: texte });
  };

  async function enregistrer() {
    const valeurs: Partial<Record<Indicateur, number | undefined>> = {};
    const erreurs: string[] = [];
    for (const [k, texte] of Object.entries(brouillon) as [Indicateur, string][]) {
      const s = donnee?.suivis.find((x) => x.def.cle === k);
      if (!s) continue;
      const v = lireValeur(s.def, texte);
      const e = erreurValeur(s.def, v);
      if (e) erreurs.push(e);
      else if (v !== duJour(k)?.valeur) valeurs[k] = v;
    }
    if (erreurs.length) return setErreur(erreurs.join('\n'));
    setOccupe(true);
    setErreur('');
    try {
      if (Object.keys(valeurs).length) await quotidien.enregistrerReleves(clientId, jour, valeurs);
      setBrouillon({});
      setMessage(jour === aujourdhui ? 'Journée enregistrée.' : `Journée du ${ecrireJour(jour)} enregistrée.`);
      recharger();
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Enregistrement impossible');
    } finally {
      setOccupe(false);
    }
  }

  return (
    <View style={{ gap: 20 }}>
      <View style={{ gap: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 }}>
            <Activity size={20} color={couleurs.rouge} />
            <Text accessibilityRole="header" style={[ts.titre, { fontSize: 18 }]}>
              {saisie ? 'Mon quotidien' : 'Quotidien'}
            </Text>
          </View>
          <BoutonContour icone={RefreshCw} nom="Actualiser le quotidien" desactive={occupe} onPress={recharger} />
        </View>
        <Text style={[ts.texte, { color: couleurs.texteDoux }]}>
          {saisie
            ? 'Notez chaque jour vos pas, votre eau, votre sommeil… en quelques secondes. Chaque suivi a sa cible et sa courbe sur 30 jours.'
            : 'Les petits objectifs du quotidien notés par le client, avec leur cible et leur évolution sur 30 jours.'}
        </Text>
      </View>

      {saisie && (
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <BoutonContour icone={ChevronLeft} nom="Jour précédent" desactive={occupe || jour <= decalerJour(aujourdhui, -JOURS_RATTRAPAGE)} onPress={() => changerJour(-1)} />
          <View style={{ alignItems: 'center', flexShrink: 1 }}>
            <Text style={ts.titre}>{jour === aujourdhui ? 'Aujourd’hui' : jour === decalerJour(aujourdhui, -1) ? 'Hier' : fmtJour(jour)}</Text>
            {jour >= decalerJour(aujourdhui, -1) && <Text style={ts.doux}>{fmtJour(jour)}</Text>}
          </View>
          <BoutonContour icone={ChevronRight} nom="Jour suivant" desactive={occupe || jour >= aujourdhui} onPress={() => changerJour(1)} />
        </View>
      )}

      {saisie && donnee && (
        <Telephone
          clientId={clientId}
          aujourdhui={aujourdhui}
          releves={donnee.releves}
          suivis={donnee.suivis.filter((x) => x.actif && LUS_SUR_TELEPHONE.includes(x.def.cle)).map((x) => x.def.cle)}
          onImporte={recharger}
        />
      )}

      <Etat erreur={erreur || erreurChargement || undefined} message={message} />
      {!donnee && !erreurChargement && <Text style={ts.doux}>Chargement…</Text>}

      {donnee && actifs.length === 0 && (
        <View style={{ borderWidth: 1, borderStyle: 'dashed', borderColor: couleurs.bordure, borderRadius: 12, padding: 20 }}>
          <Text style={[ts.texte, { color: couleurs.texteDoux }]}>Aucun suivi choisi. {cibles ? 'Choisissez-en ci-dessous.' : ''}</Text>
        </View>
      )}

      {donnee &&
        actifs.map((s) => (
          <CarteIndicateur
            key={s.def.cle}
            s={s}
            resume={resumer(s, donnee.releves, aujourdhui, JOURS_GRAPHIQUE)}
            saisie={saisie}
            occupe={occupe}
            texte={brouillon[s.def.cle] ?? texteDe(s.def, duJour(s.def.cle)?.valeur)}
            source={duJour(s.def.cle)?.source}
            onTexte={(t) => changer(s.def.cle, t)}
          />
        ))}

      {saisie && actifs.length > 0 && (
        <Action
          libelle={occupe ? 'Enregistrement…' : modifie ? 'Enregistrer la journée' : 'Journée à jour'}
          chargement={occupe}
          desactive={!modifie || occupe}
          onPress={enregistrer}
        />
      )}

      {donnee && cibles && <Reglages clientId={clientId} suivis={donnee.suivis} parCoach={parCoach} onChange={recharger} />}
    </View>
  );
}

/** Jours relus sur le téléphone à chaque import : une semaine oubliée se rattrape d'elle-même. */
const JOURS_IMPORT = 7;

/**
 * Pas et sommeil lus dans Health Connect (Samsung Health, Google Fit, Garmin, Fitbit… y déposent leurs données).
 * Une fois l'accès donné, l'import se fait à l'ouverture ; une saisie à la main n'est jamais écrasée.
 */
function Telephone({
  clientId,
  aujourdhui,
  releves,
  suivis,
  onImporte,
}: {
  clientId: string;
  aujourdhui: string;
  releves: Releve[];
  suivis: Indicateur[];
  onImporte: () => void;
}) {
  const [etat, setEtat] = useState<EtatHealthConnect>();
  const [relie, setRelie] = useState(false);
  const [occupe, setOccupe] = useState(false);
  const [message, setMessage] = useState('');
  const [erreur, setErreur] = useState('');
  const fait = useRef(false);

  async function importer(silencieux: boolean) {
    setOccupe(true);
    setErreur('');
    try {
      const nouveaux: Partial<Record<string, Partial<Record<Indicateur, number>>>> = {};
      for (let i = 0; i < JOURS_IMPORT; i++) {
        const jour = decalerJour(aujourdhui, -i);
        const lus: [Indicateur, number | null][] = [];
        if (suivis.includes('pas')) lus.push(['pas', await lirePas(jour)]);
        if (suivis.includes('sommeil')) lus.push(['sommeil', await lireSommeil(jour)]);
        for (const [k, v] of lus) {
          const valeur = v === null ? null : k === 'sommeil' ? Math.round(v * 4) / 4 : Math.round(v);
          if (aImporter(releves, jour, k, valeur)) nouveaux[jour] = { ...nouveaux[jour], [k]: valeur };
        }
      }
      for (const [jour, valeurs] of Object.entries(nouveaux)) await quotidien.enregistrerReleves(clientId, jour, valeurs!, 'telephone');
      const n = Object.values(nouveaux).reduce((t, v) => t + Object.keys(v!).length, 0);
      if (n) onImporte();
      if (!silencieux || n) setMessage(n ? `${n} valeur${n > 1 ? 's' : ''} importée${n > 1 ? 's' : ''} du téléphone.` : 'Rien de nouveau sur le téléphone.');
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Lecture impossible');
    } finally {
      setOccupe(false);
    }
  }

  useEffect(() => {
    let annule = false;
    etatHealthConnect().then(async (e) => {
      if (annule) return;
      setEtat(e);
      if (e !== 'disponible') return;
      const ok = await accesAccordes();
      if (annule || !ok.some((t) => t === 'Steps' || t === 'SleepSession')) return;
      setRelie(true);
      if (!fait.current) {
        fait.current = true;
        importer(true);
      }
    });
    return () => {
      annule = true;
    };
    // Une fois à l'ouverture : les relevés rechargés après l'import ne doivent pas relancer la lecture.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  if (!suivis.length || !etat || etat === 'indisponible') return null;
  return (
    <View style={[ts.carte, { padding: 16, gap: 8, borderRadius: 16 }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Watch size={18} color={couleurs.rouge} />
        <Text style={ts.titre}>Montre et téléphone</Text>
      </View>
      {etat === 'a_installer' ? (
        <Text style={ts.texte}>Installez ou mettez à jour l’application Health Connect pour importer vos pas et votre sommeil automatiquement.</Text>
      ) : (
        <>
          <Text style={ts.doux}>
            {relie
              ? 'Vos pas et votre sommeil des 7 derniers jours sont importés à chaque ouverture. Une valeur que vous avez saisie vous-même n’est jamais remplacée.'
              : 'Importez vos pas et votre sommeil depuis Health Connect, où Samsung Health, Google Fit, Garmin, Fitbit ou votre montre déposent leurs données.'}
          </Text>
          <Etat erreur={erreur || undefined} message={message} />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            <Action
              petit
              variante={relie ? 'contour' : 'plein'}
              libelle={occupe ? 'Lecture…' : relie ? 'Importer maintenant' : 'Relier ma montre ou mon téléphone'}
              chargement={occupe}
              desactive={occupe}
              onPress={async () => {
                if (!relie) {
                  const ok = await demanderAcces().catch(() => []);
                  if (!ok.some((t) => t === 'Steps' || t === 'SleepSession')) {
                    setErreur('Accès refusé : autorisez les pas et le sommeil dans Health Connect.');
                    return;
                  }
                  setRelie(true);
                }
                importer(false);
              }}
            />
            {relie && <Action petit variante="fantome" libelle="Réglages Health Connect" onPress={ouvrirReglages} />}
          </View>
        </>
      )}
    </View>
  );
}

function CarteIndicateur({
  s,
  resume,
  saisie,
  occupe,
  texte,
  source,
  onTexte,
}: {
  s: IndicateurSuivi;
  resume: Resume;
  saisie: boolean;
  occupe: boolean;
  texte: string;
  source?: Releve['source'];
  onTexte: (t: string) => void;
}) {
  const { def, cible } = s;
  const sens = def.sens === 'au_moins' ? 'au moins' : 'au plus';
  const valeurJour = lireValeur(def, texte);
  const tenu = !def.hebdo && valeurJour !== undefined && !Number.isNaN(valeurJour) && atteint(def.sens, valeurJour, cible);
  return (
    <View style={[ts.carte, { padding: 16, gap: 10, borderRadius: 16 }]}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <View style={{ flexShrink: 1, gap: 2 }}>
          <Text style={ts.titre}>{def.libelle}</Text>
          <Text style={ts.doux}>
            Cible : {sens} {formaterValeur(def, cible)} {def.hebdo ? 'par semaine' : def.saisie === 'heure' ? '' : 'par jour'}
          </Text>
        </View>
        {tenu && <Text style={[ts.doux, { fontFamily: polices.texteGras, color: couleurs.vert }]}>✓ Cible tenue</Text>}
      </View>

      {saisie && <Champ def={def} texte={texte} occupe={occupe} onTexte={onTexte} />}
      {saisie && source === 'telephone' && <Text style={ts.doux}>Valeur lue sur le téléphone ; vous pouvez la corriger.</Text>}

      <Text style={ts.doux}>
        {def.hebdo && resume.totalSemaine !== undefined
          ? `Cette semaine : ${formaterValeur(def, resume.totalSemaine)} sur ${formaterValeur(def, cible)} au plus.`
          : resume.joursNotes7
            ? `7 derniers jours : moyenne ${formaterValeur(def, arrondiPas(def, resume.moyenne7!))} · cible tenue ${resume.joursAtteints7} jour${resume.joursAtteints7 > 1 ? 's' : ''} sur ${resume.joursNotes7} noté${resume.joursNotes7 > 1 ? 's' : ''}.`
            : 'Rien de noté ces 7 derniers jours.'}
        {resume.tendance !== undefined && resume.tendance !== 0 && def.saisie !== 'heure'
          ? ` ${resume.tendance > 0 ? '+' : ''}${formaterValeur(def, arrondiPas(def, resume.tendance))} par rapport à la semaine d’avant.`
          : ''}
      </Text>
      {resume.points.some((p) => p.valeur !== undefined) && <Graphique def={def} cible={def.hebdo ? undefined : cible} points={resume.points} />}
      {saisie && <Text style={[ts.doux, { fontSize: 11 }]}>{def.aide}</Text>}
    </View>
  );
}

/** Saisie en un geste : une note de 1 à 5, une heure, ou un nombre avec − / +. */
function Champ({ def, texte, occupe, onTexte }: { def: DefinitionIndicateur; texte: string; occupe: boolean; onTexte: (t: string) => void }) {
  if (def.saisie === 'note') {
    const choisie = lireValeur(def, texte);
    return (
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {[1, 2, 3, 4, 5].map((n) => (
          <Pressable
            key={n}
            accessibilityRole="button"
            accessibilityLabel={`${def.libelle} : ${n} sur 5`}
            accessibilityState={{ selected: choisie === n }}
            disabled={occupe}
            onPress={() => onTexte(choisie === n ? '' : String(n))}
            style={{
              flex: 1,
              minHeight: 44,
              borderRadius: 10,
              borderWidth: 1,
              borderColor: choisie === n ? couleurs.rouge : couleurs.bordure,
              backgroundColor: choisie === n ? couleurs.rouge : couleurs.carte,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text style={{ fontFamily: polices.texteGras, fontSize: 16, color: choisie === n ? '#FFFFFF' : couleurs.texte }}>{n}</Text>
          </Pressable>
        ))}
      </View>
    );
  }
  if (def.saisie === 'heure') {
    return <Saisie libelle="Heure" placeholder="22:30" valeur={texte} desactive={occupe} onChange={onTexte} />;
  }
  const actuelle = lireValeur(def, texte);
  const pas = (sens: 1 | -1) => {
    const base = actuelle === undefined || Number.isNaN(actuelle) ? 0 : actuelle;
    const suite = Math.min(def.max, Math.max(def.min, Math.round((base + sens * def.pas) / def.pas) * def.pas));
    onTexte(String(Math.round(suite * 100) / 100).replace('.', ','));
  };
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <BoutonContour icone={Minus} nom={`${def.libelle} : moins ${nombreFr(def.pas)}`} desactive={occupe || !actuelle} onPress={() => pas(-1)} />
      <TextInput
        accessibilityLabel={`${def.libelle} (${def.unite})`}
        value={texte}
        onChangeText={onTexte}
        editable={!occupe}
        inputMode="decimal"
        keyboardType="decimal-pad"
        placeholder="–"
        placeholderTextColor={couleurs.suggestion}
        style={{
          flex: 1,
          minWidth: 0,
          minHeight: 44,
          borderRadius: 11,
          borderWidth: 1,
          borderColor: couleurs.saisie,
          backgroundColor: couleurs.carte,
          paddingHorizontal: 12,
          textAlign: 'center',
          fontFamily: polices.texteGras,
          fontSize: 18,
          color: couleurs.texte,
        }}
      />
      <Text style={[ts.texte, { flexShrink: 0 }]}>{def.unite}</Text>
      <BoutonContour icone={Plus} nom={`${def.libelle} : plus ${nombreFr(def.pas)}`} desactive={occupe} onPress={() => pas(1)} />
    </View>
  );
}

/** Barres des 30 derniers jours, ligne pointillée à la cible ; toucher une barre affiche sa valeur. */
function Graphique({ def, cible, points }: { def: DefinitionIndicateur; cible?: number; points: Resume['points'] }) {
  const [largeur, setLargeur] = useState(0);
  const [choisi, setChoisi] = useState<number>();
  const hauteur = 96;
  // Heure du dernier écran : la barre part de 18 h, plus elle est haute plus l'écran a été tard.
  const bas = def.saisie === 'heure' ? def.min : 0;
  const valeurs = points.flatMap((p) => (p.valeur === undefined ? [] : [p.valeur]));
  const haut = def.saisie === 'note' ? 5 : Math.max(...valeurs, cible ?? bas) * 1.1 || 1;
  const y = (v: number) => hauteur - ((v - bas) / (haut - bas)) * hauteur;
  const colonne = largeur / points.length;
  const barre = Math.max(2, colonne - 2);
  const r = Math.min(4, barre / 2);
  const dernier = [...points].reverse().find((p) => p.valeur !== undefined);
  const affiche = choisi !== undefined ? points[choisi] : dernier;
  return (
    <View style={{ gap: 6 }}>
      <Text style={[ts.doux, { color: couleurs.texte }]} aria-live="polite">
        {affiche?.valeur !== undefined ? `${fmtCourt(affiche.jour)} : ${formaterValeur(def, affiche.valeur)}` : affiche ? `${fmtCourt(affiche.jour)} : rien de noté` : ''}
      </Text>
      <View
        accessible
        accessibilityLabel={`${def.libelle}, 30 derniers jours : ${valeurs.length} jours notés${cible !== undefined ? `, cible ${formaterValeur(def, cible)}` : ''}`}
        onLayout={(e) => setLargeur(e.nativeEvent.layout.width)}
        style={{ height: hauteur }}
      >
        {largeur > 0 && (
          <Svg width={largeur} height={hauteur}>
            <Line x1={0} x2={largeur} y1={hauteur - 0.5} y2={hauteur - 0.5} stroke={couleurs.bordure} strokeWidth={1} />
            {points.map((p, i) => {
              if (p.valeur === undefined || p.valeur <= bas) return null;
              const x = i * colonne + 1;
              const top = Math.max(0, y(p.valeur));
              const h = hauteur - top;
              const rr = Math.min(r, h);
              return (
                <Path
                  key={p.jour}
                  d={`M${x},${hauteur} V${top + rr} Q${x},${top} ${x + rr},${top} H${x + barre - rr} Q${x + barre},${top} ${x + barre},${top + rr} V${hauteur} Z`}
                  fill={i === choisi ? couleurs.secondaire : couleurs.rougeMarque}
                  opacity={choisi === undefined || i === choisi ? 1 : 0.55}
                />
              );
            })}
            {cible !== undefined && cible > bas && cible < haut && (
              <Line x1={0} x2={largeur} y1={y(cible)} y2={y(cible)} stroke={couleurs.texte} strokeWidth={1.5} strokeDasharray="4 4" />
            )}
          </Svg>
        )}
        {/* Zones à toucher : toute la colonne, plus large que la barre. */}
        <View style={{ position: 'absolute', inset: 0, flexDirection: 'row' }}>
          {points.map((p, i) => (
            <Pressable
              key={p.jour}
              accessibilityLabel={`${fmtCourt(p.jour)} : ${p.valeur === undefined ? 'rien de noté' : formaterValeur(def, p.valeur)}`}
              onPress={() => setChoisi(choisi === i ? undefined : i)}
              style={{ flex: 1 }}
            />
          ))}
        </View>
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text style={[ts.doux, { fontSize: 11 }]}>{fmtCourt(points[0].jour)}</Text>
        {cible !== undefined && <Text style={[ts.doux, { fontSize: 11 }]}>- - - cible</Text>}
        <Text style={[ts.doux, { fontSize: 11 }]}>{fmtCourt(points[points.length - 1].jour)}</Text>
      </View>
    </View>
  );
}

/** Choisir ses suivis et régler les cibles. */
function Reglages({ clientId, suivis, parCoach, onChange }: { clientId: string; suivis: IndicateurSuivi[]; parCoach?: boolean; onChange: () => void }) {
  const [cibles, setCibles] = useState<Partial<Record<Indicateur, string>>>({});
  const [occupe, setOccupe] = useState<Indicateur>();
  const [erreur, setErreur] = useState('');
  const [message, setMessage] = useState('');

  async function enregistrer(s: IndicateurSuivi, patch: { actif?: boolean; cible?: string }) {
    let cible = s.cibleParDefaut ? undefined : s.cible;
    if (patch.cible !== undefined) {
      const v = lireValeur(s.def, patch.cible);
      const e = erreurCible(s.def, v);
      if (e) return setErreur(`${s.def.libelle} · ${e}`);
      cible = v;
    }
    setOccupe(s.def.cle);
    setErreur('');
    setMessage('');
    try {
      await quotidien.enregistrerReglage({ clientId, indicateur: s.def.cle, actif: patch.actif ?? s.actif, cible, modifiePar: parCoach ? 'coach' : 'client' });
      const suite = { ...cibles };
      delete suite[s.def.cle];
      setCibles(suite);
      setMessage(patch.actif === undefined ? `Cible « ${s.def.libelle} » enregistrée.` : patch.actif ? `« ${s.def.libelle} » ajouté.` : `« ${s.def.libelle} » retiré.`);
      onChange();
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Enregistrement impossible');
    } finally {
      setOccupe(undefined);
    }
  }

  return (
    <Repliable
      resume={<Text style={ts.titre}>{parCoach ? 'Suivis et cibles du client' : 'Choisir mes suivis et mes cibles'}</Text>}
      style={{ borderWidth: 1, borderColor: couleurs.bordure, borderRadius: 16, backgroundColor: couleurs.carte, padding: 16 }}
    >
      <View style={{ gap: 16 }}>
        <Etat erreur={erreur || undefined} message={message} />
        {suivis.map((s) => (
          <View key={s.def.cle} style={{ gap: 8, borderTopWidth: 1, borderTopColor: couleurs.bordure, paddingTop: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <View style={{ flexShrink: 1 }}>
                <Text style={ts.titreChamp}>{s.def.libelle}</Text>
                <Text style={ts.doux}>
                  {s.def.sens === 'au_moins' ? 'Au moins' : 'Au plus'} {formaterValeur(s.def, s.cible)}
                  {s.def.hebdo ? ' par semaine' : ''}
                  {s.cibleParDefaut ? ' (conseillé)' : ''}
                </Text>
              </View>
              <Action
                petit
                variante={s.actif ? 'plein' : 'contour'}
                libelle={s.actif ? 'Suivi' : 'Ajouter'}
                nom={`${s.actif ? 'Retirer' : 'Ajouter'} le suivi ${s.def.libelle}`}
                desactive={!!occupe}
                chargement={occupe === s.def.cle}
                onPress={() => enregistrer(s, { actif: !s.actif })}
              />
            </View>
            {s.actif && (
              <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
                <View style={{ flex: 1 }}>
                  <Saisie
                    libelle={`Cible${s.def.hebdo ? ' par semaine' : ''}${s.def.saisie === 'heure' ? ' (heure)' : s.def.saisie === 'note' ? ' (1 à 5)' : ` (${s.def.unite})`}`}
                    type={s.def.saisie === 'heure' ? undefined : 'nombre'}
                    placeholder={texteDe(s.def, s.cible)}
                    valeur={cibles[s.def.cle] ?? ''}
                    desactive={!!occupe}
                    onChange={(t) => setCibles({ ...cibles, [s.def.cle]: t })}
                  />
                </View>
                <Action
                  variante="contour"
                  libelle="Enregistrer"
                  desactive={!!occupe || !cibles[s.def.cle]?.trim()}
                  onPress={() => enregistrer(s, { cible: cibles[s.def.cle] })}
                />
              </View>
            )}
          </View>
        ))}
      </View>
    </Repliable>
  );
}
