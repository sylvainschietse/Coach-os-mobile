// Activités libres : ce que le client a fait en dehors de son programme (un cours de RPM, une séance de muscu à lui…).
// Le client choisit l'activité dans un catalogue (ou tape son nom), indique la date, la durée et l'effort ressenti,
// et pour une séance de musculation ses exercices, séries, répétitions et charges, au clavier ou en dictée.
// Le coach voit la même chose, en lecture.
import { Minus, Plus, Trash2 } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';

import { depot } from '@/data';
import { activites } from '@/data/activites';
import {
  erreursActiviteLibre,
  formaterDistance,
  formaterDuree,
  heureParis,
  libelleSport,
  preparerActiviteLibre,
  RESSENTIS,
  resumeSeries,
  SPORTS,
  titreActivite,
  type Activite,
  type ActiviteLibre,
  type ExerciceLibre,
  type SerieLibre,
  type Sport,
} from '@/domain/activites';
import { activiteConnue, chercherActivites, estimerCalories } from '@/domain/catalogue-activites';
import { lireDictee } from '@/domain/dictee-seance';
import { ajouterJours, aujourdhuiParis, jourParis } from '@/domain/entrainement';
import { lireDate } from '@/domain/programmes';
import type { Exercice } from '@/domain/types';
import { nouvelId } from '@/lib/identifiant';
import { messageErreur, useCharger } from '@/lib/useCharger';

import { Bouton, Carte, ChampNombre, ChampTexte, Erreur, Puce, Puces, SousTitre, Texte } from '../composants';
import { BoutonDictee } from '../dictee';
import { ChoixExercice } from '../programmes/choix-exercice';
import { couleurs, espace, polices } from '../theme';

/** Suggestions quand le champ est vide : les activités qu'on déclare le plus souvent. */
const RAPIDES = ['Séance de musculation', 'Body Pump', 'RPM', 'Course à pied', 'Yoga Vinyasa', 'Pilates au sol', 'Aquagym', 'Padel'];
/** Sports pour lesquels on demande une distance (facultative). */
const AVEC_DISTANCE: Sport[] = ['course', 'trail', 'velo', 'marche', 'randonnee', 'natation'];

/** Activité libre affichée en détail : ressenti, note et exercices. */
export function DetailActiviteLibre({ a }: { a: Pick<Activite, 'ressenti' | 'note' | 'exercices'> }) {
  if (!a.ressenti && !a.note && !a.exercices?.length) return null;
  return (
    <View style={{ gap: espace(2), backgroundColor: couleurs.fond, borderRadius: 10, padding: espace(3) }}>
      {!!a.ressenti && (
        <Texte style={{ fontSize: 14 }}>
          Effort ressenti : <Texte style={{ fontSize: 14, fontFamily: polices.texteGras }}>{a.ressenti}/10</Texte> · {RESSENTIS[a.ressenti]}
        </Texte>
      )}
      {!!a.exercices?.length && (
        <View style={{ gap: espace(2) }}>
          {a.exercices.map((x, i) => (
            <View key={i} style={{ gap: 2 }}>
              <Texte style={{ fontSize: 14, fontFamily: polices.texteGras }}>{x.nom}</Texte>
              <Texte doux style={{ fontSize: 13 }}>{resumeSeries(x.series)}</Texte>
              <Texte doux style={{ fontSize: 12 }}>
                {x.series
                  .map((s) => [s.repetitions !== undefined ? `${s.repetitions}` : '', s.charge !== undefined ? `${s.charge} kg` : '', s.duree !== undefined ? `${s.duree} s` : '', s.distance !== undefined ? `${s.distance} m` : ''].filter(Boolean).join(' × '))
                  .join(' · ')}
              </Texte>
            </View>
          ))}
        </View>
      )}
      {!!a.note && <Texte style={{ fontSize: 14, fontStyle: 'italic' }}>« {a.note} »</Texte>}
    </View>
  );
}

