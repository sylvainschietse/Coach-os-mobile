// NutritionProfile.tsx d'origine (N01) : « Ma nutrition », sous-rubriques Mon profil / Recettes / Ma semaine / Journal /
// Mes recettes, estimation Mifflin–St Jeor, profil alimentaire et, pour le coach, ajustement des objectifs.
// Le brouillon du formulaire reste sur l'appareil ; Recettes et Ma semaine utilisent le dernier profil enregistré.
import { Lock, RefreshCw } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';

import { nutrition, type ActionProfil, type DonneesNutrition } from '@/data/nutrition';
import { blankPreferences, calculate, macros, preferences, target, type Preferences, type Target } from '@/domain/nutrition/calcul';
import { brouillonsOuverts, demanderSortie, ecrireBrouillon, lireBrouillon } from '@/lib/brouillon';
import { nouvelId } from '@/lib/identifiant';

import { BoutonContour, Hero, Selecteur, SousNav, type OngletDef } from '../coque';
import { CaseACocher, Cellule, Grille, Repliable, Saisie } from '../crm/dossier';
import { Action, Etat, ts } from '../entrainement/commun';
import { couleurs, polices } from '../theme';
import { doux, Lien } from './commun';
import { InvitationOptionNutrition } from './invitation-option';
import { PersonnelNutrition } from './personnel';
import { Planificateur } from './planificateur';

export type SectionNutrition = 'profil' | 'recettes' | 'semaine' | 'journal' | 'personnelles';
const SECTIONS: OngletDef<SectionNutrition>[] = [
  { cle: 'profil', libelle: 'Mon profil' },
  { cle: 'recettes', libelle: 'Recettes' },
  { cle: 'semaine', libelle: 'Ma semaine' },
  { cle: 'journal', libelle: 'Journal' },
  { cle: 'personnelles', libelle: 'Mes recettes' },
];

const options = (l: string[][]) => l.map(([cle, libelle]) => ({ cle, libelle }));
const ACTIVITES = options([
  ['', 'Choisir…'],
  ['faible', 'Faible · quotidien surtout assis'],
  ['legere', 'Légère · marche et activité régulière'],
  ['moderee', 'Modérée · quotidien actif et entraînements'],
  ['elevee', 'Élevée · travail physique et entraînements soutenus'],
]);
const OBJECTIFS = options([
  ['maintien', 'Maintien'],
  ['perte', 'Perte de poids'],
  ['muscle', 'Prise de muscle'],
]);
const REGIMES = options([
  ['aucun', 'Aucun régime particulier'],
  ['vegetarien', 'Végétarien'],
  ['vegetalien', 'Végétalien'],
  ['pescetarien', 'Pescétarien'],
  ['autre', 'Autre'],
]);
const SEXES = options([
  ['', 'Choisir…'],
  ['homme', 'Homme'],
  ['femme', 'Femme'],
]);
const BUDGETS = options([
  ['libre', 'Non précisé'],
  ['economique', 'Économique'],
  ['modere', 'Modéré'],
]);
const REPAS = [1, 2, 3, 4, 5, 6].map((n) => ({ cle: String(n), libelle: String(n) }));
const TEXTES = [
  ['activites', 'Activités pratiquées', 500],
  ['habitudes', 'Mes habitudes (horaires, grignotage, organisation…)', 2000],
  ['allergies', 'Allergies et intolérances à prendre en compte', 1000],
  ['aime', 'Aliments que j’aime', 1000],
  ['exclut', 'Aliments à exclure', 1000],
] as const;

// Les nombres restent du texte pendant la saisie (champs `type=number` d'origine).
const toForm = (p: Preferences) => ({
  ...p,
  age: p.age === null ? '' : String(p.age),
  poids: p.poids === null ? '' : String(p.poids),
  taille: p.taille === null ? '' : String(p.taille),
  seances: String(p.seances),
  preparation: String(p.preparation),
});
type Form = ReturnType<typeof toForm>;
const nombre = (t: string) => Number(t.replace(',', '.').trim());

