// Résultats du bilan postural, lisibles et visuels : profil de mouvement (score et radar), priorités, droite / gauche,
// chaque mesure avec sa jauge et son explication, morphologie, carte des muscles, plan de travail et synthèse client.
import { useState } from 'react';
import { Pressable, Share, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, Ellipse, G, Line, Path, Polygon, Rect, Text as SvgText } from 'react-native-svg';

import {
  anglesSquat,
  asymetries,
  carteMuscles,
  compensation,
  coteDe,
  explication,
  morphologie,
  musclesConstat,
  planTravail,
  priorites,
  qualites,
  scoreMouvement,
  syntheseClient,
  texteSyntheseClient,
  ZONES,
  type EtatMuscle,
  type HypotheseMuscle,
  type ZoneMuscle,
} from '@/domain/analyse-mouvement';
import { AVERTISSEMENT, constats, pistes, type BilanPostural, type Constat, type Niveau, type VueId } from '@/domain/bilan-postural';

import { Bouton } from '../composants';
import { Modale } from '../crm/dossier';
import { couleurs, espace, polices, titreSection } from '../theme';
import { etatA11y } from '@/lib/accessibilite';

export const COULEUR_NIVEAU: Record<Niveau, { fond: string; texte: string; plein: string; libelle: string }> = {
  normal: { fond: couleurs.vertClair, texte: couleurs.vert, plein: couleurs.vert, libelle: 'Dans la norme' },
  leger: { fond: couleurs.orangeClair, texte: couleurs.orange, plein: '#E8A33A', libelle: 'Léger' },
  marque: { fond: couleurs.rougeClair, texte: couleurs.rougeTexte, plein: couleurs.rouge, libelle: 'Marqué' },
};

export const COULEUR_MUSCLE: Record<EtatMuscle, { plein: string; fond: string; texte: string; libelle: string }> = {
  faible: { plein: couleurs.rouge, fond: couleurs.rougeClair, texte: couleurs.rougeTexte, libelle: 'Probablement faible' },
  raide: { plein: '#E8A33A', fond: couleurs.orangeClair, texte: '#7A2A08', libelle: 'Probablement raide' },
  fort: { plein: couleurs.bleu, fond: '#E8EEFD', texte: '#1D4ED8', libelle: 'Point fort' },
};

const virgule = (n: number) => String(n).replace('.', ',');
const degres = (n: number) => `${virgule(n)}°`;

