import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';

import { alimentation } from '@/data/alimentation';
import { erreursAliment, macrosPour, rechercherAliments, totalRecette } from '@/domain/alimentation';
import { formaterNombre, lireNombre } from '@/domain/suivi';
import type { Aliment, Contient, Recette } from '@/domain/types';
import { useCharger } from '@/lib/useCharger';

import { Bouton, Carte, Chargement, ChampTexte, Erreur, Puce, Puces, SousTitre, Texte } from '../composants';
import { couleurs, espace } from '../theme';
import { chargerAliments, LigneMacros, oublierAliments } from './commun';
import { Scanner } from './scanner';

export type Auteur = { clientId: string } | { coachId: string };

const CONTIENT: { cle: Contient; libelle: string }[] = [
  { cle: 'viande', libelle: 'Viande' },
  { cle: 'poisson', libelle: 'Poisson' },
  { cle: 'fruits_de_mer', libelle: 'Fruits de mer' },
  { cle: 'oeuf', libelle: 'Œuf' },
  { cle: 'lait', libelle: 'Lait' },
  { cle: 'gluten', libelle: 'Gluten' },
  { cle: 'miel', libelle: 'Miel' },
];

function Quantite({
  aliment,
  onValider,
  onRetour,
  libelleBouton,
}: {
  aliment: Aliment;
  onValider: (grammes: number) => void;
  onRetour: () => void;
  libelleBouton: string;
}) {
  const [grammes, setGrammes] = useState(String(aliment.portionG ?? 100));
  const g = lireNombre(grammes);
  const valide = g !== undefined && g > 0 && g <= 5000;
  return (
    <View style={{ gap: espace(3) }}>
      <View style={{ gap: espace(1) }}>
        <SousTitre>{aliment.nom}</SousTitre>
        {aliment.marque && <Texte doux style={{ fontSize: 14 }}>{aliment.marque}</Texte>}
        <Texte doux style={{ fontSize: 13 }}>
          Pour 100 g : {formaterNombre(aliment.kcal)} kcal · P {formaterNombre(aliment.proteines)} · G {formaterNombre(aliment.glucides)} · L{' '}
          {formaterNombre(aliment.lipides)}
          {aliment.source === 'base' ? ' (valeurs moyennes)' : aliment.source === 'off' ? ' (Open Food Facts)' : ''}
        </Texte>
      </View>
      <Puces>
        {aliment.portionG && (
          <Puce
            libelle={`${aliment.portionLibelle ?? '1 portion'} (${formaterNombre(aliment.portionG)} g)`}
            actif={grammes === String(aliment.portionG)}
            onPress={() => setGrammes(String(aliment.portionG))}
          />
        )}
        {[50, 100, 150, 200].map((q) => (
          <Puce key={q} libelle={`${q} g`} actif={grammes === String(q)} onPress={() => setGrammes(String(q))} />
        ))}
      </Puces>
      <ChampTexte libelle="Quantité (g ou ml)" type="nombre" valeur={grammes} onChange={setGrammes} />
      {valide && <LigneMacros m={macrosPour(aliment, g!)} taille={15} />}
      <Bouton libelle={libelleBouton} onPress={() => valide && onValider(g!)} desactive={!valide} />
      <Bouton variante="discret" libelle="Choisir un autre aliment" onPress={onRetour} />
    </View>
  );
}

