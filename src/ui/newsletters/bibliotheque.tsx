// Mes newsletters › La bibliothèque : les articles complets, documentés et sourcés, rangés par catégorie. En tête, une
// mosaïque de catégories illustrées (toucher une catégorie la montre seule) ; puis, catégorie par catégorie, une rangée
// de couvertures qui défile. Toucher un article l'ouvre dans l'éditeur, prêt à adapter et à programmer.
import { useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { parCategorie, type Categorie, type CleCategorie } from '@/domain/categories-newsletters';
import type { Cible, Theme } from '@/domain/newsletters';

import { Puce, Puces } from '../composants';
import { couleurs, espace, polices } from '../theme';
import { imageIllustration } from './illustrations';

export type ArticleBibliotheque = Theme & { categorie?: string; /** Temps de lecture, en minutes. */ lecture?: number };

const ECART = 10;
const lecture = (a: ArticleBibliotheque) => a.lecture ?? Math.max(3, Math.round(a.message.length / 1300));
const pourQui = (c: Cible) => (c === 'clients' ? 'Clients actifs' : 'Clients en veille');

export function Bibliotheque({ articles, onOuvrir }: { articles: readonly ArticleBibliotheque[]; onOuvrir: (a: ArticleBibliotheque) => void }) {
  const [pour, setPour] = useState<Cible | null>(null);
  const [choisie, setChoisie] = useState<CleCategorie | null>(null);
  const { width } = useWindowDimensions();
  // Largeur réelle de la mosaïque, mesurée : les tuiles ont une taille en pixels (les pourcentages avec un rapport
  // largeur/hauteur laissaient un grand vide sur Android).
  const [dispo, setDispo] = useState(0);
  const visibles = pour ? articles.filter((a) => a.pour === pour) : articles;
  const groupes = parCategorie(visibles);
  const montres = choisie ? groupes.filter((g) => g.categorie.cle === choisie) : groupes;
  // Mosaïque : deux colonnes sur téléphone, trois au-delà.
  const colonnes = width >= 720 ? 3 : 2;

  return (
    <View style={{ gap: espace(4) }}>
      <View style={{ gap: 6 }}>
        <Text style={styles.surTitre}>La bibliothèque</Text>
        <Text style={styles.grandTitre}>{articles.length} articles prêts à envoyer</Text>
        <Text style={styles.detail}>Sport, alimentation, santé : environ 3 pages chacun, documentés et sourcés. Touche un article pour le relire, l’adapter et le programmer.</Text>
      </View>

      <Puces>
        <Puce libelle="Tous" actif={!pour} onPress={() => setPour(null)} />
        <Puce libelle="Clients actifs" actif={pour === 'clients'} onPress={() => setPour('clients')} />
        <Puce libelle="Clients en veille" actif={pour === 'veille'} onPress={() => setPour('veille')} />
      </Puces>

      <View style={styles.mosaique} onLayout={(e) => setDispo(Math.floor(e.nativeEvent.layout.width))}>
        {dispo > 0 && groupes.map((g, i) => (
          <TuileCategorie
            key={g.categorie.cle}
            c={g.categorie}
            nombre={g.articles.length}
            image={g.articles[0].illustration ?? g.articles[0].cle}
            largeur={i === 0 && groupes.length % colonnes !== 0 ? dispo : Math.floor((dispo - ECART * (colonnes - 1)) / colonnes)}
            large={i === 0 && groupes.length % colonnes !== 0}
            active={choisie === g.categorie.cle}
            estompee={!!choisie && choisie !== g.categorie.cle}
            onPress={() => setChoisie(choisie === g.categorie.cle ? null : g.categorie.cle)}
          />
        ))}
      </View>

      {montres.map((g) => (
        <View key={g.categorie.cle} style={{ gap: espace(3) }}>
          <View style={styles.enTete}>
            <View style={[styles.filet, { backgroundColor: g.categorie.couleur }]} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.nomCategorie}>{g.categorie.nom}</Text>
              <Text style={styles.detail}>{g.categorie.accroche}</Text>
            </View>
            <Text style={styles.compte}>{g.articles.length}</Text>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 14, paddingRight: espace(4) }} style={{ marginHorizontal: -2 }}>
            {g.articles.map((a) => (
              <CarteArticle key={a.cle} a={a} couleur={g.categorie.couleur} onPress={() => onOuvrir(a)} />
            ))}
          </ScrollView>
        </View>
      ))}
    </View>
  );
}