/** Choix de l'activité : recherche dans le catalogue, ou nom libre avec sa catégorie. */
function ChoixActivite({ titre, sport, onChange }: { titre: string; sport: Sport | undefined; onChange: (titre: string, sport: Sport | undefined) => void }) {
  const [recherche, setRecherche] = useState(titre);
  const [ouvert, setOuvert] = useState(!titre);
  const resultats = useMemo(() => chercherActivites(recherche).slice(0, 8), [recherche]);
  const exact = activiteConnue(recherche);

  if (!ouvert)
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: espace(2) }}>
        <View style={{ flex: 1 }}>
          <Texte style={{ fontSize: 17, fontFamily: polices.texteGras }}>{titre || libelleSport(sport ?? 'autre')}</Texte>
          {sport && <Texte doux style={{ fontSize: 13 }}>{libelleSport(sport)}</Texte>}
        </View>
        <Pressable accessibilityRole="button" hitSlop={8} onPress={() => setOuvert(true)}>
          <Texte style={{ color: couleurs.rouge, fontSize: 14 }}>Changer</Texte>
        </Pressable>
      </View>
    );

  const choisir = (t: string, s: Sport | undefined) => {
    setRecherche(t);
    onChange(t, s);
    if (s) setOuvert(false);
  };
  return (
    <View style={{ gap: espace(2) }}>
      <ChampTexte libelle="Activité" valeur={recherche} onChange={setRecherche} placeholder="RPM, Body Pump, yoga, padel, aquagym…" />
      {!recherche.trim() ? (
        <Puces>
          {RAPIDES.map((n) => (
            <Puce key={n} libelle={n} onPress={() => choisir(n, activiteConnue(n)?.sport)} />
          ))}
        </Puces>
      ) : (
        <View style={{ gap: 0 }}>
          {resultats.map((a) => (
            <Pressable
              key={a.nom}
              accessibilityRole="button"
              onPress={() => choisir(a.nom, a.sport)}
              style={({ pressed }) => ({ paddingVertical: espace(2), borderTopWidth: 1, borderTopColor: couleurs.bordure, opacity: pressed ? 0.6 : 1 })}
            >
              <Texte style={{ fontSize: 15 }}>{a.nom}</Texte>
              <Texte doux style={{ fontSize: 12 }}>{libelleSport(a.sport)}</Texte>
            </Pressable>
          ))}
          {!exact && (
            <View style={{ gap: espace(2), paddingTop: espace(2), borderTopWidth: 1, borderTopColor: couleurs.bordure }}>
              <Texte doux style={{ fontSize: 13 }}>
                {resultats.length ? 'Pas dans la liste ? ' : 'Pas trouvée dans la liste. '}Garde « {recherche.trim()} » et choisis son type :
              </Texte>
              <Puces>
                {SPORTS.map((s) => (
                  <Puce key={s.cle} libelle={s.libelle} actif={titre === recherche.trim() && sport === s.cle} onPress={() => choisir(recherche.trim(), s.cle)} />
                ))}
              </Puces>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

const nombre = (t: string) => {
  const n = Number(t.replace(',', '.').trim());
  return t.trim() && Number.isFinite(n) ? n : undefined;
};

/** Les exercices d'une séance de musculation : dictée, bibliothèque, séries modifiables. */
function Exercices({ exercices, onChange }: { exercices: ExerciceLibre[]; onChange: (l: ExerciceLibre[]) => void }) {
  const [choix, setChoix] = useState(false);
  const [dictee, setDictee] = useState('');
  const [catalogue, setCatalogue] = useState<Exercice[]>();
  const [lecture, setLecture] = useState(false);
  const [message, setMessage] = useState('');

  const maj = (i: number, x: ExerciceLibre) => onChange(exercices.map((e, j) => (j === i ? x : e)));
  const majSerie = (i: number, k: number, s: SerieLibre) => maj(i, { ...exercices[i], series: exercices[i].series.map((v, j) => (j === k ? s : v)) });

  async function remplir() {
    setLecture(true);
    setMessage('');
    try {
      const cat = catalogue ?? (await depot.catalogue());
      setCatalogue(cat);
      const lus = lireDictee(dictee, cat);
      if (!lus.length) setMessage('Je n’ai reconnu aucun exercice. Essaie par exemple : « 3 séries de 10 squats à 40 kilos, puis 3 fois 12 pompes ».');
      else {
        onChange([...exercices, ...lus]);
        setDictee('');
        setMessage(`${lus.length} exercice${lus.length > 1 ? 's' : ''} ajouté${lus.length > 1 ? 's' : ''}. Vérifie et corrige si besoin.`);
      }
    } catch (e) {
      setMessage(messageErreur(e));
    } finally {
      setLecture(false);
    }
  }

  return (
    <View style={{ gap: espace(3) }}>
      <SousTitre>Exercices</SousTitre>
      <View style={{ gap: espace(2), backgroundColor: couleurs.fond, borderRadius: 10, padding: espace(3) }}>
        <Texte style={{ fontSize: 14 }}>Raconte ta séance, je remplis les exercices pour toi.</Texte>
        <ChampTexte
          libelle="Ta séance en quelques mots"
          valeur={dictee}
          onChange={setDictee}
          multiligne
          placeholder="3 séries de 10 squats à 40 kilos, puis développé couché 4 fois 8 à 30 kilos, puis gainage 3 fois 45 secondes"
        />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: espace(3), flexWrap: 'wrap' }}>
          <BoutonDictee valeur={dictee} onChange={setDictee} />
        </View>
        <Bouton variante="secondaire" libelle="Remplir les exercices" onPress={remplir} desactive={!dictee.trim()} chargement={lecture} />
        {!!message && <Texte doux style={{ fontSize: 13 }}>{message}</Texte>}
      </View>

      {exercices.map((x, i) => (
        <View key={i} style={{ gap: espace(2), borderTopWidth: 1, borderTopColor: couleurs.bordure, paddingTop: espace(3) }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: espace(2) }}>
            <View style={{ flex: 1 }}>
              <ChampTexte libelle={`Exercice ${i + 1}`} valeur={x.nom} onChange={(nom) => maj(i, { ...x, nom, exerciceId: nom === x.nom ? x.exerciceId : undefined })} />
              {!x.exerciceId && <Texte doux style={{ fontSize: 12 }}>Hors bibliothèque</Texte>}
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel={`Retirer ${x.nom}`} hitSlop={8} onPress={() => onChange(exercices.filter((_, j) => j !== i))}>
              <Trash2 size={20} color={couleurs.texteDoux} />
            </Pressable>
          </View>
          {x.series.map((s, k) => {
            const temps = !!x.mesures && x.mesures.includes('duree') && !x.mesures.includes('repetitions');
            return (
              <View key={k} style={{ flexDirection: 'row', alignItems: 'flex-end', gap: espace(2) }}>
                <Texte doux style={{ width: 54, fontSize: 13, paddingBottom: espace(3) }}>Série {k + 1}</Texte>
                {temps ? (
                  <View style={{ flex: 1 }}>
                    <ChampNombre libelle="Secondes" valeur={s.duree} suggestion={undefined} valide={false} onChange={(v) => majSerie(i, k, { ...s, duree: v })} />
                  </View>
                ) : (
                  <>
                    <View style={{ flex: 1 }}>
                      <ChampNombre libelle="Répétitions" valeur={s.repetitions} suggestion={undefined} valide={false} onChange={(v) => majSerie(i, k, { ...s, repetitions: v })} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <ChampNombre libelle="Charge (kg)" valeur={s.charge} suggestion={undefined} valide={false} onChange={(v) => majSerie(i, k, { ...s, charge: v })} />
                    </View>
                  </>
                )}
              </View>
            );
          })}
          <View style={{ flexDirection: 'row', gap: espace(4) }}>
            <Pressable
              accessibilityRole="button"
              hitSlop={8}
              disabled={x.series.length >= 20}
              onPress={() => maj(i, { ...x, series: [...x.series, { ...(x.series.at(-1) ?? {}) }] })}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
            >
              <Plus size={16} color={couleurs.rouge} />
              <Texte style={{ fontSize: 14, color: couleurs.rouge }}>Série</Texte>
            </Pressable>
            {x.series.length > 1 && (
              <Pressable
                accessibilityRole="button"
                hitSlop={8}
                onPress={() => maj(i, { ...x, series: x.series.slice(0, -1) })}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
              >
                <Minus size={16} color={couleurs.texteDoux} />
                <Texte doux style={{ fontSize: 14 }}>Série</Texte>
              </Pressable>
            )}
          </View>
        </View>
      ))}

      {choix ? (
        <ChoixExercice
          titre="Ajouter un exercice"
          onFermer={() => setChoix(false)}
          onChoisir={(e) => {
            onChange([...exercices, { exerciceId: e.id, nom: e.nom, mesures: e.mesures, series: [{}, {}, {}] }]);
            setChoix(false);
          }}
        />
      ) : (
        <Bouton variante="discret" libelle="Ajouter un exercice de la bibliothèque" onPress={() => setChoix(true)} desactive={exercices.length >= 40} />
      )}
    </View>
  );
}

type Jour = 'aujourdhui' | 'hier' | 'avant-hier' | 'autre';

/** Formulaire d'ajout ou de correction d'une activité libre, sur le téléphone du client. */
export function FormulaireActiviteLibre({
  clientId,
  existante,
  onFermer,
  onEnregistre,
}: {
  clientId: string;
  existante?: Activite;
  onFermer: () => void;
  onEnregistre: () => void;
}) {
  const aujourdhui = aujourdhuiParis();
  const jourExistant = existante ? jourParis(existante.debut) : aujourdhui;
  const [titre, setTitre] = useState(existante?.titre ?? '');
  const [sport, setSport] = useState<Sport | undefined>(existante?.sport);
  const [jour, setJour] = useState<Jour>(
    jourExistant === aujourdhui ? 'aujourdhui' : jourExistant === ajouterJours(aujourdhui, -1) ? 'hier' : jourExistant === ajouterJours(aujourdhui, -2) ? 'avant-hier' : 'autre',
  );
  const [autreDate, setAutreDate] = useState(jourExistant.split('-').reverse().join('/'));
  const [minutes, setMinutes] = useState<number | undefined>(existante ? Math.round(existante.dureeS / 60) : undefined);
  const [km, setKm] = useState(existante?.distanceM ? String(existante.distanceM / 1000).replace('.', ',') : '');
  const [ressenti, setRessenti] = useState<number | undefined>(existante?.ressenti);
  const [note, setNote] = useState(existante?.note ?? '');
  const [exercices, setExercices] = useState<ExerciceLibre[]>(existante?.exercices ?? []);
  const [avecExercices, setAvecExercices] = useState(!!existante?.exercices?.length);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState('');
  // Dernier poids connu du client, pour estimer la dépense (70 kg sinon).
  const poids = useCharger(async () => (await depot.mensurations(clientId).catch(() => [])).find((m) => m.poidsKg)?.poidsKg, `poids-${clientId}`);
  const calories = sport && minutes ? estimerCalories({ sport, titre, dureeS: minutes * 60, ressenti }, poids.donnee) : undefined;
  // Kcal données par le client (montre, machine de la salle) : elles remplacent l'estimation.
  const [kcal, setKcal] = useState('');
  const [kcalLues, setKcalLues] = useState(!existante?.calories);
  if (!kcalLues && (poids.donnee !== null || poids.erreur) && existante?.calories) {
    setKcalLues(true);
    // À la modification : on ne reprend le chiffre que s'il avait été saisi (différent de l'estimation).
    const estimee = estimerCalories({ sport: existante.sport, titre: existante.titre ?? '', dureeS: existante.dureeS, ressenti: existante.ressenti }, poids.donnee);
    if (existante.calories !== estimee) setKcal(String(existante.calories));
  }
  const kcalSaisies = nombre(kcal);

  const date =
    jour === 'aujourdhui' ? aujourdhui : jour === 'hier' ? ajouterJours(aujourdhui, -1) : jour === 'avant-hier' ? ajouterJours(aujourdhui, -2) : lireDate(autreDate);
  const montrerExercices = sport === 'musculation' || avecExercices;

  function saisie(): ActiviteLibre | string {
    if (!sport) return 'Choisis une activité dans la liste, ou garde ton nom et choisis son type.';
    if (!date) return 'Date invalide : écris-la comme 26/10.';
    const dureeS = Math.round((minutes ?? 0) * 60);
    // L'heure exacte compte peu : midi ce jour-là, ou maintenant moins la durée si c'est aujourd'hui avant midi.
    const debut = date === aujourdhui ? new Date(Math.min(Date.parse(heureParis(date, 12)), Date.now() - dureeS * 1000)).toISOString() : heureParis(date, 12);
    const distance = nombre(km);
    return {
      id: existante?.id ?? nouvelId(),
      sport,
      titre: titre.trim(),
      debut: existante && jourParis(existante.debut) === date ? existante.debut : debut,
      dureeS,
      distanceM: distance !== undefined && AVEC_DISTANCE.includes(sport) ? Math.round(distance * 1000) : undefined,
      ressenti,
      note,
      exercices: montrerExercices ? exercices : [],
      calories: kcalSaisies !== undefined ? Math.round(kcalSaisies) : estimerCalories({ sport, titre, dureeS, ressenti }, poids.donnee),
    };
  }

  async function enregistrer() {
    setErreur('');
    const s = saisie();
    if (typeof s === 'string') return setErreur(s);
    const erreurs = erreursActiviteLibre(preparerActiviteLibre(s));
    if (erreurs.length) return setErreur(erreurs.join(' '));
    setEnCours(true);
    try {
      await activites.enregistrerLibre(clientId, s);
      onEnregistre();
    } catch (e) {
      setErreur(messageErreur(e));
    } finally {
      setEnCours(false);
    }
  }

  return (
    <Carte style={{ borderColor: couleurs.noir, borderWidth: 2 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <SousTitre>{existante ? 'Modifier mon activité' : 'J’ai fait une autre activité'}</SousTitre>
        <Pressable accessibilityRole="button" onPress={onFermer} hitSlop={12}>
          <Texte doux>Fermer</Texte>
        </Pressable>
      </View>
      <Texte doux style={{ fontSize: 13 }}>Ton coach la verra dans ton suivi. Elle s’ajoute à ton programme sans rien y changer.</Texte>

      <ChoixActivite
        titre={titre}
        sport={sport}
        onChange={(t, s) => {
          setTitre(t);
          setSport(s);
        }}
      />

      <View style={{ gap: espace(2) }}>
        <Texte style={{ fontSize: 14 }}>Quand ?</Texte>
        <Puces>
          <Puce libelle="Aujourd’hui" actif={jour === 'aujourdhui'} onPress={() => setJour('aujourdhui')} />
          <Puce libelle="Hier" actif={jour === 'hier'} onPress={() => setJour('hier')} />
          <Puce libelle="Avant-hier" actif={jour === 'avant-hier'} onPress={() => setJour('avant-hier')} />
          <Puce libelle="Autre jour" actif={jour === 'autre'} onPress={() => setJour('autre')} />
        </Puces>
        {jour === 'autre' && <ChampTexte libelle="Date" valeur={autreDate} onChange={setAutreDate} placeholder="26/10" erreur={autreDate && !date ? 'Écris la date comme 26/10' : undefined} />}
      </View>

      <View style={{ flexDirection: 'row', gap: espace(3) }}>
        <View style={{ flex: 1 }}>
          <ChampNombre libelle="Durée (minutes)" valeur={minutes} suggestion={45} valide={false} onChange={setMinutes} />
        </View>
        {sport && AVEC_DISTANCE.includes(sport) && (
          <View style={{ flex: 1 }}>
            <ChampTexte libelle="Distance (km)" valeur={km} onChange={setKm} type="nombre" placeholder="facultatif" />
          </View>
        )}
      </View>

      <View style={{ gap: espace(2) }}>
        <Texte style={{ fontSize: 14 }}>
          Effort ressenti{ressenti ? ` : ${ressenti}/10 · ${RESSENTIS[ressenti]}` : ' (de 1, très facile, à 10, maximal)'}
        </Texte>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: espace(1) }}>
          {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
            <Pressable
              key={n}
              accessibilityRole="button"
              accessibilityLabel={`Effort ${n} sur 10, ${RESSENTIS[n]}`}
              accessibilityState={{ selected: ressenti === n }}
              onPress={() => setRessenti(ressenti === n ? undefined : n)}
              style={{
                width: 36,
                height: 36,
                borderRadius: 18,
                alignItems: 'center',
                justifyContent: 'center',
                borderWidth: 1,
                borderColor: ressenti === n ? couleurs.rouge : couleurs.bordure,
                backgroundColor: ressenti === n ? couleurs.rouge : couleurs.carte,
              }}
            >
              <Texte style={{ fontSize: 14, color: ressenti === n ? '#FFFFFF' : couleurs.texte }}>{n}</Texte>
            </Pressable>
          ))}
        </View>
      </View>

      <View style={{ gap: espace(1) }}>
        <ChampTexte libelle="Kcal dépensées (si tu les connais)" valeur={kcal} onChange={setKcal} type="nombre" placeholder={calories ? `environ ${calories}` : 'facultatif'} />
        {kcalSaisies === undefined && !!calories && (
          <Texte doux style={{ fontSize: 13 }}>
            Sinon, dépense estimée : environ {calories} kcal{poids.donnee ? '' : ' (calculée pour 70 kg, ajoute ton poids dans tes mensurations pour l’affiner)'}.
          </Texte>
        )}
      </View>

      {montrerExercices ? (
        <Exercices exercices={exercices} onChange={setExercices} />
      ) : (
        sport && <Bouton variante="discret" libelle="Détailler mes exercices" onPress={() => setAvecExercices(true)} />
      )}

      <View style={{ gap: espace(1) }}>
        <ChampTexte libelle="Note pour ton coach (facultatif)" valeur={note} onChange={setNote} multiligne placeholder="Comment ça s’est passé, une douleur, une remarque…" />
        <BoutonDictee valeur={note} onChange={setNote} />
      </View>

      {!!erreur && <Erreur message={erreur} />}
      <Bouton libelle={existante ? 'Enregistrer les modifications' : 'Enregistrer mon activité'} onPress={enregistrer} chargement={enCours} />
    </Carte>
  );
}

