// Courbe d'évolution (mensuration, record) : points placés selon leur date, aire sous la courbe, toucher un point affiche sa valeur.
import { useId, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import Svg, { Circle, Defs, Line, LinearGradient, Path, Stop } from 'react-native-svg';

import { formaterNombre } from '@/domain/suivi';

import { couleurs, polices } from '../theme';

export type PointCourbe = { date: string; valeur: number };

const jour = (d: string) => new Date(`${d}T12:00:00`).getTime();
const dateCourte = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });

export function Courbe({ points, unite, libelle }: { points: PointCourbe[]; unite: string; libelle: string }) {
  const [largeur, setLargeur] = useState(0);
  const [choisi, setChoisi] = useState<number>();
  const degrade = `aire-${useId().replace(/:/g, '')}`;
  const hauteur = 140;
  const marge = { haut: 12, bas: 22, cote: 8 };
  const valeurs = points.map((p) => p.valeur);
  const min = Math.min(...valeurs);
  const max = Math.max(...valeurs);
  // Un peu d'air au-dessus et en dessous ; une courbe plate reste au milieu.
  const ecart = max - min || Math.max(1, max * 0.05);
  const bas = min - ecart * 0.2;
  const haut = max + ecart * 0.2;
  const t0 = jour(points[0].date);
  const t1 = jour(points[points.length - 1].date);
  const x = (d: string) => marge.cote + (t1 === t0 ? 0.5 : (jour(d) - t0) / (t1 - t0)) * (largeur - 2 * marge.cote);
  const y = (v: number) => marge.haut + (1 - (v - bas) / (haut - bas)) * (hauteur - marge.haut - marge.bas);
  const ligne = points.map((p, i) => `${i ? 'L' : 'M'}${x(p.date)},${y(p.valeur)}`).join(' ');
  const aire = `${ligne} L${x(points[points.length - 1].date)},${hauteur - marge.bas} L${x(points[0].date)},${hauteur - marge.bas} Z`;
  const affiche = points[choisi ?? points.length - 1];

  return (
    <View style={{ gap: 6 }}>
      <Text style={{ fontFamily: polices.texte, fontSize: 13, color: couleurs.texteDoux }} aria-live="polite">
        {dateCourte(affiche.date)} :{' '}
        <Text style={{ fontFamily: polices.texteGras, color: couleurs.texte }}>{`${formaterNombre(affiche.valeur)} ${unite}`}</Text>
      </Text>
      <View
        accessible
        accessibilityLabel={`${libelle} : de ${formaterNombre(points[0].valeur)} à ${formaterNombre(points[points.length - 1].valeur)} ${unite}, ${points.length} mesures`}
        onLayout={(e) => setLargeur(e.nativeEvent.layout.width)}
        style={{ height: hauteur }}
      >
        {largeur > 0 && (
          <Svg width={largeur} height={hauteur}>
            <Defs>
              <LinearGradient id={degrade} x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={couleurs.rouge} stopOpacity={0.22} />
                <Stop offset="1" stopColor={couleurs.rouge} stopOpacity={0} />
              </LinearGradient>
            </Defs>
            <Line x1={0} x2={largeur} y1={hauteur - marge.bas + 0.5} y2={hauteur - marge.bas + 0.5} stroke={couleurs.bordure} strokeWidth={1} />
            <Path d={aire} fill={`url(#${degrade})`} />
            <Path d={ligne} stroke={couleurs.rouge} strokeWidth={2.5} fill="none" strokeLinejoin="round" strokeLinecap="round" />
            {points.map((p, i) => (
              <Circle
                key={`${p.date}-${i}`}
                cx={x(p.date)}
                cy={y(p.valeur)}
                r={i === (choisi ?? points.length - 1) ? 5 : 3}
                fill={i === (choisi ?? points.length - 1) ? couleurs.rouge : couleurs.carte}
                stroke={couleurs.rouge}
                strokeWidth={2}
              />
            ))}
          </Svg>
        )}
        {/* Dates de début et de fin sous l'axe. */}
        <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text style={{ fontFamily: polices.texte, fontSize: 11, color: couleurs.texteDoux }}>{dateCourte(points[0].date)}</Text>
          <Text style={{ fontFamily: polices.texte, fontSize: 11, color: couleurs.texteDoux }}>{dateCourte(points[points.length - 1].date)}</Text>
        </View>
        {/* Zones à toucher : une bande verticale par point. */}
        {largeur > 0 &&
          points.map((p, i) => {
            const cx = x(p.date);
            const avant = i ? (cx + x(points[i - 1].date)) / 2 : 0;
            const apres = i < points.length - 1 ? (cx + x(points[i + 1].date)) / 2 : largeur;
            return (
              <Pressable
                key={`zone-${p.date}-${i}`}
                accessibilityLabel={`${dateCourte(p.date)} : ${formaterNombre(p.valeur)} ${unite}`}
                onPress={() => setChoisi(choisi === i ? undefined : i)}
                style={{ position: 'absolute', top: 0, bottom: marge.bas, left: avant, width: Math.max(1, apres - avant) }}
              />
            );
          })}
      </View>
    </View>
  );
}