/** Les contrôles `min`/`max`/`required` du formulaire d'origine, avec un message lisible. */
function erreurFormulaire(f: Form) {
  if (f.age.trim() && (!Number.isInteger(nombre(f.age)) || nombre(f.age) < 1 || nombre(f.age) > 110)) return 'Âge : un nombre entier entre 1 et 110.';
  if (f.poids.trim() && !(nombre(f.poids) > 0 && nombre(f.poids) <= 500)) return 'Poids : entre 1 et 500 kg.';
  if (f.taille.trim() && !(nombre(f.taille) > 0 && nombre(f.taille) <= 300)) return 'Taille : entre 1 et 300 cm.';
  if (!Number.isInteger(nombre(f.seances || '0')) || nombre(f.seances || '0') < 0 || nombre(f.seances || '0') > 20) return 'Séances par semaine : entre 0 et 20.';
  if (!Number.isInteger(nombre(f.preparation)) || nombre(f.preparation) < 5 || nombre(f.preparation) > 180) return 'Préparation max. : entre 5 et 180 minutes.';
  return '';
}
const toPreferences = (f: Form) =>
  preferences.parse({
    ...f,
    age: f.age.trim() ? nombre(f.age) : null,
    poids: f.poids.trim() ? nombre(f.poids) : null,
    taille: f.taille.trim() ? nombre(f.taille) : null,
    seances: nombre(f.seances || '0'),
    preparation: nombre(f.preparation),
  });
const manuel = (t: Target | null) => ({
  calories: String(t?.calories || ''),
  proteinesPct: String(t?.proteinesPct ?? 20),
  lipidesPct: String(t?.lipidesPct ?? 30),
  glucidesPct: String(t?.glucidesPct ?? 50),
  note: t?.note || '',
});
type Manuel = ReturnType<typeof manuel>;
type Brouillon = { f: Form; m: Manuel; version: string; envoiId: string };

/** Sans l'option nutrition, le client garde son profil (macros) et son journal, sans recettes ni plan de repas. */
const SECTIONS_MACROS: SectionNutrition[] = ['profil', 'journal'];

