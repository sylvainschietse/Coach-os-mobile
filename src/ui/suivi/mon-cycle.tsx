// « Mon cycle » : l'assistant de cycle menstruel de la cliente. Éteint par défaut ; à l'activation, la cliente donne
// son accord, choisit ce que voit sa coach (rien par défaut) et indique ses dernières règles. Ensuite : phase du jour,
// prochaines règles, « Mes règles ont commencé » pour noter un décalage, énergie et symptômes du jour, et son
// entraînement comparé phase par phase. En aperçu, la coach ne voit que ce que la cliente partage.
import { ChevronLeft, ChevronRight, Lock } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { cycle, type DonneesCycle, type VueCoachCycle } from '@/data/cycle';
import { entrainement } from '@/data/entrainement';
import { quotidien } from '@/data/quotidien';
import {
  analyser,
  BORNES,
  calendrier,
  dureeCycleEstimee,
  erreurReglages,
  messageDecalage,
  ORDRE_PHASES,
  PARTAGES,
  PHASES,
  phrasePrevision,
  situation,
  SYMPTOMES,
  trier,
  type AnalyseCycle,
  type NoteCycle,
  type PartageCycle,
  type Phase,
  type Regles,
  type ReglagesCycle,
  type Situation,
  type Symptome,
} from '@/domain/cycle-menstruel';
import { aujourdhuiParis } from '@/domain/entrainement';
import { decalerJour } from '@/domain/quotidien';
import { messageErreur, useCharger } from '@/lib/useCharger';

import { Bouton, Carte, Chargement, ChampTexte, Erreur, Puce, Puces, Texte } from '../composants';
import { CaseACocher } from '../crm/dossier';
import { ChampDate } from '../date-heure';
import { couleurs, espace, polices } from '../theme';