function Creation({ nomDepart, codeBarres, auteur, onCree, onAnnuler }: {
  nomDepart: string;
  codeBarres?: string;
  auteur: Auteur;
  onCree: (a: Aliment) => void;
  onAnnuler: () => void;
}) {
  const [nom, setNom] = useState(nomDepart);
  const [marque, setMarque] = useState('');
  const [v, setV] = useState({ kcal: '', proteines: '', glucides: '', lipides: '', portion: '' });
  const [contient, setContient] = useState<Contient[]>([]);
  const [erreurs, setErreurs] = useState<string[]>([]);
  const [enCours, setEnCours] = useState(false);

  async function creer() {
    const a = {
      nom: nom.trim(),
      marque: marque.trim() || undefined,
      codeBarres,
      kcal: lireNombre(v.kcal) as number,
      proteines: lireNombre(v.proteines) as number,
      glucides: lireNombre(v.glucides) as number,
      lipides: lireNombre(v.lipides) as number,
      portionG: lireNombre(v.portion),
      contient,
    };
    const liste = erreursAliment(a);
    setErreurs(liste);
    if (liste.length) return;
    setEnCours(true);
    try {
      const cree = await alimentation.ajouterAliment(a, auteur);
      oublierAliments();
      onCree(cree);
    } catch (e) {
      setErreurs([e instanceof Error ? e.message : 'Création impossible']);
    } finally {
      setEnCours(false);
    }
  }

  return (
    <View style={{ gap: espace(3) }}>
      <SousTitre>Nouvel aliment</SousTitre>
      <Texte doux style={{ fontSize: 14 }}>Recopie les valeurs pour 100 g indiquées sur l’emballage.</Texte>
      <ChampTexte libelle="Nom" valeur={nom} onChange={setNom} />
      <ChampTexte libelle="Marque (facultatif)" valeur={marque} onChange={setMarque} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: espace(3) }}>
        {(
          [
            ['kcal', 'Calories (kcal)'],
            ['proteines', 'Protéines (g)'],
            ['glucides', 'Glucides (g)'],
            ['lipides', 'Lipides (g)'],
            ['portion', 'Une portion (g, facultatif)'],
          ] as const
        ).map(([cle, libelle]) => (
          <View key={cle} style={{ flexBasis: '46%', flexGrow: 1 }}>
            <ChampTexte libelle={libelle} type="nombre" valeur={v[cle]} onChange={(t) => setV({ ...v, [cle]: t })} />
          </View>
        ))}
      </View>
      <Texte doux style={{ fontSize: 14 }}>Il contient :</Texte>
      <Puces>
        {CONTIENT.map((c) => (
          <Puce
            key={c.cle}
            libelle={c.libelle}
            actif={contient.includes(c.cle)}
            onPress={() => setContient(contient.includes(c.cle) ? contient.filter((x) => x !== c.cle) : [...contient, c.cle])}
          />
        ))}
      </Puces>
      {erreurs.length > 0 && <Erreur message={erreurs.join('\n')} />}
      <Bouton libelle="Créer l’aliment" onPress={creer} chargement={enCours} />
      <Bouton variante="discret" libelle="Annuler" onPress={onAnnuler} />
    </View>
  );
}

/**
 * Choisir un aliment et sa quantité : recherche dans la base, scan du code-barres, ou création.
 * `recettes` : propose aussi les recettes (journal des repas).
 */
