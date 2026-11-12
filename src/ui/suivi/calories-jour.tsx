// Calories du jour : ce que le client a dépensé (métabolisme de base, digestion, pas, séances du programme,
// activités ajoutées ou venues de la montre), comparé à ce qu'il a mangé (journal alimentaire) et à son objectif.
// Le même écran sert au client (Suivi) et au coach (fiche › Suivi), en lecture seule.
import { ChevronLeft, ChevronRight, Flame } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { activites } from '@/data/activites';
import { entrainement } from '@/data/entrainement';
import { nutrition } from '@/data/nutrition';
import { quotidien } from '@/data/quotidien';
import type { Activite } from '@/domain/activites';
import { bilanCalories, texteBalance } from '@/domain/bilan-calories';
import { ajouterJours, aujourdhuiParis, jourParis, titreClient } from '@/domain/entrainement';
import { foodTotal } from '@/domain/nutrition/personnel';
import { useCharger } from '@/lib/useCharger';

import { ts } from '../entrainement/commun';
import { couleurs, polices } from '../theme';

const JOURS_EN_ARRIERE = 30;
const kcal = (n: number) => `${new Intl.NumberFormat('fr-FR').format(Math.round(n))} kcal`;
const jourLisible = (jour: string, aujourdhui: string) =>
  jour === aujourdhui
    ? 'Aujourd’hui'
    : jour === ajouterJours(aujourdhui, -1)
      ? 'Hier'
      : new Date(`${jour}T12:00:00Z`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });

/** Ce qui ne change pas d'un jour à l'autre : profil nutrition, séances faites, activités. */
async function chargerBase(clientId: string) {
  const [profil, resultats, liste] = await Promise.all([
    nutrition.profil(clientId).catch(() => null),
    entrainement.resultats(clientId).catch(() => null),
    activites.liste(clientId, 200).catch(() => [] as Activite[]),
  ]);
  return { profil, realisations: resultats?.realisations ?? [], activites: liste };
}

/** Ce qui se lit jour par jour : le journal alimentaire et les pas. */
async function chargerJour(clientId: string, jour: string) {
  const [journal, releves] = await Promise.all([
    nutrition.personnel(clientId, 'diary', jour).catch(() => null),
    quotidien.releves(clientId, jour).catch(() => []),
  ]);
  const pas = Math.max(0, ...releves.filter((r) => r.jour === jour && r.indicateur === 'pas').map((r) => r.valeur));
  return { mange: journal?.entries.length ? foodTotal(journal.entries).kcal : undefined, pas };
}