const VIOLET = '#6B4BC9';
const fmtJour = (j: string) => new Date(`${j}T12:00:00Z`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
const fmtCourt = (j: string) => new Date(`${j}T12:00:00Z`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const virgule = (n: number) => String(n).replace('.', ',');
export const AVERTISSEMENT = 'Estimations à partir de tes saisies : ce n’est ni un avis médical ni un moyen de contraception.';

async function chargerTout(clientId: string) {
  const depuis = decalerJour(aujourdhuiParis(), -365);
  const [donnees, releves, resultats] = await Promise.all([
    cycle.mesDonnees(clientId),
    quotidien.releves(clientId, depuis).catch(() => []),
    entrainement.resultats(clientId).catch(() => ({ realisations: [] })),
  ]);
  return { donnees, energie: releves.filter((r) => r.indicateur === 'energie').map((r) => ({ jour: r.jour, valeur: r.valeur })), realisations: resultats.realisations };
}

export function MonCycle({ clientId, apercu }: { clientId: string; apercu?: boolean }) {
  if (apercu) return <CycleVuParCoach clientId={clientId} />;
  return <CycleCliente clientId={clientId} />;
}

function CycleCliente({ clientId }: { clientId: string }) {
  const charge = useCharger(() => chargerTout(clientId), `cycle-${clientId}`);
  if (charge.erreur && !charge.donnee) return <Erreur message={charge.erreur} onReessayer={charge.recharger} />;
  if (!charge.donnee) return <Chargement />;
  const { donnees, energie, realisations } = charge.donnee;
  if (!donnees.choix?.actif) return <Activation clientId={clientId} donnees={donnees} onFait={charge.recharger} />;
  return <Tableau clientId={clientId} donnees={donnees} energie={energie} realisations={realisations} onChange={charge.recharger} />;
}

// ---------- Activation ----------

function ChoixPartage({ valeur, onChange }: { valeur: PartageCycle; onChange: (p: PartageCycle) => void }) {
  return (
    <View accessibilityRole="radiogroup" style={{ gap: espace(2) }}>
      {PARTAGES.map((p) => {
        const actif = valeur === p.cle;
        return (
          <Pressable
            key={p.cle}
            accessibilityRole="radio"
            accessibilityState={{ checked: actif }}
            onPress={() => onChange(p.cle)}
            style={{ borderRadius: 14, borderWidth: actif ? 2 : 1, borderColor: actif ? VIOLET : couleurs.bordure, backgroundColor: actif ? '#F6F3FF' : couleurs.carte, padding: 12, gap: 2 }}
          >
            <Text style={{ fontFamily: polices.texteGras, fontSize: 15, color: actif ? VIOLET : couleurs.texte }}>
              {actif ? '● ' : '○ '}
              {p.libelle}
            </Text>
            <Text style={{ fontFamily: polices.texte, fontSize: 14, color: couleurs.texteDoux }}>{p.detail}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function ChampJours({ libelle, valeur, min, max, onChange }: { libelle: string; valeur: number; min: number; max: number; onChange: (n: number) => void }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: espace(2) }}>
      <Text style={{ flex: 1, fontFamily: polices.texte, fontSize: 15, color: couleurs.texte }}>{libelle}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <BoutonRond libelle="−" aide={`${libelle} : un jour de moins`} onPress={() => onChange(Math.max(min, valeur - 1))} />
        <Text style={{ minWidth: 64, textAlign: 'center', fontFamily: polices.texteGras, fontSize: 16, color: couleurs.texte }}>{valeur} jours</Text>
        <BoutonRond libelle="+" aide={`${libelle} : un jour de plus`} onPress={() => onChange(Math.min(max, valeur + 1))} />
      </View>
    </View>
  );
}

function BoutonRond({ libelle, aide, onPress }: { libelle: string; aide: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={aide} onPress={onPress} style={{ width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: couleurs.bordure, alignItems: 'center', justifyContent: 'center', backgroundColor: couleurs.carte }}>
      <Text style={{ fontFamily: polices.texteGras, fontSize: 18, color: couleurs.texte }}>{libelle}</Text>
    </Pressable>
  );
}

function Activation({ clientId, donnees, onFait }: { clientId: string; donnees: DonneesCycle; onFait: () => void }) {
  const aujourdhui = aujourdhuiParis();
  const [accord, setAccord] = useState(false);
  const [partage, setPartage] = useState<PartageCycle>('rien');
  const [reglages, setReglages] = useState<ReglagesCycle>(donnees.reglages);
  const [dernieres, setDernieres] = useState(trier(donnees.regles).at(-1)?.debut ?? '');
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string>();
  const erreurDate = !reglages.sansPrevision && dernieres && dernieres > aujourdhui ? 'La date ne peut pas être dans le futur.' : undefined;

  async function activer() {
    setErreur(undefined);
    const e = erreurReglages(reglages) ?? erreurDate;
    if (e) return setErreur(e);
    setEnvoi(true);
    try {
      await cycle.choisir(clientId, true, partage);
      await cycle.enregistrerReglages(reglages);
      if (dernieres && !reglages.sansPrevision) await cycle.noterRegles({ clientId, debut: dernieres });
      onFait();
    } catch (x) {
      setErreur(messageErreur(x));
      setEnvoi(false);
    }
  }

  return (
    <View style={{ gap: espace(4) }}>
      <Carte style={{ gap: espace(2), backgroundColor: '#F6F3FF', borderColor: '#E2DAFB' }}>
        <Text style={{ fontFamily: polices.texteGras, fontSize: 17, color: '#33236E' }}>Ton cycle, ton énergie, tes séances</Text>
        <Texte>
          Note tes règles et ton énergie : l’appli prévoit tes prochaines règles, te dit dans quelle phase tu es, et compare ton entraînement d’une phase à
          l’autre pour voir si ton cycle l’influence.
        </Texte>
      </Carte>

      <Carte style={{ gap: espace(2) }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Lock size={18} color={VIOLET} />
          <Text style={{ fontFamily: polices.texteGras, fontSize: 16, color: couleurs.texte }}>Tes données restent à toi</Text>
        </View>
        <Texte>• Ce sont des données de santé : rien n’est enregistré sans ton accord.</Texte>
        <Texte>• Tu choisis ce que voit ta coach, et tu peux changer d’avis quand tu veux.</Texte>
        <Texte>• Tu peux couper le suivi ou tout effacer d’un geste, depuis cet écran.</Texte>
        <Texte doux style={{ fontSize: 14 }}>{AVERTISSEMENT}</Texte>
      </Carte>

      <View style={{ gap: espace(2) }}>
        <Text style={{ fontFamily: polices.texteGras, fontSize: 16, color: couleurs.texte }}>Ce que voit ta coach</Text>
        <ChoixPartage valeur={partage} onChange={setPartage} />
      </View>

      <Carte style={{ gap: espace(3) }}>
        <Text style={{ fontFamily: polices.texteGras, fontSize: 16, color: couleurs.texte }}>Pour démarrer</Text>
        <CaseACocher
          libelle="Je n’ai pas de règles en ce moment (contraception hormonale, grossesse, ménopause…) : je suis seulement mon énergie et mes symptômes"
          valeur={reglages.sansPrevision}
          onChange={(v) => setReglages({ ...reglages, sansPrevision: v })}
          petite
        />
        {!reglages.sansPrevision && (
          <>
            <ChampDate libelle="Premier jour de tes dernières règles" jour={dernieres} onChange={setDernieres} erreur={erreurDate} aide="Une date approximative suffit, tu pourras la corriger." />
            <ChampJours libelle="Durée habituelle du cycle" valeur={reglages.dureeCycle} {...BORNES.cycle} onChange={(n) => setReglages({ ...reglages, dureeCycle: n })} />
            <ChampJours libelle="Durée des règles" valeur={reglages.dureeRegles} {...BORNES.regles} onChange={(n) => setReglages({ ...reglages, dureeRegles: n })} />
            <Texte doux style={{ fontSize: 14 }}>Tu ne sais pas ? Laisse 28 et 5 jours : la prévision s’ajuste toute seule à chaque cycle noté.</Texte>
          </>
        )}
      </Carte>

      <CaseACocher libelle="J’accepte que les données de mon cycle soient enregistrées pour mon coaching" valeur={accord} onChange={setAccord} />
      {erreur && <Erreur message={erreur} />}
      <Bouton libelle="Activer mon suivi" onPress={activer} desactive={!accord} chargement={envoi} />
    </View>
  );
}

// ---------- Tableau de bord ----------

function Tableau({
  clientId,
  donnees,
  energie,
  realisations,
  onChange,
}: {
  clientId: string;
  donnees: DonneesCycle;
  energie: { jour: string; valeur: number }[];
  realisations: Awaited<ReturnType<typeof chargerTout>>['realisations'];
  onChange: () => void;
}) {
  const aujourdhui = aujourdhuiParis();
  const s = situation(aujourdhui, donnees.regles, donnees.reglages);
  const analyse = useMemo(() => analyser(donnees.regles, donnees.reglages, energie, realisations), [donnees, energie, realisations]);
  return (
    <View style={{ gap: espace(5) }}>
      <CarteSituation situation={s} reglages={donnees.reglages} partage={donnees.choix?.partage ?? 'rien'} />
      {!donnees.reglages.sansPrevision && <NoterRegles clientId={clientId} donnees={donnees} situation={s} onFait={onChange} />}
      {!donnees.reglages.sansPrevision && <Calendrier regles={donnees.regles} reglages={donnees.reglages} />}
      <MaJourneeCycle clientId={clientId} notes={donnees.notes} energie={energie.find((e) => e.jour === aujourdhui)?.valeur} onFait={onChange} />
      <Comparaison analyse={analyse} sansPrevision={donnees.reglages.sansPrevision} />
      {!donnees.reglages.sansPrevision && <Historique clientId={clientId} regles={donnees.regles} onFait={onChange} />}
      <Reglages clientId={clientId} donnees={donnees} onFait={onChange} />
      <Texte doux style={{ fontSize: 13 }}>{AVERTISSEMENT}</Texte>
    </View>
  );
}

export function PastillePhase({ phase }: { phase: Phase }) {
  const p = PHASES[phase];
  return (
    <View style={{ alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, backgroundColor: p.fond }}>
      <Text style={{ fontFamily: polices.texteGras, fontSize: 13, color: p.couleur }}>{p.libelle}</Text>
    </View>
  );
}

function CarteSituation({ situation: s, reglages, partage }: { situation?: Situation; reglages: ReglagesCycle; partage: PartageCycle }) {
  const decalage = messageDecalage(s);
  const vu = PARTAGES.find((p) => p.cle === partage)!;
  return (
    <View style={{ borderRadius: 22, padding: 18, gap: 10, backgroundColor: s ? PHASES[s.phase].fond : '#F6F3FF' }}>
      {s ? (
        <>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }}>
            <View>
              <Text style={{ fontFamily: polices.texte, fontSize: 13, color: couleurs.texteDoux, textTransform: 'uppercase', letterSpacing: 1.2 }}>Aujourd’hui</Text>
              <Text style={{ fontFamily: polices.titre, fontSize: 44, color: PHASES[s.phase].couleur, lineHeight: 48 }}>Jour {s.jourCycle}</Text>
            </View>
            <PastillePhase phase={s.phase} />
          </View>
          <Text style={{ fontFamily: polices.texteGras, fontSize: 16, color: couleurs.texte }}>Prochaines règles : {phrasePrevision(s)}</Text>
          {!s.retard && (
            <Texte doux style={{ fontSize: 14 }}>
              {s.fiable
                ? `Entre le ${fmtCourt(s.fourchette[0])} et le ${fmtCourt(s.fourchette[1])}, d’après tes cycles de ${s.dureeCycle} jours en moyenne.`
                : `Estimation sur un cycle de ${s.dureeCycle} jours : elle s’affinera dès tes prochaines règles notées.`}
            </Texte>
          )}
          {decalage && <Texte style={{ fontSize: 14, color: couleurs.orange }}>{decalage}</Texte>}
          <Texte style={{ fontSize: 14 }}>{PHASES[s.phase].conseil}</Texte>
        </>
      ) : reglages.sansPrevision ? (
        <Texte>Suivi sans prévision : note ton énergie et tes symptômes, on compare avec tes séances.</Texte>
      ) : (
        <Texte>Note le premier jour de tes prochaines règles pour lancer la prévision.</Texte>
      )}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Lock size={14} color={couleurs.texteDoux} />
        <Text style={{ fontFamily: polices.texte, fontSize: 13, color: couleurs.texteDoux }}>Ta coach voit : {vu.libelle.toLowerCase()}</Text>
      </View>
    </View>
  );
}

function NoterRegles({ clientId, donnees, situation: s, onFait }: { clientId: string; donnees: DonneesCycle; situation?: Situation; onFait: () => void }) {
  const aujourdhui = aujourdhuiParis();
  const [autre, setAutre] = useState(false);
  const [jour, setJour] = useState(aujourdhui);
  const [erreur, setErreur] = useState<string>();
  const derniere = trier(donnees.regles).at(-1);
  // Règles en cours, sans fin notée : on propose plutôt de noter la fin.
  const enCours = derniere && !derniere.fin && s?.phase === 'regles';

  async function enregistrer(r: Regles) {
    setErreur(undefined);
    if (r.debut > aujourdhui || (r.fin && r.fin > aujourdhui)) return setErreur('La date ne peut pas être dans le futur.');
    try {
      await cycle.noterRegles(r);
      // La durée moyenne apprise devient la durée habituelle : la coach (partage « phase ») situe le jour avec.
      const toutes = trier([...donnees.regles.filter((x) => x.debut !== r.debut), r]);
      const duree = dureeCycleEstimee(toutes, donnees.reglages);
      if (duree !== donnees.reglages.dureeCycle && duree >= BORNES.cycle.min && duree <= BORNES.cycle.max)
        await cycle.enregistrerReglages({ ...donnees.reglages, dureeCycle: duree });
      setAutre(false);
      onFait();
    } catch (e) {
      setErreur(messageErreur(e));
    }
  }

  return (
    <Carte style={{ gap: espace(3) }}>
      {enCours ? (
        <>
          <Text style={{ fontFamily: polices.texteGras, fontSize: 16, color: couleurs.texte }}>Tes règles sont terminées ?</Text>
          <Puces>
            <Puce libelle="Aujourd’hui" onPress={() => enregistrer({ ...derniere, fin: aujourdhui })} />
            <Puce libelle="Hier" onPress={() => enregistrer({ ...derniere, fin: decalerJour(aujourdhui, -1) })} />
          </Puces>
        </>
      ) : (
        <>
          <Text style={{ fontFamily: polices.texteGras, fontSize: 16, color: couleurs.texte }}>Mes règles ont commencé</Text>
          <Texte doux style={{ fontSize: 14 }}>En avance ou en retard ? Note-le : la prévision se recale tout de suite.</Texte>
          <Puces>
            <Puce libelle="Aujourd’hui" onPress={() => enregistrer({ clientId, debut: aujourdhui })} />
            <Puce libelle="Hier" onPress={() => enregistrer({ clientId, debut: decalerJour(aujourdhui, -1) })} />
            <Puce libelle="Une autre date" actif={autre} onPress={() => setAutre(!autre)} />
          </Puces>
        </>
      )}
      {autre && !enCours && (
        <View style={{ gap: espace(2) }}>
          <ChampDate libelle="Premier jour des règles" jour={jour} onChange={setJour} />
          <Bouton libelle="Enregistrer" onPress={() => enregistrer({ clientId, debut: jour })} />
        </View>
      )}
      {erreur && <Erreur message={erreur} />}
    </Carte>
  );
}

function Calendrier({ regles, reglages }: { regles: Regles[]; reglages: ReglagesCycle }) {
  const aujourdhui = aujourdhuiParis();
  const [mois, setMois] = useState(aujourdhui.slice(0, 7));
  const jours = calendrier(mois, aujourdhui, regles, reglages);
  const [a, m] = mois.split('-').map(Number);
  const decale = (n: number) => {
    const d = new Date(Date.UTC(a, m - 1 + n, 1));
    setMois(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
  };
  const vides = (new Date(Date.UTC(a, m - 1, 1)).getUTCDay() + 6) % 7;
  const titre = new Date(Date.UTC(a, m - 1, 15)).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  return (
    <Carte style={{ gap: espace(3) }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Mois précédent" onPress={() => decale(-1)} hitSlop={8} style={{ padding: 6 }}>
          <ChevronLeft size={20} color={couleurs.texte} />
        </Pressable>
        <Text style={{ fontFamily: polices.texteGras, fontSize: 16, color: couleurs.texte, textTransform: 'capitalize' }}>{titre}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Mois suivant" onPress={() => decale(1)} hitSlop={8} style={{ padding: 6 }}>
          <ChevronRight size={20} color={couleurs.texte} />
        </Pressable>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((l, i) => (
          <Text key={i} style={{ width: `${100 / 7}%`, textAlign: 'center', fontFamily: polices.texte, fontSize: 12, color: couleurs.texteDoux }}>
            {l}
          </Text>
        ))}
        {Array.from({ length: vides }, (_, i) => (
          <View key={`v${i}`} style={{ width: `${100 / 7}%` }} />
        ))}
        {jours.map((j) => {
          const p = j.phase && PHASES[j.phase];
          const regles = j.phase === 'regles';
          const estAujourdhui = j.jour === aujourdhui;
          return (
            <View key={j.jour} style={{ width: `${100 / 7}%`, padding: 2 }}>
              <View
                accessibilityLabel={`${fmtJour(j.jour)}${p ? ` : ${p.libelle}${j.prevu ? ' (prévu)' : ''}` : ''}`}
                style={{
                  height: 38,
                  borderRadius: 10,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: p ? (regles && !j.prevu ? p.couleur : p.fond) : 'transparent',
                  borderWidth: estAujourdhui ? 2 : regles && j.prevu ? 1.5 : 0,
                  borderStyle: regles && j.prevu ? 'dashed' : 'solid',
                  borderColor: estAujourdhui ? couleurs.texte : p?.couleur,
                  opacity: j.prevu && !regles ? 0.75 : 1,
                }}
              >
                <Text style={{ fontFamily: estAujourdhui ? polices.texteGras : polices.texte, fontSize: 14, color: regles && !j.prevu ? '#FFFFFF' : couleurs.texte }}>
                  {Number(j.jour.slice(8))}
                </Text>
              </View>
            </View>
          );
        })}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
        {ORDRE_PHASES.map((ph) => (
          <View key={ph} style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <View style={{ width: 12, height: 12, borderRadius: 4, backgroundColor: ph === 'regles' ? PHASES[ph].couleur : PHASES[ph].fond, borderWidth: 1, borderColor: PHASES[ph].couleur }} />
            <Text style={{ fontFamily: polices.texte, fontSize: 12, color: couleurs.texteDoux }}>{PHASES[ph].court}</Text>
          </View>
        ))}
        <Text style={{ fontFamily: polices.texte, fontSize: 12, color: couleurs.texteDoux }}>Pointillés : prévu</Text>
      </View>
    </Carte>
  );
}

function MaJourneeCycle({ clientId, notes, energie, onFait }: { clientId: string; notes: NoteCycle[]; energie?: number; onFait: () => void }) {
  const jour = aujourdhuiParis();
  const actuelle = notes.find((n) => n.jour === jour);
  const [niveau, setNiveau] = useState<number | undefined>(energie);
  const [symptomes, setSymptomes] = useState<Symptome[]>(actuelle?.symptomes ?? []);
  const [note, setNote] = useState(actuelle?.note ?? '');
  const [etat, setEtat] = useState<'' | 'envoi' | 'ok'>('');
  const [erreur, setErreur] = useState<string>();

  async function enregistrer() {
    setEtat('envoi');
    setErreur(undefined);
    try {
      await Promise.all([
        quotidien.enregistrerReleves(clientId, jour, { energie: niveau }),
        cycle.enregistrerNote({ clientId, jour, symptomes, note: note.trim() || undefined }),
      ]);
      setEtat('ok');
      onFait();
    } catch (e) {
      setErreur(messageErreur(e));
      setEtat('');
    }
  }

  return (
    <Carte style={{ gap: espace(3) }}>
      <Text style={{ fontFamily: polices.texteGras, fontSize: 16, color: couleurs.texte }}>Ma journée</Text>
      <View style={{ gap: espace(2) }}>
        <Text style={{ fontFamily: polices.texte, fontSize: 15, color: couleurs.texte }}>Mon énergie</Text>
        <View accessibilityRole="radiogroup" style={{ flexDirection: 'row', gap: 6 }}>
          {[1, 2, 3, 4, 5].map((n) => (
            <Pressable
              key={n}
              accessibilityRole="radio"
              accessibilityLabel={`Énergie ${n} sur 5`}
              accessibilityState={{ checked: niveau === n }}
              onPress={() => setNiveau(niveau === n ? undefined : n)}
              style={{ flex: 1, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: niveau === n ? VIOLET : couleurs.bordure, backgroundColor: niveau === n ? VIOLET : couleurs.carte }}
            >
              <Text style={{ fontFamily: polices.texteGras, fontSize: 16, color: niveau === n ? '#FFFFFF' : couleurs.texte }}>{n}</Text>
            </Pressable>
          ))}
        </View>
        <Texte doux style={{ fontSize: 13 }}>1 : à plat · 5 : en pleine forme. C’est la même énergie que dans « Ma journée ».</Texte>
      </View>
      <View style={{ gap: espace(2) }}>
        <Text style={{ fontFamily: polices.texte, fontSize: 15, color: couleurs.texte }}>Symptômes (facultatif)</Text>
        <Puces>
          {SYMPTOMES.map((x) => (
            <Puce
              key={x.cle}
              libelle={x.libelle}
              actif={symptomes.includes(x.cle)}
              onPress={() => setSymptomes(symptomes.includes(x.cle) ? symptomes.filter((y) => y !== x.cle) : [...symptomes, x.cle])}
            />
          ))}
        </Puces>
      </View>
      <ChampTexte libelle="Une note pour toi (facultatif)" valeur={note} onChange={setNote} placeholder="Ex. : séance allégée, ça allait mieux après" multiligne />
      {erreur && <Erreur message={erreur} />}
      <Bouton libelle={etat === 'ok' ? 'Enregistré ✓' : 'Enregistrer ma journée'} onPress={enregistrer} chargement={etat === 'envoi'} />
    </Carte>
  );
}

function Comparaison({ analyse, sansPrevision }: { analyse: AnalyseCycle; sansPrevision: boolean }) {
  return (
    <Carte style={{ gap: espace(3) }}>
      <Text style={{ fontFamily: polices.texteGras, fontSize: 16, color: couleurs.texte }}>Mon entraînement et mon cycle</Text>
      {sansPrevision ? (
        <Texte doux>Sans règles notées, on ne peut pas situer les phases. Ton énergie reste suivie dans « Ma journée ».</Texte>
      ) : !analyse.pret ? (
        <Texte doux>
          {analyse.cycles === 0
            ? 'Il faut au moins 2 cycles complets notés pour comparer tes phases. Continue de noter tes règles, ton énergie et tes séances.'
            : `Encore un peu de patience : ${analyse.cycles} cycle complet noté sur 2. Continue de noter tes règles, ton énergie et tes séances.`}
        </Texte>
      ) : (
        <>
          {analyse.constats.map((c) => (
            <Text key={c} style={{ fontFamily: polices.texteMoyen, fontSize: 15, color: couleurs.texte }}>
              • {c}
            </Text>
          ))}
          <View style={{ gap: 6 }}>
            <View style={{ flexDirection: 'row', paddingBottom: 4, borderBottomWidth: 1, borderColor: couleurs.bordure }}>
              {['Phase', 'Séances', 'Énergie', 'Effort', 'Force'].map((t, i) => (
                <Text key={t} style={{ flex: i === 0 ? 1.6 : 1, textAlign: i === 0 ? 'left' : 'center', fontFamily: polices.texte, fontSize: 12, color: couleurs.texteDoux }}>
                  {t}
                </Text>
              ))}
            </View>
            {analyse.phases.map((p) => (
              <View key={p.phase} style={{ flexDirection: 'row', alignItems: 'center' }}>
                <View style={{ flex: 1.6, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: PHASES[p.phase].couleur }} />
                  <Text style={{ fontFamily: polices.texteMoyen, fontSize: 14, color: couleurs.texte }}>{PHASES[p.phase].court}</Text>
                </View>
                <Cellule texte={String(p.seances)} />
                <Cellule texte={p.energie === undefined ? '–' : `${virgule(p.energie)}/5`} />
                <Cellule texte={p.ressenti === undefined ? '–' : `${virgule(p.ressenti)}/10`} />
                <Cellule
                  texte={p.force === undefined ? '–' : `${Math.round(p.force) > 0 ? '+' : Math.round(p.force) < 0 ? '−' : ''}${Math.abs(Math.round(p.force))} %`}
                  couleur={p.force === undefined ? undefined : p.force >= 1 ? couleurs.vert : p.force <= -1 ? couleurs.orange : undefined}
                />
              </View>
            ))}
          </View>
          <Texte doux style={{ fontSize: 13 }}>
            Force : chaque séance comparée à ta tendance sur le même exercice (3 semaines autour), pour que ta progression ne fausse pas la comparaison. Sur {analyse.cycles} cycles notés.
          </Texte>
        </>
      )}
    </Carte>
  );
}

const Cellule = ({ texte, couleur }: { texte: string; couleur?: string }) => (
  <Text style={{ flex: 1, textAlign: 'center', fontFamily: polices.texteMoyen, fontSize: 14, color: couleur ?? couleurs.texte }}>{texte}</Text>
);

function Historique({ clientId, regles, onFait }: { clientId: string; regles: Regles[]; onFait: () => void }) {
  const [ouvert, setOuvert] = useState(false);
  const liste = trier(regles).reverse();
  if (!liste.length) return null;
  return (
    <Carte style={{ gap: espace(2) }}>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: ouvert }} onPress={() => setOuvert(!ouvert)} style={{ minHeight: 32, justifyContent: 'center' }}>
        <Text style={{ fontFamily: polices.texteGras, fontSize: 16, color: couleurs.texte }}>
          Mes règles notées ({liste.length}) {ouvert ? '▴' : '▾'}
        </Text>
      </Pressable>
      {ouvert &&
        liste.map((r, i) => {
          const suivante = liste[i - 1];
          const duree = suivante ? Math.round((Date.parse(suivante.debut) - Date.parse(r.debut)) / 86400000) : undefined;
          return (
            <View key={r.debut} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 6, borderTopWidth: 1, borderColor: couleurs.discret }}>
              <View>
                <Text style={{ fontFamily: polices.texteMoyen, fontSize: 15, color: couleurs.texte }}>
                  {fmtCourt(r.debut)}
                  {r.fin ? ` → ${fmtCourt(r.fin)}` : ''}
                </Text>
                {duree !== undefined && <Text style={{ fontFamily: polices.texte, fontSize: 13, color: couleurs.texteDoux }}>Cycle de {duree} jours</Text>}
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Supprimer les règles du ${fmtCourt(r.debut)}`}
                onPress={() => cycle.supprimerRegles(clientId, r.debut).then(onFait)}
                hitSlop={8}
                style={{ minHeight: 40, justifyContent: 'center' }}
              >
                <Text style={{ fontFamily: polices.texte, fontSize: 14, color: couleurs.rouge }}>Supprimer</Text>
              </Pressable>
            </View>
          );
        })}
    </Carte>
  );
}

function Reglages({ clientId, donnees, onFait }: { clientId: string; donnees: DonneesCycle; onFait: () => void }) {
  const [ouvert, setOuvert] = useState(false);
  const [confirmer, setConfirmer] = useState(false);
  const [erreur, setErreur] = useState<string>();
  const partage = donnees.choix?.partage ?? 'rien';
  const agir = (f: () => Promise<unknown>) => {
    setErreur(undefined);
    f().then(onFait, (e: unknown) => setErreur(messageErreur(e)));
  };
  return (
    <Carte style={{ gap: espace(3) }}>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: ouvert }} onPress={() => setOuvert(!ouvert)} style={{ minHeight: 32, justifyContent: 'center' }}>
        <Text style={{ fontFamily: polices.texteGras, fontSize: 16, color: couleurs.texte }}>Confidentialité et réglages {ouvert ? '▴' : '▾'}</Text>
      </Pressable>
      {ouvert && (
        <>
          <Text style={{ fontFamily: polices.texteMoyen, fontSize: 15, color: couleurs.texte }}>Ce que voit ta coach</Text>
          <ChoixPartage valeur={partage} onChange={(p) => agir(() => cycle.choisir(clientId, true, p))} />
          {!donnees.reglages.sansPrevision && (
            <>
              <ChampJours
                libelle="Durée habituelle du cycle"
                valeur={donnees.reglages.dureeCycle}
                {...BORNES.cycle}
                onChange={(n) => agir(() => cycle.enregistrerReglages({ ...donnees.reglages, dureeCycle: n }))}
              />
              <ChampJours
                libelle="Durée des règles"
                valeur={donnees.reglages.dureeRegles}
                {...BORNES.regles}
                onChange={(n) => agir(() => cycle.enregistrerReglages({ ...donnees.reglages, dureeRegles: n }))}
              />
            </>
          )}
          <CaseACocher
            libelle="Pas de règles en ce moment : suivre seulement mon énergie et mes symptômes"
            valeur={donnees.reglages.sansPrevision}
            onChange={(v) => agir(() => cycle.enregistrerReglages({ ...donnees.reglages, sansPrevision: v }))}
            petite
          />
          <Bouton variante="discret" libelle="Mettre le suivi en pause" onPress={() => agir(() => cycle.choisir(clientId, false, 'rien'))} />
          <Texte doux style={{ fontSize: 13 }}>En pause, tes notes restent sur ton compte mais ta coach ne voit plus rien.</Texte>
          {!confirmer ? (
            <Bouton variante="discret" libelle="Tout effacer" onPress={() => setConfirmer(true)} />
          ) : (
            <View style={{ gap: espace(2) }}>
              <Texte>Tes règles, tes symptômes et tes réglages de cycle seront effacés pour de bon. Ton énergie reste dans « Ma journée ».</Texte>
              <Bouton libelle="Oui, tout effacer" onPress={() => agir(() => cycle.effacerTout(clientId))} />
              <Bouton variante="discret" libelle="Annuler" onPress={() => setConfirmer(false)} />
            </View>
          )}
        </>
      )}
      {erreur && <Erreur message={erreur} />}
    </Carte>
  );
}

// ---------- Côté coach ----------

async function chargerCoach(clientId: string) {
  const vue = await cycle.vueCoach(clientId);
  if (!vue) return null;
  const aujourdhui = aujourdhuiParis();
  const [releves, resultats] = await Promise.all([
    quotidien.releves(clientId, decalerJour(aujourdhui, -365)).catch(() => []),
    vue.partage === 'tout' ? entrainement.resultats(clientId).catch(() => ({ realisations: [] })) : Promise.resolve({ realisations: [] }),
  ]);
  const energie = releves.filter((r) => r.indicateur === 'energie').map((r) => ({ jour: r.jour, valeur: r.valeur }));
  return {
    vue,
    energieDuJour: energie.find((e) => e.jour === aujourdhui)?.valeur,
    analyse: vue.partage === 'tout' ? analyser(vue.regles, vue.reglages, energie, resultats.realisations, 'coach') : undefined,
  };
}

/** Pour la coach : rien si la cliente ne partage pas ; la phase du jour ; ou tout (comparaison et symptômes récents). */
export function CycleCoach({ clientId, prenom, complet }: { clientId: string; prenom?: string; complet?: boolean }) {
  const charge = useCharger(() => chargerCoach(clientId), `cycle-coach-${clientId}`);
  if (!charge.donnee) return null;
  return <ResumeCoach {...charge.donnee} prenom={prenom} complet={complet} />;
}

function ResumeCoach({ vue, energieDuJour, analyse, prenom, complet }: { vue: VueCoachCycle; energieDuJour?: number; analyse?: AnalyseCycle; prenom?: string; complet?: boolean }) {
  const aujourdhui = aujourdhuiParis();
  const s = situation(aujourdhui, vue.regles, vue.reglages);
  const recentes = vue.notes.filter((n) => n.jour >= decalerJour(aujourdhui, -3)).flatMap((n) => n.symptomes);
  const libelles = [...new Set(recentes)].map((x) => SYMPTOMES.find((y) => y.cle === x)?.libelle).filter(Boolean);
  return (
    <View style={{ borderRadius: 18, padding: 14, gap: 8, backgroundColor: s ? PHASES[s.phase].fond : '#F6F3FF' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <Text style={{ fontFamily: polices.texteGras, fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase', color: VIOLET }}>Cycle{prenom ? ` de ${prenom}` : ''}</Text>
        <Text style={{ fontFamily: polices.texte, fontSize: 12, color: couleurs.texteDoux }}>Partagé : {vue.partage === 'tout' ? 'tout' : 'phase seule'}</Text>
      </View>
      {s ? (
        <Text style={{ fontFamily: polices.texteGras, fontSize: 16, color: couleurs.texte }}>
          {PHASES[s.phase].libelle} · jour {s.jourCycle}
          {energieDuJour !== undefined ? ` · énergie ${energieDuJour}/5` : ''}
        </Text>
      ) : (
        <Texte>{vue.reglages.sansPrevision ? 'Suivi sans prévision (énergie et symptômes seulement).' : 'Pas encore de règles notées.'}</Texte>
      )}
      {s && <Texte style={{ fontSize: 14 }}>{PHASES[s.phase].conseilCoach}</Texte>}
      {vue.partage === 'tout' && libelles.length > 0 && <Texte style={{ fontSize: 14 }}>Ces derniers jours : {libelles.join(', ').toLowerCase()}.</Texte>}
      {vue.partage === 'tout' && s && <Texte doux style={{ fontSize: 13 }}>Prochaines règles {phrasePrevision(s).replace(/\.$/, '')}.</Texte>}
      {!complet && analyse?.pret && <Texte style={{ fontSize: 14 }}>• {analyse.constats[0]}</Texte>}
    </View>
  );
}

/** Aperçu coach de la rubrique : seulement ce que la cliente partage. */
function CycleVuParCoach({ clientId }: { clientId: string }) {
  const charge = useCharger(async () => ({ partage: await chargerCoach(clientId) }), `cycle-apercu-${clientId}`);
  if (charge.erreur) return <Erreur message={charge.erreur} />;
  if (!charge.donnee) return <Chargement />;
  const partage = charge.donnee.partage;
  if (!partage)
    return (
      <Carte style={{ gap: espace(2) }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Lock size={18} color={VIOLET} />
          <Text style={{ fontFamily: polices.texteGras, fontSize: 16, color: couleurs.texte }}>Rien de partagé</Text>
        </View>
        <Texte>Ce suivi est privé : ta cliente choisit ce qu’elle te montre. Elle ne partage rien pour l’instant.</Texte>
      </Carte>
    );
  const { vue, analyse } = partage;
  return (
    <View style={{ gap: espace(4) }}>
      <ResumeCoach {...partage} complet />
      {vue.partage === 'tout' && !vue.reglages.sansPrevision && <Calendrier regles={vue.regles} reglages={vue.reglages} />}
      {analyse && <Comparaison analyse={analyse} sansPrevision={vue.reglages.sansPrevision} />}
      <Texte doux style={{ fontSize: 13 }}>Lecture seule : seule ta cliente peut noter ou modifier son cycle.</Texte>
    </View>
  );
}

/** Sur l'accueil de la cliente, si son suivi est actif : jour, phase et prochaines règles ; un appui ouvre « Mon cycle ». */
export function CarteCycleAccueil({ clientId, onOuvrir }: { clientId: string; onOuvrir: () => void }) {
  const jour = aujourdhuiParis();
  const { donnee } = useCharger(() => cycle.mesDonnees(clientId).catch(() => null), `cycle-accueil-${clientId}-${jour}`);
  if (!donnee?.choix?.actif) return null;
  const s = situation(jour, donnee.regles, donnee.reglages);
  if (!s) return null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Mon cycle : jour ${s.jourCycle}, ${PHASES[s.phase].libelle}. Prochaines règles ${phrasePrevision(s)}.`}
      onPress={onOuvrir}
      style={{ borderRadius: 22, padding: 16, gap: 6, backgroundColor: PHASES[s.phase].fond }}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={{ fontFamily: polices.texteGras, fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase', color: PHASES[s.phase].couleur }}>Mon cycle</Text>
        <ChevronRight size={16} color={couleurs.texteDoux} />
      </View>
      <Text style={{ fontFamily: polices.texteGras, fontSize: 17, color: couleurs.texte }}>
        Jour {s.jourCycle} · {PHASES[s.phase].libelle}
      </Text>
      <Text style={{ fontFamily: polices.texte, fontSize: 14, color: couleurs.texteDoux }}>Prochaines règles {phrasePrevision(s)}</Text>
    </Pressable>
  );
}
