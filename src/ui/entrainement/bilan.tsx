// Bilan.tsx et BilanComparaison.tsx d'origine (C15 « Séances réalisées ») : résultats d'un client en lecture seule,
// filtres (profil, cycle, séance, exercice), cycles liés, comparaison brute des deux derniers résultats d'une même
// ligne dans un même cycle, puis les dernières séances. Les séries cardio et statiques s'écrivent avec leurs unités.
import { AlertTriangle, ExternalLink, RotateCw } from 'lucide-react-native';
import { useMemo, useState, type ReactNode } from 'react';
import { ScrollView, Text, View, useWindowDimensions } from 'react-native';

import { entrainement } from '@/data/entrainement';
import { texteSerie, type RealisationLue, type SuiviClient } from '@/domain/entrainement-etat';
import type { SerieRealisee } from '@/domain/types';
import { useCharger } from '@/lib/useCharger';

import { TitreDisplay } from '../coque';
import { Badge, Choix, Recherche } from '../crm/dossier';
import { couleurs, polices } from '../theme';
import { Action, Ligne, ts } from './commun';

export const dateParis = (iso: string) =>
  !iso ? 'Date inconnue' : new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));

const SANS_CYCLE = 'sans-cycle';

interface Exercice {
  ligneId: string;
  nom: string;
  prescription?: { series: number; repetitions?: string };
  series: SerieRealisee[];
}
interface SeanceBilan {
  r: RealisationLue;
  cycleKey: string;
  exercices: Exercice[];
}

const serie = (s?: SerieRealisee) => (!s ? '—' : texteSerie(s.valeurs) || '—');

function lire(realisations: RealisationLue[], prescriptions: Record<string, { series: number; repetitions?: string }>): SeanceBilan[] {
  return realisations.map((r) => {
    const parLigne = new Map<string, SerieRealisee[]>();
    for (const s of [...r.series].sort((a, b) => a.index - b.index)) parLigne.set(s.ligneId, [...(parLigne.get(s.ligneId) ?? []), s]);
    return {
      r,
      cycleKey: r.cycleId ?? SANS_CYCLE,
      exercices: [...parLigne].map(([ligneId, series]) => ({ ligneId, nom: r.noms[ligneId] ?? 'Exercice', prescription: prescriptions[ligneId], series })),
    };
  });
}