/** Bouton « J'ai fait une autre activité » et son formulaire, pour l'accueil du client. */
export function AjoutActiviteLibre({ clientId, onEnregistre }: { clientId: string; onEnregistre?: () => void }) {
  const [ouvert, setOuvert] = useState(false);
  const [merci, setMerci] = useState('');
  if (ouvert)
    return (
      <FormulaireActiviteLibre
        clientId={clientId}
        onFermer={() => setOuvert(false)}
        onEnregistre={() => {
          setOuvert(false);
          setMerci('C’est noté, ton coach la verra dans ton suivi.');
          onEnregistre?.();
        }}
      />
    );
  return (
    <Carte>
      <SousTitre>Tu as fait autre chose ?</SousTitre>
      <Texte doux style={{ fontSize: 14 }}>Un cours collectif, une séance à toi, un match… Ajoute-le pour que ton coach ait ta vraie semaine.</Texte>
      {!!merci && <Texte style={{ fontSize: 14, color: couleurs.vert }}>{merci}</Texte>}
      <Bouton
        libelle="J’ai fait une autre activité"
        onPress={() => {
          setMerci('');
          setOuvert(true);
        }}
      />
    </Carte>
  );
}

/** Une ligne courte pour les listes du coach : « RPM · Cours collectif · 45 min · 7/10 ». */
export function resumeActivite(a: Activite) {
  return [
    titreActivite(a),
    // « RPM · Cours collectif », mais pas « Séance de musculation · Musculation ».
    a.titre && !a.titre.toLowerCase().includes(libelleSport(a.sport).toLowerCase()) ? libelleSport(a.sport) : '',
    formaterDuree(a.dureeS).replace(/ 00$/, ''),
    a.distanceM ? formaterDistance(a.distanceM) : '',
    a.calories ? `≈ ${a.calories} kcal` : '',
    a.ressenti ? `effort ${a.ressenti}/10` : '',
    a.exercices?.length ? `${a.exercices.length} exercice${a.exercices.length > 1 ? 's' : ''}` : '',
  ]
    .filter(Boolean)
    .join(' · ');
}