function TuileCategorie({
  c,
  nombre,
  image,
  largeur,
  large,
  active,
  estompee,
  onPress,
}: {
  c: Categorie;
  nombre: number;
  image: string;
  largeur: number;
  large: boolean;
  active: boolean;
  estompee: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={`Catégorie ${c.nom}, ${nombre} article${nombre > 1 ? 's' : ''}`}
      onPress={onPress}
      style={({ pressed }) => [styles.tuile, { width: largeur, height: Math.round(largeur / (large ? 2.4 : 1.45)), opacity: estompee ? 0.45 : pressed ? 0.85 : 1 }, active && { borderWidth: 3, borderColor: c.couleur }]}
    >
      <Image source={imageIllustration(image)} style={styles.plein} resizeMode="cover" />
      <View style={[StyleSheet.absoluteFill, styles.voile]} />
      <View style={styles.tuileTexte}>
        <View style={[styles.pastille, { backgroundColor: c.couleur }]} />
        <Text style={styles.tuileNom} numberOfLines={2}>
          {c.nom}
        </Text>
        <Text style={styles.tuileCompte}>
          {nombre} article{nombre > 1 ? 's' : ''}
        </Text>
      </View>
    </Pressable>
  );
}

function CarteArticle({ a, couleur, onPress }: { a: ArticleBibliotheque; couleur: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Article : ${a.objet.replace('{prenom}', '')}`}
      onPress={onPress}
      style={({ pressed }) => [styles.carte, pressed && { opacity: 0.85 }]}
    >
      <View style={styles.couverture}>
        <Image source={imageIllustration(a.illustration ?? a.cle)} style={styles.plein} resizeMode="cover" />
      </View>
      <View style={{ gap: 5, paddingTop: 10 }}>
        <Text style={[styles.rubrique, { color: couleur }]} numberOfLines={1}>
          {a.rubrique}
        </Text>
        <Text style={styles.titre} numberOfLines={3}>
          {a.objet.replace(/,?\s*\{prenom\}/g, '')}
        </Text>
        <Text style={styles.meta}>
          {lecture(a)} min de lecture · {pourQui(a.pour)}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // Sur le web, une image prend sa taille d'origine si on ne lui en donne pas : elle remplit son cadre.
  plein: { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' },
  surTitre: { fontFamily: polices.texteGras, fontSize: 12, letterSpacing: 1.2, textTransform: 'uppercase', color: couleurs.texteDoux, marginLeft: 4 },
  grandTitre: { fontFamily: polices.titre, fontSize: 32, lineHeight: 34, color: couleurs.texte, marginLeft: 4 },
  detail: { fontFamily: polices.texte, fontSize: 13, lineHeight: 18, color: couleurs.texteDoux },
  mosaique: { flexDirection: 'row', flexWrap: 'wrap', gap: ECART },
  tuile: { borderRadius: 16, overflow: 'hidden', backgroundColor: couleurs.discret },
  voile: { backgroundColor: 'rgba(12,13,16,0.32)', backgroundImage: 'linear-gradient(180deg, rgba(12,13,16,0) 30%, rgba(12,13,16,0.78) 100%)' },
  tuileTexte: { position: 'absolute', left: 12, right: 12, bottom: 10, gap: 2 },
  pastille: { width: 18, height: 3, borderRadius: 2, marginBottom: 4 },
  tuileNom: { fontFamily: polices.titre, fontSize: 24, lineHeight: 25, color: '#FFFFFF', letterSpacing: 0.4 },
  tuileCompte: { fontFamily: polices.texteMoyen, fontSize: 12, color: 'rgba(255,255,255,0.82)' },
  enTete: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: espace(2) },
  filet: { width: 4, alignSelf: 'stretch', borderRadius: 2 },
  nomCategorie: { fontFamily: polices.titre, fontSize: 26, lineHeight: 28, color: couleurs.texte, letterSpacing: 0.3 },
  compte: { fontFamily: polices.chiffres, fontSize: 13, color: couleurs.texteDoux },
  carte: { width: 232 },
  couverture: { width: '100%', aspectRatio: 1.5, borderRadius: 14, overflow: 'hidden', backgroundColor: couleurs.discret },
  rubrique: { fontFamily: polices.texteGras, fontSize: 10.5, letterSpacing: 1.4, textTransform: 'uppercase' },
  titre: { fontFamily: polices.texteGras, fontSize: 15, lineHeight: 20, color: couleurs.texte },
  meta: { fontFamily: polices.texte, fontSize: 12, color: couleurs.texteDoux },
});