export function NutritionProfil({ clientId, coach = false, optionNutrition = true }: { clientId: string; coach?: boolean; optionNutrition?: boolean }) {
  const [sectionChoisie, setSection] = useState<SectionNutrition>('profil');
  const section = sectionChoisie;
  // Sans l'option, Recettes, Ma semaine et Mes recettes restent visibles, avec un cadenas : elles montrent ce qu'elles apportent.
  const verrouillee = !optionNutrition && !SECTIONS_MACROS.includes(section);
  const cle = `coachos-nutrition:${clientId}:${coach ? 'coach' : 'client'}`;
  const [data, setData] = useState<DonneesNutrition | null>(null);
  const [f, setF] = useState<Form>(() => toForm(blankPreferences()));
  const [m, setM] = useState<Manuel>(() => manuel(null));
  const [chargement, setChargement] = useState(true);
  const [occupe, setOccupe] = useState(false);
  const [modifie, setModifie] = useState(false);
  const [erreur, setErreur] = useState('');
  const [message, setMessage] = useState('');
  const [jeton, setJeton] = useState(0);
  const verrou = useRef(false);
  const envoi = useRef(nouvelId());
  const version = useRef('');

  useEffect(() => {
    let actif = true;
    (async () => {
      try {
        const d = await nutrition.profil(clientId);
        const b = await lireBrouillon<Brouillon>(cle);
        if (!actif) return;
        setData(d);
        version.current = d.version;
        setErreur('');
        if (b?.f && b.m) {
          setF(b.f);
          setM(b.m);
          version.current = b.version;
          envoi.current = b.envoiId;
          setModifie(true);
          ecrireBrouillon(cle, b);
        } else {
          setF(toForm(d.preferences));
          setM(manuel(d.objectifCoach || d.calcul.cible));
          setModifie(false);
        }
      } catch (e) {
        if (actif) setErreur(e instanceof Error ? e.message : 'Nutrition indisponible');
      } finally {
        if (actif) setChargement(false);
      }
    })();
    return () => {
      actif = false;
      brouillonsOuverts.delete(cle);
    };
  }, [clientId, cle, jeton]);

  const brouillon = (suivant: Form, valeurs: Manuel) => {
    setF(suivant);
    setM(valeurs);
    setModifie(true);
    setMessage('');
    ecrireBrouillon(cle, { f: suivant, m: valeurs, version: version.current, envoiId: envoi.current });
  };

  const enregistrer = async (action: ActionProfil) => {
    if (verrou.current) return;
    setErreur('');
    setMessage('');
    let valeurs: { preferences?: Preferences; objectif?: Target } = {};
    if (action === 'preferences') {
      const e = erreurFormulaire(f);
      if (e) return setErreur(e);
      valeurs = { preferences: toPreferences(f) };
    } else if (action === 'coach') {
      const objectif = {
        calories: nombre(m.calories),
        proteinesPct: nombre(m.proteinesPct),
        lipidesPct: nombre(m.lipidesPct),
        glucidesPct: nombre(m.glucidesPct),
        note: m.note,
      };
      const r = target.safeParse(objectif);
      if (!r.success)
        return setErreur(
          r.error.issues.some((i) => i.path[0] === 'calories')
            ? 'Calories par jour : un nombre entier entre 1 et 10 000.'
            : r.error.issues.some((i) => !i.path.length)
              ? 'La répartition doit totaliser 100 %'
              : 'Chaque pourcentage est compris entre 0 et 100.',
        );
      valeurs = { objectif: r.data };
    }
    verrou.current = true;
    setOccupe(true);
    try {
      const d = await nutrition.enregistrerProfil(clientId, action, valeurs, version.current, envoi.current);
      setData(d);
      setF(toForm(d.preferences));
      setM(manuel(d.objectifCoach || d.calcul.cible));
      version.current = d.version;
      envoi.current = nouvelId();
      ecrireBrouillon(cle, null);
      setModifie(false);
      setMessage(
        action === 'preferences'
          ? 'Enregistré. Vos données et mensurations sont synchronisées ; les objectifs sont à jour.'
          : 'Enregistré. Les objectifs sont à jour.',
      );
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Enregistrement impossible');
    } finally {
      verrou.current = false;
      setOccupe(false);
    }
  };

  let calc = data?.calcul;
  try {
    if (!coach && !erreurFormulaire(f)) calc = calculate(toPreferences(f));
  } catch {
    calc = undefined;
  }
  const choisi = data?.objectifCoach || calc?.cible;
  const grammes = choisi ? macros(choisi) : null;

  if (chargement && !data)
    return (
      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
        <ActivityIndicator size="small" color={couleurs.texteDoux} />
        <Text style={ts.texte}>Chargement de la nutrition…</Text>
      </View>
    );

  const champ = (k: 'age' | 'poids' | 'taille', libelle: string) => (
    <Saisie libelle={libelle} type="nombre" valeur={f[k]} desactive={occupe || (k === 'age' && !!data?.dateNaissance)} onChange={(v) => brouillon({ ...f, [k]: v }, m)} />
  );
  const choix = (k: 'sexe' | 'activite' | 'objectif' | 'regime' | 'budget', libelle: string, liste: { cle: string; libelle: string }[]) => (
    <Selecteur libelle={libelle} options={liste} valeur={f[k]} onChange={(v) => brouillon({ ...f, [k]: v } as Form, m)} />
  );

  return (
    <View style={{ gap: 16 }}>
      <Hero
        kicker="Votre équilibre au quotidien"
        titre={coach ? `Nutrition · ${data?.nom || 'Client'}` : 'Ma nutrition'}
        sousTitre="Vos objectifs, vos repas et vos recettes réunis au même endroit."
        droite={
          <BoutonContour
            icone={RefreshCw}
            nom="Actualiser la nutrition"
            desactive={chargement || occupe}
            onPress={() =>
              demanderSortie(() => {
                ecrireBrouillon(cle, null);
                setModifie(false);
                setChargement(true);
                setJeton((j) => j + 1);
              }, [cle])
            }
          />
        }
      />
      <Etat erreur={erreur || undefined} message={message || undefined} />
      {data && (
        <>
          <SousNav
            nom="Rubriques Nutrition"
            grille="nutrition"
            onglets={optionNutrition ? SECTIONS : SECTIONS.map((o) => (SECTIONS_MACROS.includes(o.cle) ? o : { ...o, icone: Lock }))}
            valeur={section}
            onChange={(v) => v !== section && demanderSortie(() => setSection(v))}
          />
          {modifie && section !== 'profil' && (
            <Text style={[doux, { color: couleurs.rouge }]}>
              Votre profil contient des modifications non enregistrées. Les recettes et la proposition de semaine utilisent vos dernières préférences
              enregistrées.
            </Text>
          )}
          {verrouillee ? (
            <InvitationOptionNutrition />
          ) : section === 'journal' || section === 'personnelles' ? (
            <PersonnelNutrition key={`${clientId}:${section}`} data={data} vue={section} />
          ) : section !== 'profil' ? (
            <Planificateur data={data} vue={section} onVue={setSection} />
          ) : (
            <>
              <View style={{ borderRadius: 16, borderWidth: 1, borderColor: 'rgba(195,24,30,0.2)', backgroundColor: 'rgba(195,24,30,0.05)', padding: 16, gap: 12 }}>
                <Text style={[ts.kicker, { fontSize: 12 }]}>
                  {data.objectifCoach ? 'Objectifs définis par votre coach' : 'Objectifs estimés automatiquement'}
                  {modifie && !coach ? ' · aperçu non enregistré' : ''}
                </Text>
                {choisi && grammes ? (
                  <>
                    <Text style={{ fontFamily: polices.texteGras, fontSize: 30, color: couleurs.texte }}>
                      {choisi.calories.toLocaleString('fr-FR')} <Text style={{ fontFamily: polices.texte, fontSize: 14 }}>kcal / jour</Text>
                    </Text>
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      {(
                        [
                          ['Protéines', grammes.proteines, choisi.proteinesPct],
                          ['Lipides', grammes.lipides, choisi.lipidesPct],
                          ['Glucides', grammes.glucides, choisi.glucidesPct],
                        ] as const
                      ).map(([l, g, pct]) => (
                        <View key={l} style={{ flex: 1, borderRadius: 8, backgroundColor: couleurs.carte, padding: 8, alignItems: 'center' }}>
                          <Text style={doux}>{l}</Text>
                          <Text style={{ marginTop: 4, fontFamily: polices.texteGras, fontSize: 14, color: couleurs.texte }}>{g} g</Text>
                          <Text style={doux}>{pct} %</Text>
                        </View>
                      ))}
                    </View>
                    {!!choisi.note && <Text style={ts.texte}>{choisi.note}</Text>}
                  </>
                ) : (
                  <Text style={ts.texte}>{calc?.raison || 'Complétez votre profil pour obtenir une estimation.'}</Text>
                )}
                <Text style={doux}>
                  Point de départ estimé, à ajuster selon votre évolution. Répartition initiale 20 / 30 / 50, modifiable par le coach ; les grammes sont
                  arrondis.
                </Text>
                <Repliable resume="Comprendre le calcul">
                  <View style={{ gap: 8 }}>
                    <Text style={[doux, { color: couleurs.texte }]}>
                      Mifflin–St Jeor : métabolisme au repos estimé à {calc?.repos ?? '—'} kcal, multiplié par le coefficient global d’activité{' '}
                      {calc?.coefficient ?? '—'} = maintien à {calc?.entretien ?? '—'} kcal.
                    </Text>
                    <Text style={[doux, { color: couleurs.texte }]}>
                      Perte : −10 % ; maintien : sans ajustement ; prise de muscle : +5 %. Ce sont des réglages de départ, pas une mesure de votre dépense
                      réelle.
                    </Text>
                    <Text style={[doux, { color: couleurs.texte }]}>
                      L’activité choisie inclut le quotidien et les entraînements. Les séances indiquées ne sont pas ajoutées une deuxième fois.
                    </Text>
                    <Lien url="https://pubmed.ncbi.nlm.nih.gov/2305711/">Source de la formule</Lien>
                  </View>
                </Repliable>
              </View>

              {!coach && !optionNutrition && <InvitationOptionNutrition compacte onDecouvrir={() => setSection('semaine')} />}

              {coach && (
                <View style={[ts.carte, { padding: 16 }]}>
                  <Repliable resume={<Text style={ts.titreChamp}>Ajuster les objectifs du client</Text>}>
                    <View style={{ gap: 12 }}>
                      {(
                        [
                          ['calories', 'Calories par jour'],
                          ['proteinesPct', 'Protéines (%)'],
                          ['lipidesPct', 'Lipides (%)'],
                          ['glucidesPct', 'Glucides (%)'],
                        ] as const
                      ).map(([k, l]) => (
                        <Saisie key={k} libelle={l} type="nombre" valeur={m[k]} desactive={occupe} onChange={(v) => brouillon(f, { ...m, [k]: v })} />
                      ))}
                      <Text style={doux}>
                        Total des macros : {nombre(m.proteinesPct) + nombre(m.lipidesPct) + nombre(m.glucidesPct)} % · requis : 100 %
                      </Text>
                      <Saisie libelle="Note au client" long max={1500} valeur={m.note} desactive={occupe} onChange={(v) => brouillon(f, { ...m, note: v })} />
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                        <Action libelle="Publier ces objectifs" desactive={occupe} onPress={() => enregistrer('coach')} />
                        {data.objectifCoach && <Action libelle="Revenir au calcul automatique" variante="contour" desactive={occupe} onPress={() => enregistrer('auto')} />}
                      </View>
                    </View>
                  </Repliable>
                </View>
              )}

              <View style={[ts.carte, { borderRadius: 16, padding: 16 }]}>
                <Repliable ouvert={!coach} resume={<Text style={ts.titre}>{coach ? 'Profil et préférences du client' : 'Mon profil alimentaire'}</Text>}>
                  <View style={{ gap: 16 }}>
                    <Grille>
                      <Cellule>{choix('sexe', 'Sexe utilisé pour la formule', SEXES)}</Cellule>
                      <Cellule>{champ('age', 'Âge (ans)')}</Cellule>
                      <Cellule>{champ('poids', 'Poids (kg)')}</Cellule>
                      <Cellule>{champ('taille', 'Taille (cm)')}</Cellule>
                    </Grille>
                    <Text style={doux}>
                      Le poids est partagé avec vos mensurations : sa modification est enregistrée dans Mon suivi. Votre âge déclaré est conservé avec sa
                      date de saisie.
                    </Text>
                    {choix('activite', 'Activité globale, entraînements inclus', ACTIVITES)}
                    {choix('objectif', 'Mon objectif', OBJECTIFS)}
                    <Grille>
                      <Cellule>
                        <Saisie libelle="Séances par semaine" type="nombre" valeur={f.seances} desactive={occupe} onChange={(v) => brouillon({ ...f, seances: v }, m)} />
                      </Cellule>
                      <Cellule>
                        <Selecteur libelle="Repas par jour" options={REPAS} valeur={String(f.repas)} onChange={(v) => brouillon({ ...f, repas: Number(v) }, m)} />
                      </Cellule>
                    </Grille>
                    {choix('regime', 'Mon régime alimentaire', REGIMES)}
                    {TEXTES.map(([k, l, max]) => (
                      <Saisie key={k} libelle={l} long max={max} valeur={f[k]} desactive={occupe} onChange={(v) => brouillon({ ...f, [k]: v }, m)} />
                    ))}
                    <CaseACocher libelle="Privilégier les aliments de saison" valeur={f.saison} onChange={(v) => brouillon({ ...f, saison: v }, m)} />
                    <Grille>
                      <Cellule>
                        <Saisie
                          libelle="Préparation max. (minutes)"
                          type="nombre"
                          valeur={f.preparation}
                          desactive={occupe}
                          onChange={(v) => brouillon({ ...f, preparation: v }, m)}
                        />
                      </Cellule>
                      <Cellule>{choix('budget', 'Budget', BUDGETS)}</Cellule>
                    </Grille>
                    <CaseACocher
                      libelle="Situation nécessitant un suivi nutritionnel spécifique (grossesse, allaitement ou suivi médical)."
                      valeur={f.specifique}
                      onChange={(v) => brouillon({ ...f, specifique: v }, m)}
                    />
                    <Action
                      libelle={occupe ? 'Enregistrement…' : 'Enregistrer et calculer mes objectifs'}
                      chargement={occupe}
                      onPress={() => enregistrer('preferences')}
                    />
                    <Text style={doux}>
                      Ces préférences sont utilisées dans Recettes et Ma semaine. Enregistrez-les avant de proposer votre planning alimentaire.
                    </Text>
                  </View>
                </Repliable>
              </View>
            </>
          )}
        </>
      )}
    </View>
  );
}