export function AnalyseBilan({
  bilan,
  avant,
  dateAvant,
  prenom,
  onRevoir,
}: {
  bilan: BilanPostural | undefined;
  avant?: BilanPostural;
  dateAvant?: string;
  prenom?: string;
  /** Ouvre la photo ou la vidéo d'une vue, si elle est gardée. */
  onRevoir?: (vue: VueId) => void;
}) {
  const [largeur, setLargeur] = useState(0);
  const [synthese, setSynthese] = useState(false);
  const liste = constats(bilan);
  if (!liste.length) return null;
  const mesurer = (e: LayoutChangeEvent) => setLargeur(Math.round(e.nativeEvent.layout.width));
  const listeAvant = new Map(constats(avant).map((c) => [c.id, c]));
  const prio = priorites(bilan);
  const morpho = morphologie(bilan);
  const angles = anglesSquat(bilan);
  const muscles = carteMuscles(bilan);
  const plan = planTravail(bilan);
  const toutesPistes = pistes(bilan);

  return (
    <View style={{ gap: espace(4), marginTop: espace(2) }} onLayout={mesurer}>
      <ProfilMouvement bilan={bilan} largeur={largeur} />

      {prio.length > 0 && (
        <View style={{ gap: espace(2) }}>
          <Text style={styles.titreSection}>{prio.length > 1 ? `${prio.length} priorités` : 'La priorité'}</Text>
          {prio.map((p, i) => (
            <View key={p.titre} style={[styles.carte, { flexDirection: 'row', gap: espace(3), alignItems: 'flex-start' }]}>
              <View style={[styles.pastille, { backgroundColor: i === 0 ? couleurs.rouge : couleurs.secondaire }]}>
                <Text style={styles.pastilleTexte}>{i + 1}</Text>
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={styles.gras}>{p.titre}</Text>
                {!!p.detail && <Text style={styles.chiffresDoux}>{p.detail}</Text>}
                <Text style={styles.doux}>{`Souvent faibles : ${p.faibles.join(', ').toLowerCase()}.`}</Text>
              </View>
            </View>
          ))}
        </View>
      )}

      <DroiteGauche bilan={bilan} />

      <View style={{ gap: espace(2) }}>
        <Text style={styles.titreSection}>Les mesures</Text>
        <Text style={styles.aide}>Touche une mesure pour voir ce qu’elle veut dire, les muscles en jeu et comment le vérifier.</Text>
        {liste.map((c) => (
          <CarteMesure
            key={c.id}
            c={c}
            avant={listeAvant.get(c.id)}
            dateAvant={dateAvant}
            exercices={[...new Set(toutesPistes.filter((p) => p.depuis.includes(c.titre)).flatMap((p) => p.exercices))].slice(0, 4)}
            onRevoir={bilan?.vues[c.vue]?.media && onRevoir ? () => onRevoir(c.vue) : undefined}
          />
        ))}
      </View>

      {(morpho || angles) && (
        <View style={{ gap: espace(2) }}>
          <Text style={styles.titreSection}>Morphologie</Text>
          {angles && (
            <View style={[styles.carte, { gap: espace(2) }]}>
              <Text style={styles.gras}>{`Au point bas du squat · ${angles.sousParallele ? 'hanche sous le genou' : 'au-dessus de la parallèle'}`}</Text>
              <View style={{ flexDirection: 'row', gap: espace(2) }}>
                {[
                  ['Hanche', angles.hanche, 'angle buste-cuisse'],
                  ['Genou', angles.genou, 'angle cuisse-jambe'],
                  ['Cheville', angles.cheville, 'tibia vers l’avant'],
                ].map(([l, v, a]) => (
                  <View key={l as string} style={styles.tuile}>
                    <Text style={styles.tuileValeur}>{`${v}°`}</Text>
                    <Text style={styles.tuileLibelle}>{l}</Text>
                    <Text style={styles.tuileAide}>{a}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}
          {morpho && (
            <View style={[styles.carte, { gap: espace(3) }]}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: espace(2) }}>
                <Text style={styles.gras}>Longueur des segments</Text>
                <Text style={styles.aide}>{`d’après la ${morpho.source}`}</Text>
              </View>
              {(
                [
                  ['Buste (épaule → hanche)', morpho.buste, couleurs.bleu],
                  ['Cuisse (hanche → genou)', morpho.cuisse, couleurs.rouge],
                  ['Jambe (genou → cheville)', 1, couleurs.orange],
                ] as [string, number, string][]
              ).map(([l, v, c]) => (
                <View key={l} style={{ gap: 4 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text style={styles.texte}>{l}</Text>
                    <Text style={styles.chiffres}>{v.toFixed(2).replace('.', ',')}</Text>
                  </View>
                  <View style={styles.rail}>
                    <View style={[styles.railPlein, { width: `${Math.min(100, (v / Math.max(1.6, morpho.buste, morpho.cuisse)) * 100)}%`, backgroundColor: c }]} />
                  </View>
                </View>
              ))}
              <Text style={styles.aide}>Rapportées à la jambe. Repère moyen : cuisse 1,0 à 1,05, buste 1,2 à 1,35.</Text>
              <View style={styles.encadreSombre}>
                {morpho.lecture.map((l) => (
                  <Text key={l} style={styles.texteClair}>
                    {l}
                  </Text>
                ))}
                {morpho.conseils.map((l) => (
                  <Text key={l} style={styles.texteClair}>{`→ ${l}`}</Text>
                ))}
              </View>
            </View>
          )}
        </View>
      )}

      {muscles.length > 0 && <CarteDesMuscles muscles={muscles} largeur={largeur} />}

      {plan && (
        <View style={{ gap: espace(2) }}>
          <Text style={styles.titreSection}>{`Plan de travail · ${plan.semaines} semaines`}</Text>
          <View style={styles.frise}>
            {Array.from({ length: plan.semaines }, (_, i) => (
              <View key={i} style={[styles.semaine, { backgroundColor: i < 4 ? couleurs.rouge : i < plan.semaines - 1 ? couleurs.secondaire : couleurs.bleu }]} />
            ))}
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={styles.aide}>Sem. 1-4 · corriger</Text>
            <Text style={styles.aide}>{`5-${plan.semaines - 1} · renforcer`}</Text>
            <Text style={styles.aide}>{`${plan.semaines} · re-test`}</Text>
          </View>
          <Phase titre="Phase 1 · Corriger" sous="semaines 1 à 4" couleur={couleurs.rouge}>
            {plan.corriger.map((g) => (
              <View key={g.titre} style={{ gap: 2 }}>
                <Text style={styles.surtitre}>{g.titre}</Text>
                {g.exercices.map((e) => (
                  <Text key={e} style={styles.texte}>{`• ${e}`}</Text>
                ))}
              </View>
            ))}
          </Phase>
          <Phase titre="Phase 2 · Renforcer" sous={`semaines 5 à ${plan.semaines - 1}`} couleur={couleurs.secondaire}>
            {plan.renforcer.map((e) => (
              <Text key={e} style={styles.texte}>{`• ${e}`}</Text>
            ))}
          </Phase>
          {plan.objectifs.length > 0 && (
            <Phase titre="Re-test" sous={`semaine ${plan.semaines}`} couleur={couleurs.bleu}>
              <Text style={styles.doux}>Mêmes vues, mêmes réglages : l’appli compare chaque angle avec ce test.</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: espace(2) }}>
                {plan.objectifs.map((o) => (
                  <View key={o.titre} style={styles.objectif}>
                    <Text style={styles.tuileAide}>{o.titre}</Text>
                    <Text style={styles.chiffres}>{`${degres(o.valeur)} → ${o.sens} ${degres(o.cible)}`}</Text>
                  </View>
                ))}
              </View>
            </Phase>
          )}
        </View>
      )}

      <Bouton libelle="Synthèse pour le client" onPress={() => setSynthese(true)} />
      <Text style={styles.aide}>{AVERTISSEMENT}</Text>
      {synthese && <SyntheseClientModale bilan={bilan} prenom={prenom} onFermer={() => setSynthese(false)} />}
    </View>
  );
}

// ---------- Profil de mouvement : score et radar ----------

function ProfilMouvement({ bilan, largeur }: { bilan: BilanPostural | undefined; largeur: number }) {
  const q = qualites(bilan);
  const score = scoreMouvement(bilan);
  if (!q.length || score === undefined) return null;
  const l = Math.max(260, Math.min(largeur - 2 * 16, 420));
  return (
    <View style={[styles.carte, { gap: espace(3) }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: espace(3) }}>
        <Anneau valeur={score} taille={72} fond={couleurs.discret} texte={couleurs.texte} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={styles.gras}>Profil de mouvement</Text>
          <Text style={styles.doux}>{syntheseClient(bilan).phrase}</Text>
        </View>
      </View>
      {q.length >= 3 ? (
        <Radar qualites={q} largeur={l} />
      ) : (
        q.map((x) => (
          <View key={x.cle} style={{ gap: 4 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={styles.texte}>{x.libelle}</Text>
              <Text style={styles.chiffres}>{`${virgule(x.note)}/10`}</Text>
            </View>
            <View style={styles.rail}>
              <View style={[styles.railPlein, { width: `${x.note * 10}%`, backgroundColor: x.note >= 8 ? couleurs.vert : x.note >= 5 ? '#E8A33A' : couleurs.rouge }]} />
            </View>
          </View>
        ))
      )}
    </View>
  );
}

export function Anneau({ valeur, taille, fond, texte }: { valeur: number; taille: number; fond: string; texte: string }) {
  const r = taille / 2 - 6;
  const tour = 2 * Math.PI * r;
  return (
    <Svg width={taille} height={taille} accessibilityLabel={`Score ${valeur} sur 100`}>
      <Circle cx={taille / 2} cy={taille / 2} r={r} fill="none" stroke={fond} strokeWidth={9} />
      <Circle
        cx={taille / 2}
        cy={taille / 2}
        r={r}
        fill="none"
        stroke={couleurs.rouge}
        strokeWidth={9}
        strokeLinecap="round"
        strokeDasharray={`${(tour * valeur) / 100} ${tour}`}
        transform={`rotate(-90 ${taille / 2} ${taille / 2})`}
      />
      <SvgText x={taille / 2} y={taille / 2 + 7} textAnchor="middle" fontSize={taille / 3.6} fontFamily={polices.chiffres} fill={texte}>
        {String(valeur)}
      </SvgText>
    </Svg>
  );
}

function Radar({ qualites: q, largeur }: { qualites: { cle: string; libelle: string; note: number }[]; largeur: number }) {
  const h = Math.round(largeur * 0.72);
  const cx = largeur / 2;
  const cy = h / 2;
  const R = Math.min(largeur * 0.2, h * 0.3);
  const n = q.length;
  const pt = (i: number, f: number) => {
    const a = -Math.PI / 2 + (2 * Math.PI * i) / n;
    return { x: cx + Math.cos(a) * R * f, y: cy + Math.sin(a) * R * f };
  };
  const poly = (f: (i: number) => number) => q.map((_, i) => pt(i, f(i))).map((p) => `${p.x},${p.y}`).join(' ');
  return (
    <Svg width={largeur} height={h} accessibilityLabel={`Radar : ${q.map((x) => `${x.libelle} ${x.note} sur 10`).join(', ')}`}>
      {[0.25, 0.5, 0.75, 1].map((f) => (
        <Polygon key={f} points={poly(() => f)} fill="none" stroke={couleurs.bordure} strokeWidth={1} />
      ))}
      {q.map((_, i) => {
        const p = pt(i, 1);
        return <Line key={i} x1={cx} y1={cy} x2={p.x} y2={p.y} stroke={couleurs.bordure} strokeWidth={1} />;
      })}
      <Polygon points={poly((i) => Math.max(0.05, q[i].note / 10))} fill="rgba(195,24,30,0.14)" stroke={couleurs.rouge} strokeWidth={2} />
      {q.map((x, i) => {
        const p = pt(i, Math.max(0.05, x.note / 10));
        const faible = x.note < 7;
        return <Circle key={x.cle} cx={p.x} cy={p.y} r={4} fill={faible ? couleurs.orange : couleurs.rouge} />;
      })}
      {q.map((x, i) => {
        const p = pt(i, 1.28);
        const ancre = Math.abs(p.x - cx) < 8 ? 'middle' : p.x > cx ? 'start' : 'end';
        const faible = x.note < 7;
        return (
          <G key={`l${x.cle}`}>
            <SvgText x={p.x} y={p.y - 2} textAnchor={ancre} fontSize={12} fontFamily={faible ? polices.texteGras : polices.texte} fill={faible ? couleurs.orange : couleurs.texte}>
              {x.libelle}
            </SvgText>
            <SvgText x={p.x} y={p.y + 13} textAnchor={ancre} fontSize={12} fontFamily={polices.chiffres} fill={faible ? couleurs.orange : couleurs.texteDoux}>
              {`${virgule(x.note)}/10`}
            </SvgText>
          </G>
        );
      })}
    </Svg>
  );
}

// ---------- Droite / gauche ----------

function DroiteGauche({ bilan }: { bilan: BilanPostural | undefined }) {
  const a = asymetries(bilan);
  if (!a.length) return null;
  const max = Math.max(12, ...a.flatMap((x) => [Math.abs(x.droite), Math.abs(x.gauche)]));
  const phrase = compensation(bilan);
  const barre = (v: number, niveau: Niveau, cote: 'D' | 'G') => (
    <View style={{ flex: 1, flexDirection: 'row', justifyContent: cote === 'D' ? 'flex-end' : 'flex-start' }}>
      <View
        style={{
          width: `${Math.max(4, (Math.abs(v) / max) * 100)}%`,
          height: 12,
          backgroundColor: COULEUR_NIVEAU[niveau].plein,
          borderTopLeftRadius: cote === 'D' ? 6 : 0,
          borderBottomLeftRadius: cote === 'D' ? 6 : 0,
          borderTopRightRadius: cote === 'G' ? 6 : 0,
          borderBottomRightRadius: cote === 'G' ? 6 : 0,
        }}
      />
    </View>
  );
  return (
    <View style={[styles.carte, { gap: espace(3) }]}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <Text style={styles.gras}>Droite / gauche</Text>
        <Text style={styles.aide}>en degrés</Text>
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text style={styles.aide}>◀ Droite</Text>
        <Text style={styles.aide}>Gauche ▶</Text>
      </View>
      {a.map((x) => (
        <View key={x.titre} style={{ gap: 4 }}>
          <Text style={[styles.texte, { textAlign: 'center' }]}>{x.titre}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            {barre(x.droite, x.niveauDroite, 'D')}
            <View style={{ width: 2, height: 20, backgroundColor: couleurs.texte }} />
            {barre(x.gauche, x.niveauGauche, 'G')}
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={[styles.chiffres, x.coteFaible === 'D' && { color: couleurs.rougeTexte }]}>{degres(x.droite)}</Text>
            {x.net && <Text style={[styles.chiffres, { color: couleurs.rougeTexte }]}>{`écart ${degres(x.ecart)}`}</Text>}
            <Text style={[styles.chiffres, x.coteFaible === 'G' && { color: couleurs.rougeTexte }]}>{degres(x.gauche)}</Text>
          </View>
        </View>
      ))}
      {!!phrase && <Text style={styles.encadreOrange}>{phrase}</Text>}
    </View>
  );
}

// ---------- Une mesure : jauge et explication ----------

function Jauge({ c }: { c: Constat }) {
  const [n0, n1] = c.norme;
  const marge = Math.max(5, (n1 - n0) / 2);
  const lo = Math.min(n0 - marge, c.valeur - 2);
  const hi = Math.max(n1 + marge, c.valeur + 2);
  const pos = (v: number) => `${((v - lo) / (hi - lo)) * 100}%` as const;
  return (
    <View style={{ gap: 2 }}>
      <View style={styles.jauge}>
        <View style={[styles.jaugeNorme, { left: pos(n0), width: `${((n1 - n0) / (hi - lo)) * 100}%` }]} />
        <View style={[styles.jaugeRepere, { left: pos(c.valeur), backgroundColor: COULEUR_NIVEAU[c.niveau].plein }]} />
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text style={styles.tuileAide}>{degres(Math.round(lo))}</Text>
        <Text style={[styles.tuileAide, { color: couleurs.vert }]}>{`norme ${degres(n0)} à ${degres(n1)}`}</Text>
        <Text style={styles.tuileAide}>{degres(Math.round(hi))}</Text>
      </View>
    </View>
  );
}

function CarteMesure({
  c,
  avant,
  dateAvant,
  exercices,
  onRevoir,
}: {
  c: Constat;
  avant?: Constat;
  dateAvant?: string;
  exercices: string[];
  onRevoir?: () => void;
}) {
  const [ouvert, setOuvert] = useState(false);
  const couleur = COULEUR_NIVEAU[c.niveau];
  const ex = explication(c);
  const muscles = musclesConstat(c);
  const cote = coteDe(c.id);
  return (
    <View style={[styles.carte, { gap: espace(2), borderLeftWidth: 0 }]}>
      <Pressable accessibilityRole="button" {...etatA11y({ expanded: ouvert })} onPress={() => setOuvert(!ouvert)} style={{ gap: espace(2) }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: espace(2), alignItems: 'flex-start' }}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={styles.gras}>{c.titre}</Text>
            <Text style={styles.doux}>{c.texte}</Text>
          </View>
          <View style={{ alignItems: 'flex-end', gap: 2 }}>
            <Text style={[styles.valeur, { color: couleur.texte }]}>{degres(c.valeur)}</Text>
            <Text style={[styles.badge, { backgroundColor: couleur.fond, color: couleur.texte }]}>{couleur.libelle}</Text>
          </View>
        </View>
        <Jauge c={c} />
        {avant && (
          <Text style={styles.aide}>{`Avant${dateAvant ? ` (${dateAvant})` : ''} : ${degres(avant.valeur)} · écart ${c.valeur - avant.valeur > 0 ? '+' : ''}${degres(Math.round((c.valeur - avant.valeur) * 10) / 10)}`}</Text>
        )}
        <Text style={[styles.aide, { color: couleurs.rouge }]}>{ouvert ? 'Masquer le détail ▲' : 'Comprendre cette mesure ▼'}</Text>
      </Pressable>
      {ouvert && (
        <View style={{ gap: espace(3), paddingTop: espace(1) }}>
          {ex && (
            <View style={{ gap: 2 }}>
              <Text style={styles.surtitre}>Ce que mesure cet angle</Text>
              <Text style={styles.texte}>{ex.mesure}</Text>
            </View>
          )}
          {ex && (
            <View style={{ gap: 2 }}>
              <Text style={styles.surtitre}>{c.niveau === 'normal' ? 'Si la valeur sort de la norme' : 'Ce que ça veut dire'}</Text>
              <Text style={styles.texte}>{ex.sens}</Text>
            </View>
          )}
          {muscles.length > 0 && (
            <View style={{ gap: 6 }}>
              <Text style={styles.surtitre}>Muscles en jeu (hypothèses)</Text>
              <View style={styles.puces}>
                {muscles.map((m) => {
                  const col = COULEUR_MUSCLE[m.etat];
                  const nom = `${ZONES[m.zone].libelle}${m.cote ? ` ${m.cote === 'D' ? 'droit' : 'gauche'}` : ''}`;
                  return <Text key={`${m.zone}${m.etat}`} style={[styles.puce, { backgroundColor: col.fond, color: col.texte }]}>{`${m.etat === 'faible' ? 'Faible' : 'Raide'} · ${nom}`}</Text>;
                })}
              </View>
            </View>
          )}
          {!!ex?.confirmer.length && c.niveau !== 'normal' && (
            <View style={{ gap: 2 }}>
              <Text style={styles.surtitre}>Pour confirmer en séance</Text>
              {ex.confirmer.map((t) => (
                <Text key={t} style={styles.texte}>{`• ${t}`}</Text>
              ))}
            </View>
          )}
          {exercices.length > 0 && (
            <View style={{ gap: 2 }}>
              <Text style={styles.surtitre}>{`Exercices conseillés${cote ? ` (côté ${cote === 'D' ? 'droit' : 'gauche'} en premier)` : ''}`}</Text>
              {exercices.map((t) => (
                <Text key={t} style={styles.texte}>{`• ${t}`}</Text>
              ))}
            </View>
          )}
          {onRevoir && <Bouton variante="discret" libelle="Revoir sur la vidéo" onPress={onRevoir} />}
        </View>
      )}
    </View>
  );
}

// ---------- Carte des muscles ----------

type Forme = [number, number, number, number];
const FORMES: Record<ZoneMuscle, { gauche?: Forme; droite?: Forme; centre?: Forme }> = {
  pectoraux: { gauche: [64, 80, 15, 11], droite: [96, 80, 15, 11] },
  abdominaux: { centre: [80, 122, 13, 24] },
  flechisseursHanche: { gauche: [66, 156, 7, 8], droite: [94, 156, 7, 8] },
  quadriceps: { gauche: [61, 205, 9, 30], droite: [99, 205, 9, 30] },
  adducteurs: { gauche: [74, 196, 4.5, 22], droite: [86, 196, 4.5, 22] },
  voutePlantaire: { gauche: [65, 306, 9, 4], droite: [95, 306, 9, 4] },
  nuque: { gauche: [70, 58, 8, 5], droite: [90, 58, 8, 5] },
  hautDuDos: { gauche: [68, 86, 10, 13], droite: [92, 86, 10, 13] },
  grandDorsal: { gauche: [56, 118, 7, 18], droite: [104, 118, 7, 18] },
  lombaires: { gauche: [73, 142, 5, 11], droite: [87, 142, 5, 11] },
  moyenFessier: { gauche: [57, 160, 10, 7], droite: [103, 160, 10, 7] },
  grandFessier: { gauche: [67, 178, 12, 11], droite: [93, 178, 12, 11] },
  ischios: { gauche: [64, 218, 9, 24], droite: [96, 218, 9, 24] },
  mollets: { gauche: [63, 264, 7, 20], droite: [97, 264, 7, 20] },
};

function Silhouette({ vue, muscles, largeur }: { vue: 'face' | 'dos'; muscles: HypotheseMuscle[]; largeur: number }) {
  const h = largeur * (330 / 160);
  const ordre: Record<EtatMuscle, number> = { fort: 0, raide: 1, faible: 2 };
  const formes: { cle: string; f: Forme; etat: EtatMuscle }[] = [];
  for (const m of [...muscles].filter((x) => ZONES[x.zone].vue === vue).sort((a, b) => ordre[a.etat] - ordre[b.etat])) {
    const fo = FORMES[m.zone];
    if (fo.centre) formes.push({ cle: `${m.zone}c`, f: fo.centre, etat: m.etat });
    // De face, le côté droit du client est à gauche de l'image ; de dos, c'est l'inverse.
    const aGauche = vue === 'face' ? 'D' : 'G';
    if (fo.gauche && (!m.cote || m.cote === aGauche)) formes.push({ cle: `${m.zone}g`, f: fo.gauche, etat: m.etat });
    if (fo.droite && (!m.cote || m.cote !== aGauche)) formes.push({ cle: `${m.zone}d`, f: fo.droite, etat: m.etat });
  }
  return (
    <Svg width={largeur} height={h} viewBox="0 0 160 330" accessibilityLabel={`Vue ${vue === 'face' ? 'de face' : 'de dos'} des muscles`}>
      <G fill={couleurs.discret}>
        <Circle cx={80} cy={28} r={20} />
        <Rect x={72} y={46} width={16} height={12} />
        <Path d="M44 60 Q80 52 116 60 L112 160 Q80 170 48 160 Z" />
        <Path d="M44 62 L28 70 L18 150 L30 152 L40 96 Z" />
        <Path d="M116 62 L132 70 L142 150 L130 152 L120 96 Z" />
        <Path d="M48 158 L79 166 L76 310 L56 310 L50 230 Z" />
        <Path d="M112 158 L81 166 L84 310 L104 310 L110 230 Z" />
      </G>
      {formes.map(({ cle, f, etat }) => (
        <Ellipse key={cle} cx={f[0]} cy={f[1]} rx={f[2]} ry={f[3]} fill={COULEUR_MUSCLE[etat].plein} opacity={0.9} />
      ))}
      <SvgText x={4} y={326} fontSize={10} fontFamily={polices.texte} fill={couleurs.texteDoux}>
        {vue === 'face' ? 'droite' : 'gauche'}
      </SvgText>
      <SvgText x={156} y={326} fontSize={10} textAnchor="end" fontFamily={polices.texte} fill={couleurs.texteDoux}>
        {vue === 'face' ? 'gauche' : 'droite'}
      </SvgText>
    </Svg>
  );
}

function CarteDesMuscles({ muscles, largeur }: { muscles: HypotheseMuscle[]; largeur: number }) {
  const l = Math.min(180, Math.max(120, (largeur - 2 * 16 - 8) / 2));
  return (
    <View style={{ gap: espace(2) }}>
      <Text style={styles.titreSection}>Carte des muscles</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: espace(3) }}>
        {(['faible', 'raide', 'fort'] as EtatMuscle[]).map((e) => (
          <View key={e} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: COULEUR_MUSCLE[e].plein }} />
            <Text style={styles.doux}>{COULEUR_MUSCLE[e].libelle}</Text>
          </View>
        ))}
      </View>
      <View style={[styles.carte, { flexDirection: 'row', justifyContent: 'space-around', flexWrap: 'wrap' }]}>
        <View style={{ alignItems: 'center', gap: 4 }}>
          <Silhouette vue="face" muscles={muscles} largeur={l} />
          <Text style={styles.aide}>De face</Text>
        </View>
        <View style={{ alignItems: 'center', gap: 4 }}>
          <Silhouette vue="dos" muscles={muscles} largeur={l} />
          <Text style={styles.aide}>De dos</Text>
        </View>
      </View>
      {(['faible', 'raide', 'fort'] as EtatMuscle[]).map((e) => {
        const liste = muscles.filter((m) => m.etat === e);
        if (!liste.length) return null;
        const col = COULEUR_MUSCLE[e];
        return (
          <View key={e} style={[styles.carte, { gap: espace(2) }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: espace(2) }}>
              <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: col.plein }} />
              <Text style={styles.gras}>{e === 'faible' ? 'Probablement faibles' : e === 'raide' ? 'Probablement raides' : 'Points forts'}</Text>
            </View>
            {liste.map((m) => (
              <View key={`${m.zone}-${m.cote ?? ''}`} style={{ gap: 1 }}>
                <Text style={[styles.texte, { fontFamily: polices.texteMoyen }]}>
                  {m.libelle}
                  {e !== 'fort' && m.indices.length > 1 && <Text style={{ color: col.texte }}>{`  · ${m.indices.length} indices`}</Text>}
                </Text>
                <Text style={styles.aide}>{m.indices.join(' · ')}</Text>
              </View>
            ))}
          </View>
        );
      })}
      <Text style={styles.aide}>Plus un muscle revient dans plusieurs tests, plus l’hypothèse est solide. Un seul indice : à vérifier en séance.</Text>
    </View>
  );
}