export function SeancesRealisees({
  coachId,
  onOuvrirProgramme,
  onOuvrirSuivis,
  clientFixe,
}: {
  coachId: string;
  onOuvrirProgramme: (id: string) => void;
  onOuvrirSuivis: () => void;
  /** Dans la fiche : les résultats de ce client seulement, sans titre ni choix du profil. */
  clientFixe?: string;
}) {
  const profils = useCharger(() => entrainement.suivis(coachId), `bilan-profils-${coachId}`);
  const [clientChoisi, setClientId] = useState<string>();
  const clientId = clientFixe ?? clientChoisi;
  const [cycle, setCycle] = useState('');
  const [seance, setSeance] = useState('');
  const [q, setQ] = useState('');
  const profil: SuiviClient | undefined = profils.donnee?.find((p) => p.clientId === clientId) ?? profils.donnee?.[0];
  const resultats = useCharger(
    async () => {
      if (!profil) return null;
      const d = await entrainement.resultats(profil.clientId);
      return { clientId: profil.clientId, seances: lire(d.realisations, d.prescriptions) };
    },
    `bilan-${profil?.clientId ?? ''}`,
  );
  // Tant que les résultats du profil choisi ne sont pas arrivés, on n'affiche pas ceux du précédent.
  const donnee = resultats.donnee && resultats.donnee.clientId === profil?.clientId ? resultats.donnee.seances : null;
  const erreur = resultats.erreur ?? '';

  const optionsSeances = useMemo(() => {
    const m = new Map<string, string>();
    (donnee ?? []).forEach((s) => m.set(s.r.seanceId, s.r.seanceTitre || 'Séance sans nom'));
    return [...m];
  }, [donnee]);
  const optionsCycles = useMemo(() => {
    const m = new Map<string, string>();
    (profil?.cycles ?? []).forEach((c) => m.set(c.id, c.nom));
    (donnee ?? []).forEach((s) => !m.has(s.cycleKey) && m.set(s.cycleKey, s.r.cycleNom || 'Cycle ?'));
    return [...m];
  }, [donnee, profil]);
  const filtrees = useMemo(
    () =>
      (donnee ?? [])
        .filter((s) => (!cycle || s.cycleKey === cycle) && (!seance || s.r.seanceId === seance))
        .map((s) => ({ ...s, exercices: q ? s.exercices.filter((e) => e.nom.toLowerCase().includes(q.toLowerCase())) : s.exercices }))
        .filter((s) => !q || s.exercices.length > 0),
    [donnee, cycle, seance, q],
  );

  const err = erreur || profils.erreur;
  if (err)
    return (
      <View style={{ borderWidth: 1, borderColor: 'rgba(195,24,30,0.4)', backgroundColor: 'rgba(195,24,30,0.05)', borderRadius: 12, padding: 16, gap: 4 }}>
        <Ligne style={{ gap: 8 }}>
          <AlertTriangle size={16} color={couleurs.rouge} />
          <Text style={[ts.texte, { color: couleurs.rouge, fontFamily: polices.texteMoyen }]}>Impossible de charger le bilan</Text>
        </Ligne>
        <Text style={[ts.texte, { color: couleurs.texteDoux }]}>{err}</Text>
        <View style={{ alignSelf: 'flex-start', marginTop: 8 }}>
          <Action
            petit
            variante="contour"
            icone={RotateCw}
            libelle="Réessayer"
            onPress={() => {
              profils.recharger();
              resultats.recharger();
            }}
          />
        </View>
      </View>
    );

  const filtre = (enfant: ReactNode) => <View style={{ flexBasis: 200, flexGrow: 1, minWidth: 0 }}>{enfant}</View>;
  return (
    <View style={{ gap: 16 }}>
      {!clientFixe && (
        <View>
          <TitreDisplay taille={26}>Bilan</TitreDisplay>
          <Text style={[ts.doux, { fontSize: 14 }]}>Lecture seule des résultats saisis par vos clients. Dates en heure de Paris.</Text>
        </View>
      )}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {!clientFixe &&
          filtre(
            <Choix
              libelle="Profil"
              sansLibelle
              vide={null}
              choix={(profils.donnee ?? []).map((p) => p.nom)}
              valeur={profil?.nom}
              onChange={(n) => {
                setCycle('');
                setSeance('');
                setQ('');
                setClientId(profils.donnee?.find((p) => p.nom === n)?.clientId);
              }}
            />,
          )}
        {filtre(
          <Choix
            libelle="Cycle"
            sansLibelle
            vide="Tous les cycles"
            choix={optionsCycles.map(([, n]) => n)}
            valeur={optionsCycles.find(([k]) => k === cycle)?.[1]}
            onChange={(n) => setCycle(optionsCycles.find(([, x]) => x === n)?.[0] ?? '')}
          />,
        )}
        {filtre(
          <Choix
            libelle="Séance"
            sansLibelle
            vide="Toutes les séances"
            choix={optionsSeances.map(([, n]) => n)}
            valeur={optionsSeances.find(([k]) => k === seance)?.[1]}
            onChange={(n) => setSeance(optionsSeances.find(([, x]) => x === n)?.[0] ?? '')}
          />,
        )}
        {filtre(
          <View style={{ flexDirection: 'row' }}>
            <Recherche valeur={q} onChange={setQ} libelle="Rechercher un exercice" placeholder="Rechercher un exercice" />
          </View>,
        )}
      </View>

      {!donnee || !profil ? (
        profils.donnee?.length === 0 ? (
          <Text style={[ts.doux, { fontSize: 14 }]}>Aucun client actif.</Text>
        ) : (
          <View style={{ height: 192, borderRadius: 12, backgroundColor: couleurs.discret }} />
        )
      ) : (
        <>
          <CyclesLiens profil={profil} onOuvrirProgramme={onOuvrirProgramme} onOuvrirSuivis={onOuvrirSuivis} />
          <Comparaison seances={filtrees} />
          <View style={{ gap: 12 }}>
            <Text style={ts.titre}>Dernières séances ({filtrees.length})</Text>
            {filtrees.length === 0 && (
              <Text
                style={[
                  ts.texte,
                  {
                    borderWidth: 1,
                    borderStyle: 'dashed',
                    borderColor: couleurs.bordure,
                    borderRadius: 12,
                    padding: 24,
                    textAlign: 'center',
                    color: couleurs.texteDoux,
                  },
                ]}
              >
                {donnee.length ? 'Aucune séance ne correspond aux filtres.' : 'Aucun résultat enregistré pour ce profil.'}
              </Text>
            )}
            {filtrees.map((s) => (
              <CarteSeance key={s.r.id} s={s} onOuvrirProgramme={onOuvrirProgramme} />
            ))}
          </View>
        </>
      )}
    </View>
  );
}

