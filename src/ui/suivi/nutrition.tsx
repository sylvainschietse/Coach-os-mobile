import { useState } from 'react';
import { View } from 'react-native';

import { depot } from '@/data';
import { jourLocal } from '@/domain/crm';
import { formaterDate } from '@/domain/programmes';
import { caloriesDesMacros, erreursJournal, erreursPlan, formaterNombre, LIBELLES_RESPECT, lireNombre, resumeJournal } from '@/domain/suivi';
import type { JournalNutrition, PlanNutrition } from '@/domain/types';
import { nouvelId } from '@/lib/identifiant';
import { useCharger } from '@/lib/useCharger';

import { Bouton, Carte, Chargement, ChampTexte, Erreur, Puce, Puces, SousTitre, Texte } from '../composants';
import { couleurs, espace } from '../theme';

const CHAMPS_PLAN: { cle: 'calories' | 'proteinesG' | 'glucidesG' | 'lipidesG' | 'eauL'; libelle: string; unite: string }[] = [
  { cle: 'calories', libelle: 'Calories', unite: 'kcal' },
  { cle: 'proteinesG', libelle: 'Protéines', unite: 'g' },
  { cle: 'glucidesG', libelle: 'Glucides', unite: 'g' },
  { cle: 'lipidesG', libelle: 'Lipides', unite: 'g' },
  { cle: 'eauL', libelle: 'Eau', unite: 'L' },
];

function VuePlan({ plan }: { plan: PlanNutrition }) {
  const objectifs = CHAMPS_PLAN.filter((c) => plan[c.cle] !== undefined);
  return (
    <>
      {objectifs.length > 0 && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: espace(3) }}>
          {objectifs.map((c) => (
            <View key={c.cle} style={{ minWidth: 90, gap: espace(0.5) }}>
              <Texte doux style={{ fontSize: 12 }}>{c.libelle}</Texte>
              <Texte style={{ fontSize: 20, fontWeight: '600' }}>
                {formaterNombre(plan[c.cle])} <Texte doux style={{ fontSize: 14 }}>{c.unite}</Texte>
              </Texte>
            </View>
          ))}
        </View>
      )}
      {plan.conseils && <Texte>{plan.conseils}</Texte>}
    </>
  );
}

/** Plan nutrition du client : écrit par le coach, lu par le client. */
export function PlanNutritionCarte({ clientId, modifiable }: { clientId: string; modifiable: boolean }) {
  // null tant que ça charge ; { plan: null } quand le coach n'a pas encore fait de plan.
  const { donnee, erreur, recharger } = useCharger(async () => ({ plan: await depot.planNutrition(clientId) }), clientId);
  const plan = donnee ? donnee.plan : undefined;
  const [edition, setEdition] = useState(false);
  const [valeurs, setValeurs] = useState<Record<string, string>>({});
  const [conseils, setConseils] = useState('');
  const [erreurs, setErreurs] = useState<string[]>([]);
  const [enCours, setEnCours] = useState(false);

  function ouvrir() {
    const v: Record<string, string> = {};
    CHAMPS_PLAN.forEach((c) => (v[c.cle] = plan?.[c.cle] === undefined ? '' : String(plan[c.cle]).replace('.', ',')));
    setValeurs(v);
    setConseils(plan?.conseils ?? '');
    setEdition(true);
  }

  const brouillon = (): PlanNutrition => {
    const p: PlanNutrition = { clientId, conseils: conseils.trim() || undefined };
    CHAMPS_PLAN.forEach((c) => (p[c.cle] = lireNombre(valeurs[c.cle] ?? '')));
    return p;
  };

  async function enregistrer() {
    const p = brouillon();
    const liste = erreursPlan(p);
    setErreurs(liste);
    if (liste.length) return;
    setEnCours(true);
    try {
      await depot.enregistrerPlanNutrition(p);
      setEdition(false);
      recharger();
    } catch (e) {
      setErreurs([e instanceof Error ? e.message : 'Enregistrement impossible']);
    } finally {
      setEnCours(false);
    }
  }

  const macros = edition ? caloriesDesMacros(brouillon()) : undefined;

  return (
    <Carte>
      <SousTitre>Plan nutrition</SousTitre>
      {erreur && <Erreur message={erreur} />}
      {plan === null && !edition && (
        <Texte doux>{modifiable ? 'Pas encore de plan pour ce client.' : 'Ton coach ne t’a pas encore donné de plan nutrition.'}</Texte>
      )}
      {plan === undefined && !erreur && <Chargement />}
      {plan && !edition && <VuePlan plan={plan} />}
      {plan?.majLe && !edition && (
        <Texte doux style={{ fontSize: 12 }}>Mis à jour le {formaterDate(plan.majLe.slice(0, 10))}</Texte>
      )}
      {edition && (
        <View style={{ gap: espace(3) }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: espace(3) }}>
            {CHAMPS_PLAN.map((c) => (
              <View key={c.cle} style={{ flexBasis: '46%', flexGrow: 1 }}>
                <ChampTexte
                  libelle={`${c.libelle} (${c.unite})`}
                  type="nombre"
                  valeur={valeurs[c.cle] ?? ''}
                  onChange={(t) => setValeurs({ ...valeurs, [c.cle]: t })}
                />
              </View>
            ))}
          </View>
          {macros !== undefined && (
            <Texte doux style={{ fontSize: 13 }}>Les macros font environ {macros} kcal (4/4/9).</Texte>
          )}
          <ChampTexte libelle="Conseils pour le client" valeur={conseils} onChange={setConseils} multiligne />
          {erreurs.length > 0 && <Erreur message={erreurs.join('\n')} />}
          <Bouton libelle="Enregistrer le plan" onPress={enregistrer} chargement={enCours} />
          <Bouton variante="discret" libelle="Annuler" onPress={() => setEdition(false)} />
        </View>
      )}
      {modifiable && !edition && plan !== undefined && (
        <Bouton variante="secondaire" libelle={plan ? 'Modifier le plan' : 'Créer le plan'} onPress={ouvrir} />
      )}
    </Carte>
  );
}