// ---------- Plan ----------

function Phase({ titre, sous, couleur, children }: { titre: string; sous: string; couleur: string; children: React.ReactNode }) {
  return (
    <View style={[styles.carte, { padding: 0, overflow: 'hidden' }]}>
      <View style={{ backgroundColor: couleur, paddingHorizontal: 14, paddingVertical: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <Text style={styles.phaseTitre}>{titre}</Text>
        <Text style={[styles.aide, { color: '#FFFFFF' }]}>{sous}</Text>
      </View>
      <View style={{ padding: 14, gap: espace(2) }}>{children}</View>
    </View>
  );
}

// ---------- Synthèse pour le client ----------

function SyntheseClientModale({ bilan, prenom, onFermer }: { bilan: BilanPostural | undefined; prenom?: string; onFermer: () => void }) {
  const s = syntheseClient(bilan);
  const plan = planTravail(bilan);
  const a = asymetries(bilan).find((x) => x.net && x.titre.includes('une jambe'));
  return (
    <Modale titre="Synthèse pour le client" onFermer={onFermer} pied={<Bouton libelle="Partager le texte…" onPress={() => void Share.share({ message: texteSyntheseClient(bilan, prenom) })} />}>
      <View style={{ gap: espace(4) }}>
        <View style={styles.bandeauSombre}>
          <Text style={[styles.surtitre, { color: '#FF8A8E' }]}>Ton bilan mouvement</Text>
          <Text style={styles.grandTitre}>{`${prenom ? `${prenom}, voici` : 'Voici'} ce que tes vidéos racontent`}</Text>
          {s.score !== undefined && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: espace(3) }}>
              <Anneau valeur={s.score} taille={84} fond={couleurs.secondaire} texte="#FFFFFF" />
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={[styles.gras, { color: '#FFFFFF' }]}>Score mouvement</Text>
                <Text style={styles.texteClair}>{s.phrase}</Text>
              </View>
            </View>
          )}
        </View>
        {s.forces.length > 0 && (
          <View style={{ gap: espace(2) }}>
            <Text style={styles.titreSection}>Tes points forts</Text>
            {s.forces.map((x) => (
              <View key={x} style={{ flexDirection: 'row', gap: espace(3), alignItems: 'center' }}>
                <View style={[styles.pastille, { backgroundColor: '#E8EEFD' }]}>
                  <Text style={[styles.pastilleTexte, { color: couleurs.bleu }]}>✓</Text>
                </View>
                <Text style={[styles.texte, { flex: 1 }]}>{x}</Text>
              </View>
            ))}
          </View>
        )}
        {s.axes.length > 0 && (
          <View style={{ gap: espace(2) }}>
            <Text style={styles.titreSection}>Ce qu’on va travailler</Text>
            {s.axes.map((x, i) => (
              <View key={x.titre} style={[styles.carteAxe, { backgroundColor: i === 0 ? couleurs.rougeClair : couleurs.orangeClair }]}>
                <Text style={styles.gras}>{x.titre}</Text>
                {i === 0 && a?.coteFaible && (
                  <View style={{ gap: 4 }}>
                    {(['D', 'G'] as const).map((c) => {
                      const v = c === 'D' ? a.droite : a.gauche;
                      const pire = Math.max(Math.abs(a.droite), Math.abs(a.gauche), 1);
                      return (
                        <View key={c} style={{ flexDirection: 'row', alignItems: 'center', gap: espace(2) }}>
                          <Text style={[styles.aide, { width: 48 }]}>{c === 'D' ? 'Droite' : 'Gauche'}</Text>
                          <View style={[styles.rail, { flex: 1, backgroundColor: '#FFFFFF' }]}>
                            <View style={[styles.railPlein, { width: `${Math.max(8, 100 - (Math.abs(v) / pire) * 60)}%`, backgroundColor: a.coteFaible === c ? couleurs.rouge : couleurs.bleu }]} />
                          </View>
                        </View>
                      );
                    })}
                    <Text style={styles.aide}>stabilité sur une jambe</Text>
                  </View>
                )}
                <Text style={styles.texte}>{x.texte}</Text>
              </View>
            ))}
            {!!s.compensation && <Text style={styles.doux}>{s.compensation}</Text>}
          </View>
        )}
        {plan && (
          <View style={{ gap: espace(2) }}>
            <Text style={styles.titreSection}>{`Ton plan sur ${plan.semaines} semaines`}</Text>
            {[
              ['Semaines 1 à 4 · Rééquilibrer', 'Corriger les points faibles et gagner en souplesse.', couleurs.rouge],
              [`Semaines 5 à ${plan.semaines - 1} · Renforcer`, 'Travail sur une jambe et charges progressives.', couleurs.secondaire],
              [`Semaine ${plan.semaines} · Re-test vidéo`, 'On refilme, on compare : tu vois tes progrès en chiffres.', couleurs.bleu],
            ].map(([t, d, c]) => (
              <View key={t} style={{ flexDirection: 'row', gap: espace(3) }}>
                <View style={{ width: 14, height: 14, marginTop: 3, borderRadius: 7, backgroundColor: c }} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={styles.gras}>{t}</Text>
                  <Text style={styles.doux}>{d}</Text>
                </View>
              </View>
            ))}
          </View>
        )}
        <View style={[styles.bandeauSombre, { gap: espace(2) }]}>
          <Text style={[styles.titreSection, { color: '#FFFFFF' }]}>Pourquoi un accompagnement</Text>
          {['Un programme construit sur tes mesures, pas un plan générique.', 'Chaque exercice corrigé en vidéo, dans l’appli.', 'Des progrès mesurés : mêmes tests, mêmes angles, avant et après.'].map((t) => (
            <Text key={t} style={styles.texteClair}>{`● ${t}`}</Text>
          ))}
        </View>
        <Text style={styles.aide}>Ces mesures sont des repères de coaching, pas un diagnostic médical. En cas de douleur, parles-en à un professionnel de santé.</Text>
      </View>
    </Modale>
  );
}