export function ChoixAliment({
  auteur,
  coachId,
  titre,
  libelleBouton = 'Ajouter',
  recettes,
  onChoisir,
  onChoisirRecette,
  onFermer,
}: {
  auteur: Auteur;
  coachId?: string;
  titre: string;
  libelleBouton?: string;
  recettes?: Recette[];
  onChoisir: (a: Aliment, grammes: number, source: 'saisie' | 'scan') => void;
  onChoisirRecette?: (r: Recette, portions: number) => void;
  onFermer: () => void;
}) {
  const { donnee: aliments, erreur, recharger } = useCharger(chargerAliments, 'aliments');
  const [recherche, setRecherche] = useState('');
  const [mode, setMode] = useState<'recherche' | 'scan' | 'creation'>('recherche');
  const [choisi, setChoisi] = useState<{ aliment: Aliment; source: 'saisie' | 'scan' }>();
  const [recette, setRecette] = useState<Recette>();
  const [portions, setPortions] = useState('1');
  const [codeInconnu, setCodeInconnu] = useState<string>();
  const [scanEnCours, setScanEnCours] = useState(false);
  const [erreurScan, setErreurScan] = useState<string>();

  const trouves = useMemo(() => (aliments ? rechercherAliments(aliments, recherche) : []), [aliments, recherche]);
  const recettesTrouvees = useMemo(() => {
    const mots = recherche.trim().toLowerCase();
    return (recettes ?? []).filter((r) => !mots || r.titre.toLowerCase().includes(mots)).slice(0, 8);
  }, [recettes, recherche]);

  async function code(c: string) {
    setScanEnCours(true);
    setErreurScan(undefined);
    try {
      const a = await alimentation.alimentParCode(c, coachId);
      if (a) {
        oublierAliments();
        recharger();
        setChoisi({ aliment: a, source: 'scan' });
        setMode('recherche');
      } else {
        setCodeInconnu(c);
        setMode('creation');
      }
    } catch (e) {
      setErreurScan(e instanceof Error ? e.message : 'Recherche impossible');
    } finally {
      setScanEnCours(false);
    }
  }

  let contenu;
  if (choisi) {
    contenu = (
      <Quantite
        aliment={choisi.aliment}
        libelleBouton={libelleBouton}
        onValider={(g) => onChoisir(choisi.aliment, g, choisi.source)}
        onRetour={() => setChoisi(undefined)}
      />
    );
  } else if (recette) {
    const p = lireNombre(portions);
    const { parPortion } = totalRecette(recette);
    contenu = (
      <View style={{ gap: espace(3) }}>
        <SousTitre>{recette.titre}</SousTitre>
        <Texte doux style={{ fontSize: 14 }}>Par portion :</Texte>
        <LigneMacros m={parPortion} />
        <Puces>
          {[0.5, 1, 1.5, 2].map((q) => (
            <Puce key={q} libelle={`${formaterNombre(q)} portion${q > 1 ? 's' : ''}`} actif={portions === String(q)} onPress={() => setPortions(String(q))} />
          ))}
        </Puces>
        <ChampTexte libelle="Portions" type="nombre" valeur={portions.replace('.', ',')} onChange={setPortions} />
        <Bouton libelle={libelleBouton} onPress={() => p && p > 0 && onChoisirRecette?.(recette, p)} desactive={!p || p <= 0 || p > 20} />
        <Bouton variante="discret" libelle="Retour" onPress={() => setRecette(undefined)} />
      </View>
    );
  } else if (mode === 'scan') {
    contenu = (
      <View style={{ gap: espace(3) }}>
        {scanEnCours ? <Chargement /> : <Scanner onCode={code} onFermer={() => setMode('recherche')} />}
        {erreurScan && <Erreur message={erreurScan} />}
      </View>
    );
  } else if (mode === 'creation') {
    contenu = (
      <View style={{ gap: espace(3) }}>
        {codeInconnu && (
          <Texte style={{ fontSize: 14 }}>
            Le code {codeInconnu} n’est ni dans la base ni sur Open Food Facts (ou ses valeurs nutritionnelles manquent). Crée-le une fois : il
            sera reconnu la prochaine fois.
          </Texte>
        )}
        <Creation
          nomDepart={recherche}
          codeBarres={codeInconnu}
          auteur={auteur}
          onCree={(a) => (setChoisi({ aliment: a, source: codeInconnu ? 'scan' : 'saisie' }), setCodeInconnu(undefined), setMode('recherche'))}
          onAnnuler={() => (setCodeInconnu(undefined), setMode('recherche'))}
        />
      </View>
    );
  } else {
    contenu = (
      <View style={{ gap: espace(3) }}>
        <ChampTexte libelle="Rechercher un aliment" valeur={recherche} onChange={setRecherche} placeholder="riz, skyr, poulet…" />
        <View style={{ flexDirection: 'row', gap: espace(2) }}>
          <View style={{ flex: 1 }}>
            <Bouton variante="secondaire" libelle="Scanner" onPress={() => setMode('scan')} />
          </View>
          <View style={{ flex: 1 }}>
            <Bouton variante="discret" libelle="Créer" onPress={() => setMode('creation')} />
          </View>
        </View>
        {erreur && <Erreur message={erreur} />}
        {!aliments && !erreur && <Chargement />}
        {recettesTrouvees.length > 0 && (
          <View style={{ gap: espace(1) }}>
            <Texte doux style={{ fontSize: 13 }}>Recettes</Texte>
            {recettesTrouvees.map((r) => (
              <Pressable key={r.id} accessibilityRole="button" onPress={() => setRecette(r)} style={styles.ligne}>
                <Texte style={{ fontSize: 15 }}>{r.titre}</Texte>
                <LigneMacros m={totalRecette(r).parPortion} taille={13} />
              </Pressable>
            ))}
          </View>
        )}
        {recherche.trim() !== '' && aliments && trouves.length === 0 && (
          <Texte doux style={{ fontSize: 14 }}>Rien trouvé. Scanne le paquet, ou crée l’aliment.</Texte>
        )}
        {trouves.map((a) => (
          <Pressable key={a.id} accessibilityRole="button" onPress={() => setChoisi({ aliment: a, source: 'saisie' })} style={styles.ligne}>
            <Texte style={{ fontSize: 15 }}>
              {a.nom}
              {a.marque ? <Texte doux style={{ fontSize: 13 }}> · {a.marque}</Texte> : null}
            </Texte>
            <Texte doux style={{ fontSize: 13 }}>
              {formaterNombre(a.kcal)} kcal · P {formaterNombre(a.proteines)} g pour 100 g
            </Texte>
          </Pressable>
        ))}
      </View>
    );
  }

  return (
    <Carte style={{ borderColor: couleurs.noir, borderWidth: 2 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <SousTitre>{titre}</SousTitre>
        <Pressable accessibilityRole="button" onPress={onFermer} hitSlop={8}>
          <Texte doux>Fermer</Texte>
        </Pressable>
      </View>
      {contenu}
    </Carte>
  );
}

const styles = {
  ligne: { borderTopWidth: 1, borderTopColor: couleurs.bordure, paddingVertical: espace(2), gap: espace(0.5) },
} as const;