function SaisieDuJour({ clientId, existant, onAjoute }: { clientId: string; existant?: JournalNutrition; onAjoute: () => void }) {
  const [respect, setRespect] = useState(existant?.respect);
  const [eau, setEau] = useState(existant?.eauL === undefined ? '' : String(existant.eauL).replace('.', ','));
  const [repas, setRepas] = useState(existant?.repas ?? '');
  const [ressenti, setRessenti] = useState(existant?.ressenti ?? '');
  const [erreurs, setErreurs] = useState<string[]>([]);
  const [enCours, setEnCours] = useState(false);
  const [ok, setOk] = useState(false);

  async function enregistrer() {
    const j: JournalNutrition = {
      id: existant?.id ?? nouvelId(),
      clientId,
      date: jourLocal(new Date()),
      respect,
      eauL: lireNombre(eau),
      repas: repas.trim() || undefined,
      ressenti: ressenti.trim() || undefined,
    };
    const liste = erreursJournal(j);
    setErreurs(liste);
    if (liste.length) return;
    setEnCours(true);
    try {
      await depot.enregistrerJournal(j);
      setOk(true);
      onAjoute();
    } catch (e) {
      setErreurs([e instanceof Error ? e.message : 'Enregistrement impossible']);
    } finally {
      setEnCours(false);
    }
  }

  return (
    <Carte>
      <SousTitre>Aujourd’hui</SousTitre>
      <Texte doux style={{ fontSize: 14 }}>As-tu suivi ton plan aujourd’hui ?</Texte>
      <Puces>
        {[1, 2, 3, 4, 5].map((n) => (
          <Puce key={n} libelle={LIBELLES_RESPECT[n]} actif={respect === n} onPress={() => (setRespect(respect === n ? undefined : n), setOk(false))} />
        ))}
      </Puces>
      <ChampTexte libelle="Eau bue (litres)" type="nombre" valeur={eau} onChange={(t) => (setEau(t), setOk(false))} placeholder="1,5" />
      <ChampTexte libelle="Mes repas (facultatif)" valeur={repas} onChange={(t) => (setRepas(t), setOk(false))} multiligne />
      <ChampTexte libelle="Faim, énergie, écarts… (facultatif)" valeur={ressenti} onChange={(t) => (setRessenti(t), setOk(false))} />
      {erreurs.length > 0 && <Erreur message={erreurs.join('\n')} />}
      {ok && <Texte style={{ color: couleurs.vert }}>C’est noté, ton coach le verra.</Texte>}
      <Bouton libelle={existant ? 'Mettre à jour' : 'Enregistrer'} onPress={enregistrer} chargement={enCours} />
    </Carte>
  );
}

/** Journal nutrition : le client note sa journée, le coach voit les 7 derniers jours. */
export function JournalNutritionVue({ clientId, saisie }: { clientId: string; saisie: boolean }) {
  const { donnee, erreur, recharger } = useCharger(() => depot.journalNutrition(clientId), clientId);
  const aujourdhui = jourLocal(new Date());
  const resume = donnee ? resumeJournal(donnee, 7, aujourdhui) : undefined;
  return (
    <View style={{ gap: espace(4) }}>
      {erreur && <Erreur message={erreur} />}
      {!donnee && !erreur && <Chargement />}
      {donnee && saisie && (
        <SaisieDuJour key={donnee.length} clientId={clientId} existant={donnee.find((j) => j.date === aujourdhui)} onAjoute={recharger} />
      )}
      {resume && resume.joursNotes > 0 && (
        <Carte>
          <SousTitre>7 derniers jours</SousTitre>
          <Texte>
            {resume.joursNotes} jour{resume.joursNotes > 1 ? 's' : ''} noté{resume.joursNotes > 1 ? 's' : ''}
            {resume.respect !== undefined ? ` · respect du plan ${formaterNombre(resume.respect)}/5` : ''}
            {resume.eauL !== undefined ? ` · ${formaterNombre(resume.eauL)} L d’eau par jour` : ''}
          </Texte>
        </Carte>
      )}
      {donnee && donnee.length === 0 && !saisie && <Texte doux>Le client n’a encore rien noté.</Texte>}
      {donnee && donnee.length > 0 && (
        <Carte>
          <SousTitre>Journal</SousTitre>
          {donnee.map((j) => (
            <View key={j.id} style={{ borderTopWidth: 1, borderTopColor: couleurs.bordure, paddingTop: espace(2), gap: espace(0.5) }}>
              <Texte style={{ fontWeight: '600' }}>{formaterDate(j.date)}</Texte>
              <Texte doux style={{ fontSize: 14 }}>
                {[
                  j.respect !== undefined ? `Plan : ${LIBELLES_RESPECT[j.respect].toLowerCase()} (${j.respect}/5)` : undefined,
                  j.eauL !== undefined ? `${formaterNombre(j.eauL)} L d’eau` : undefined,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </Texte>
              {j.repas && <Texte style={{ fontSize: 14 }}>{j.repas}</Texte>}
              {j.ressenti && <Texte style={{ fontSize: 14 }}>« {j.ressenti} »</Texte>}
            </View>
          ))}
        </Carte>
      )}
    </View>
  );
}