const styles = StyleSheet.create({
  titreSection,
  carte: { backgroundColor: couleurs.carte, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: couleurs.bordure },
  carteAxe: { borderRadius: 14, padding: 14, gap: espace(2) },
  gras: { fontFamily: polices.texteGras, fontSize: 14, color: couleurs.texte },
  texte: { fontFamily: polices.texte, fontSize: 13, lineHeight: 19, color: couleurs.texte },
  texteClair: { fontFamily: polices.texte, fontSize: 13, lineHeight: 19, color: '#DFE2E7' },
  doux: { fontFamily: polices.texte, fontSize: 13, lineHeight: 18, color: couleurs.texteDoux },
  aide: { fontFamily: polices.texte, fontSize: 12, lineHeight: 17, color: couleurs.texteDoux },
  surtitre: { fontFamily: polices.texteGras, fontSize: 12, letterSpacing: 0.6, textTransform: 'uppercase', color: couleurs.texteDoux },
  chiffres: { fontFamily: polices.chiffres, fontSize: 12, color: couleurs.texte },
  chiffresDoux: { fontFamily: polices.texteMoyen, fontSize: 13, color: couleurs.rougeTexte },
  valeur: { fontFamily: polices.chiffres, fontSize: 20 },
  badge: { fontFamily: polices.texteMoyen, fontSize: 12, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2, overflow: 'hidden' },
  pastille: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  pastilleTexte: { fontFamily: polices.chiffres, fontSize: 14, color: '#FFFFFF' },
  rail: { height: 12, borderRadius: 6, backgroundColor: couleurs.discret, overflow: 'hidden' },
  railPlein: { height: 12, borderRadius: 6 },
  jauge: { height: 10, borderRadius: 5, backgroundColor: couleurs.discret, position: 'relative', marginVertical: 4 },
  jaugeNorme: { position: 'absolute', top: 0, height: 10, backgroundColor: '#BFE5CD', borderRadius: 5 },
  jaugeRepere: { position: 'absolute', top: -4, width: 6, height: 18, marginLeft: -3, borderRadius: 3, borderWidth: 1, borderColor: '#FFFFFF' },
  tuile: { flex: 1, backgroundColor: couleurs.fond, borderRadius: 12, padding: 10, alignItems: 'center', gap: 2 },
  tuileValeur: { fontFamily: polices.chiffres, fontSize: 18, color: couleurs.texte },
  tuileLibelle: { fontFamily: polices.texteMoyen, fontSize: 12, color: couleurs.texte },
  tuileAide: { fontFamily: polices.texte, fontSize: 12, color: couleurs.texteDoux, textAlign: 'center' },
  encadreSombre: { backgroundColor: couleurs.secondaire, borderRadius: 12, padding: 12, gap: 6 },
  encadreOrange: { fontFamily: polices.texte, fontSize: 13, lineHeight: 18, color: '#7A2A08', backgroundColor: couleurs.orangeClair, borderRadius: 10, padding: 10, overflow: 'hidden' },
  puces: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  puce: { fontFamily: polices.texte, fontSize: 12, borderRadius: 14, paddingHorizontal: 10, paddingVertical: 4, overflow: 'hidden' },
  frise: { flexDirection: 'row', gap: 3 },
  semaine: { flex: 1, height: 10, borderRadius: 5 },
  objectif: { backgroundColor: couleurs.fond, borderRadius: 10, padding: 8, gap: 2, minWidth: 130, flexGrow: 1 },
  phaseTitre: { fontFamily: polices.titre, fontSize: 20, letterSpacing: 0.7, color: '#FFFFFF' },
  bandeauSombre: { backgroundColor: couleurs.noir, borderRadius: 16, padding: 16, gap: espace(3) },
  grandTitre: { fontFamily: polices.titre, fontSize: 34, letterSpacing: 1.2, lineHeight: 34, color: '#FFFFFF' },
});