function CyclesLiens({
  profil,
  onOuvrirProgramme,
  onOuvrirSuivis,
}: {
  profil: SuiviClient;
  onOuvrirProgramme: (id: string) => void;
  onOuvrirSuivis: () => void;
}) {
  if (!profil.cycles.length)
    return (
      <Text style={[ts.texte, ts.carte, { padding: 12, color: couleurs.texteDoux }]}>
        Ce profil n’a aucun cycle.{' '}
        <Text
          accessibilityRole="button"
          onPress={onOuvrirSuivis}
          style={{ color: couleurs.rouge, fontFamily: polices.texteMoyen, textDecorationLine: 'underline' }}
        >
          Ouvrir les suivis
        </Text>
      </Text>
    );
  return (
    <Ligne>
      {profil.cycles.map((c) => (
        <View
          key={c.id}
          style={{
            flexDirection: 'row',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: 8,
            maxWidth: '100%',
            borderWidth: 1,
            borderColor: couleurs.bordure,
            borderRadius: 10,
            backgroundColor: couleurs.carte,
            paddingHorizontal: 12,
            paddingVertical: 8,
          }}
        >
          <Text
            accessibilityRole="button"
            onPress={onOuvrirSuivis}
            numberOfLines={1}
            style={[ts.texte, { color: couleurs.rouge, fontFamily: polices.texteMoyen }]}
          >
            {c.nom}
          </Text>
          <Badge libelle={c.statut} variante="secondaire" />
          {c.programmeId && (
            <Text accessibilityRole="button" onPress={() => onOuvrirProgramme(c.programmeId!)} numberOfLines={1} style={[ts.doux, { flexShrink: 1 }]}>
              <ExternalLink size={12} color={couleurs.texteDoux} /> {c.programmeNom || 'Programme'}
            </Text>
          )}
        </View>
      ))}
    </Ligne>
  );
}