export function CaloriesDuJour({ clientId, coach }: { clientId: string; coach?: boolean }) {
  const aujourdhui = aujourdhuiParis();
  const [jour, setJour] = useState(aujourdhui);
  const base = useCharger(() => chargerBase(clientId), `calories-base-${clientId}`);
  const duJour = useCharger(() => chargerJour(clientId, jour), `calories-jour-${clientId}-${jour}`);
  const tu = !coach;

  if (base.erreur) return <Text style={ts.erreur}>{base.erreur}</Text>;
  if (!base.donnee || !duJour.donnee) return <Text style={ts.doux}>Chargement…</Text>;

  const { profil, realisations } = base.donnee;
  const cible = profil?.objectifCoach ?? profil?.calcul.cible;
  const b = bilanCalories({
    metabolisme: profil?.calcul.repos,
    poidsKg: profil?.preferences.poids,
    pas: duJour.donnee.pas,
    seances: realisations
      .filter((r) => jourParis(r.fin || r.debut) === jour)
      .map((r) => ({ titre: titreClient(r.seanceTitre || 'Séance du programme'), debut: r.debut, fin: r.fin })),
    activites: base.donnee.activites.filter((a) => jourParis(a.debut) === jour),
    mange: duJour.donnee.mange,
    objectif: cible?.calories,
  });

  const premier = ajouterJours(aujourdhui, -JOURS_EN_ARRIERE);
  return (
    <View style={{ gap: 12 }}>
      <View style={[ts.carte, { gap: 12 }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <Fleche sens="avant" desactive={jour <= premier} onPress={() => setJour(ajouterJours(jour, -1))} />
          <View style={{ alignItems: 'center', flexShrink: 1 }}>
            <Text style={ts.kicker}>Calories</Text>
            <Text style={[ts.titre, { textAlign: 'center' }]}>{jourLisible(jour, aujourdhui)}</Text>
          </View>
          <Fleche sens="apres" desactive={jour >= aujourdhui} onPress={() => setJour(ajouterJours(jour, 1))} />
        </View>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          <Chiffre libelle="Dépensé" valeur={b.depense !== undefined ? kcal(b.depense) : '—'} detail={`dont ${kcal(b.mouvement)} en bougeant`} accent />
          <Chiffre libelle="Mangé" valeur={b.mange !== undefined ? kcal(b.mange) : '—'} detail={b.mange !== undefined ? 'journal alimentaire' : 'rien de noté'} />
          <Chiffre libelle="Objectif" valeur={b.objectif !== undefined ? kcal(b.objectif) : '—'} detail={profil?.objectifCoach ? 'fixé par le coach' : b.objectif ? 'calcul automatique' : 'pas encore fixé'} />
        </View>

        {b.balance !== undefined && (
          <View style={{ backgroundColor: b.balance < -50 ? couleurs.vertClair : b.balance > 50 ? couleurs.rougeClair : couleurs.fond, borderRadius: 10, padding: 12, gap: 2 }}>
            <Text style={{ fontFamily: polices.texteGras, fontSize: 16, color: couleurs.texte }}>{texteBalance(b.balance)}</Text>
            <Text style={ts.doux}>
              {tu ? 'Tu as mangé' : 'Mangé'} {kcal(b.mange!)} pour {kcal(b.depense!)} dépensées.
            </Text>
          </View>
        )}
        {b.objectif !== undefined && b.mange !== undefined && (
          <Text style={ts.texte}>
            {b.mange <= b.objectif
              ? `Encore ${kcal(b.objectif - b.mange)} avant l’objectif du jour.`
              : `${kcal(b.mange - b.objectif)} au-dessus de l’objectif du jour.`}
          </Text>
        )}
        {b.objectif !== undefined && b.depense !== undefined && (
          <Text style={ts.doux}>
            {b.objectif < b.depense
              ? `L’objectif est fixé ${kcal(b.depense - b.objectif)} sous la dépense du jour.`
              : b.objectif > b.depense
                ? `L’objectif est fixé ${kcal(b.objectif - b.depense)} au-dessus de la dépense du jour.`
                : 'L’objectif correspond à la dépense du jour.'}
          </Text>
        )}
        {b.metabolisme === undefined && (
          <Text style={ts.doux}>
            {tu
              ? 'Complète ton profil nutrition (sexe, âge, poids, taille, activité) pour connaître ton métabolisme de base et ta dépense totale.'
              : 'Le profil nutrition du client est incomplet : sans métabolisme de base, seule la dépense en bougeant est calculée.'}
          </Text>
        )}
      </View>

      <View style={[ts.carte, { gap: 4 }]}>
        <Text style={ts.titreSection}>Détail de la dépense</Text>
        {b.lignes.length === 0 ? (
          <Text style={ts.doux}>Rien à compter pour ce jour.</Text>
        ) : (
          b.lignes.map((l, i) => (
            <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 8, borderTopWidth: i ? 1 : 0, borderTopColor: couleurs.bordure }}>
              <View style={{ flexShrink: 1 }}>
                <Text style={[ts.texte, { fontFamily: polices.texteMoyen }]}>{l.libelle}</Text>
                {l.detail && <Text style={ts.doux}>{l.detail}</Text>}
              </View>
              <Text style={[ts.texte, { fontFamily: polices.texteGras }]}>{kcal(l.kcal)}</Text>
            </View>
          ))
        )}
        <Text style={[ts.doux, { marginTop: 8, fontSize: 12 }]}>
          Estimations : métabolisme de Mifflin-St Jeor, pas et séances selon le poids, kcal de la montre quand elle les donne. Une idée de la journée, pas une mesure.
        </Text>
      </View>
    </View>
  );
}

function Fleche({ sens, desactive, onPress }: { sens: 'avant' | 'apres'; desactive: boolean; onPress: () => void }) {
  const Icone = sens === 'avant' ? ChevronLeft : ChevronRight;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={sens === 'avant' ? 'Jour précédent' : 'Jour suivant'}
      accessibilityState={{ disabled: desactive }}
      disabled={desactive}
      onPress={onPress}
      hitSlop={8}
      style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', opacity: desactive ? 0.3 : 1 }}
    >
      <Icone size={24} color={couleurs.rouge} />
    </Pressable>
  );
}

function Chiffre({ libelle, valeur, detail, accent }: { libelle: string; valeur: string; detail?: string; accent?: boolean }) {
  return (
    <View style={{ flexGrow: 1, flexBasis: 100, backgroundColor: accent ? 'rgba(195,24,30,0.06)' : couleurs.fond, borderRadius: 10, padding: 12, gap: 2 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        {accent && <Flame size={14} color={couleurs.rouge} />}
        <Text style={ts.doux}>{libelle}</Text>
      </View>
      <Text style={{ fontFamily: polices.texteGras, fontSize: 18, color: couleurs.texte }}>{valeur}</Text>
      {detail && <Text style={[ts.doux, { fontSize: 12 }]}>{detail}</Text>}
    </View>
  );
}