/** Valeurs brutes des deux derniers résultats d'une même ligne dans un même cycle. Aucune interprétation. */
function Comparaison({ seances }: { seances: SeanceBilan[] }) {
  const { width } = useWindowDimensions();
  const groupes = new Map<string, { nom: string; cycleNom: string; items: { date: string; ex: Exercice }[] }>();
  for (const s of seances)
    for (const e of s.exercices) {
      const k = `${s.cycleKey}|${e.ligneId}`;
      const g = groupes.get(k) ?? { nom: e.nom, cycleNom: s.r.cycleNom ?? '', items: [] };
      g.items.push({ date: s.r.fin, ex: e });
      groupes.set(k, g);
    }
  const tous = [...groupes.values()];
  const comparables = tous.filter((g) => g.items.length >= 2);
  return (
    <View style={[ts.carte, { padding: 16, gap: 4 }]}>
      <Text style={ts.titre}>Comparaison des 2 derniers résultats</Text>
      <Text style={ts.doux}>
        Valeurs brutes, même exercice prescrit (même ligne) dans le même cycle. Aucun calcul de progrès ni recommandation. La prescription affichée est celle
        d’aujourd’hui : elle n’est pas figée au moment des saisies.
      </Text>
      {comparables.length === 0 ? (
        <Text style={[ts.texte, { marginTop: 8, borderRadius: 10, backgroundColor: 'rgba(237,239,242,0.5)', padding: 12, color: couleurs.texteDoux }]}>
          {tous.length ? 'Aucun exercice n’a encore 2 résultats dans un même cycle : rien à comparer.' : 'Aucun résultat dans cette sélection.'}
        </Text>
      ) : (
        <View style={{ marginTop: 8, gap: 12 }}>
          {comparables.map((g, i) => {
            const [b, a] = [...g.items].sort((x, y) => y.date.localeCompare(x.date)).slice(0, 2);
            const n = Math.max(a.ex.series.length, b.ex.series.length);
            const differents = a.ex.series.length !== b.ex.series.length || a.ex.series.map((s) => s.index).join() !== b.ex.series.map((s) => s.index).join();
            const col = { flex: 1, minWidth: width < 400 ? 110 : 140, paddingVertical: 4, paddingRight: 8 } as const;
            return (
              <View key={i} style={{ borderWidth: 1, borderColor: couleurs.bordure, borderRadius: 10, padding: 12, gap: 8 }}>
                <Ligne style={{ gap: 8 }}>
                  <Text style={[ts.texte, { fontFamily: polices.texteMoyen }]}>{g.nom}</Text>
                  <Badge libelle={g.cycleNom || 'Cycle ?'} />
                  {b.ex.prescription && (
                    <Text style={ts.doux}>
                      Prescrit actuellement : {b.ex.prescription.series} × {b.ex.prescription.repetitions || '—'}
                    </Text>
                  )}
                </Ligne>
                <ScrollView horizontal contentContainerStyle={{ minWidth: '100%' }}>
                  <View style={{ minWidth: 260, flex: 1 }}>
                    <View style={{ flexDirection: 'row' }}>
                      <Text style={[ts.doux, { width: 52, paddingVertical: 4 }]}>Série</Text>
                      <Text style={[ts.doux, col]}>{dateParis(a.date)}</Text>
                      <Text style={[ts.doux, col]}>{dateParis(b.date)}</Text>
                    </View>
                    {Array.from({ length: n }, (_, k) => (
                      <View key={k} style={{ flexDirection: 'row', borderTopWidth: 1, borderTopColor: couleurs.bordure }}>
                        <Text style={[ts.texte, { width: 52, paddingVertical: 4 }]}>S{(a.ex.series[k]?.index ?? b.ex.series[k]?.index ?? 0) + 1}</Text>
                        <Text style={[ts.texte, col, { fontVariant: ['tabular-nums'] }]}>{serie(a.ex.series[k])}</Text>
                        <Text style={[ts.texte, col, { fontVariant: ['tabular-nums'] }]}>{serie(b.ex.series[k])}</Text>
                      </View>
                    ))}
                  </View>
                </ScrollView>
                {differents && (
                  <Text style={[ts.doux, { color: '#B45309' }]}>
                    Non comparable série par série : nombre ou numéros de séries différents entre les deux séances.
                  </Text>
                )}
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

function CarteSeance({ s, onOuvrirProgramme }: { s: SeanceBilan; onOuvrirProgramme: (id: string) => void }) {
  const { r } = s;
  return (
    <View style={[ts.carte, { padding: 16, gap: 4 }]}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
        <Text style={[ts.texte, { fontFamily: polices.texteMoyen, flexShrink: 1 }]}>{r.seanceTitre || 'Séance non identifiée'}</Text>
        <Text style={ts.doux}>{dateParis(r.fin)}</Text>
      </View>
      <Ligne style={{ gap: 8 }}>
        <Badge libelle={r.cycleNom || 'Cycle ?'} />
        {r.programmeId ? (
          <Text accessibilityRole="button" onPress={() => onOuvrirProgramme(r.programmeId!)} style={[ts.doux, { textDecorationLine: 'underline' }]}>
            {r.programmeNom || 'Programme'}
          </Text>
        ) : (
          <Text style={ts.doux}>{r.programmeNom}</Text>
        )}
      </Ligne>
      <Text style={[ts.texte, { marginTop: 4 }]}>Ressenti : {r.note !== undefined && r.note !== null ? `${r.note}/10` : 'non renseigné'}</Text>
      {r.commentaire && <Text style={[ts.texte, { borderRadius: 10, backgroundColor: 'rgba(237,239,242,0.5)', padding: 8 }]}>« {r.commentaire} »</Text>}
      <View style={{ marginTop: 8, gap: 8 }}>
        {s.exercices.map((e) => (
          <View key={e.ligneId}>
            <Text style={ts.texte}>
              <Text style={{ fontFamily: polices.texteMoyen }}>{e.nom}</Text>
              {e.prescription && (
                <Text style={ts.doux}>
                  {'  '}(prescrit actuellement {e.prescription.series} × {e.prescription.repetitions || '—'})
                </Text>
              )}
            </Text>
            <Ligne style={{ marginTop: 4, gap: 6 }}>
              {e.series.map((x) => (
                <Text
                  key={x.id}
                  style={{
                    borderRadius: 6,
                    backgroundColor: couleurs.secondaire,
                    color: '#FFFFFF',
                    paddingHorizontal: 8,
                    paddingVertical: 2,
                    fontSize: 12,
                    fontFamily: polices.texte,
                    fontVariant: ['tabular-nums'],
                  }}
                >
                  S{x.index + 1} · {serie(x)}
                </Text>
              ))}
            </Ligne>
          </View>
        ))}
      </View>
    </View>
  );
}
