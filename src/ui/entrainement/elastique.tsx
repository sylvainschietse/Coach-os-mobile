// Élastique d'un exercice : le choix de la couleur par le coach (avec la force de chaque couleur en légende) et la
// pastille que voit le client pendant sa séance.
import { useEffect, useState, type ReactNode } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import { elastiques } from '@/data/elastiques';
import {
  couleursProposees,
  elastiqueDepuis,
  LIBELLES_SENS,
  REGLAGES_ELASTIQUES,
  texteElastique,
  type CouleurElastique,
  type ElastiqueLigne,
  type ReglagesElastiques,
  type SensElastique,
} from '@/domain/elastiques';
import { etatA11y } from '@/lib/accessibilite';

import { CaseACocher, Repliable } from '../crm/dossier';
import { couleurs, polices } from '../theme';
import { Action, ts } from './commun';

/** Rond de couleur ; le noir garde un liseré pour rester visible sur fond sombre. */
export function Rond({ hex, taille = 14 }: { hex: string; taille?: number }) {
  return <View style={{ width: taille, height: taille, borderRadius: taille / 2, backgroundColor: hex, borderWidth: 1, borderColor: 'rgba(128,128,128,0.55)' }} />;
}

/** « ● Élastique rouge · aide ≈ 7–16 kg » sous le nom de l'exercice. */
export function PastilleElastique({ e, sombre }: { e: ElastiqueLigne; sombre?: boolean }) {
  return (
    <View
      accessibilityLabel={texteElastique(e)}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'flex-start',
        gap: 8,
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: sombre ? 'rgba(255,255,255,0.18)' : couleurs.bordure,
        backgroundColor: sombre ? 'rgba(255,255,255,0.06)' : couleurs.carte,
      }}
    >
      <Rond hex={e.hex} />
      <Text style={{ fontFamily: polices.texteMoyen, fontSize: 13, color: sombre ? '#E6E7EA' : couleurs.texte }}>{texteElastique(e)}</Text>
    </View>
  );
}

function Pilule({ choisi, onPress, children, nom }: { choisi: boolean; onPress: () => void; children: ReactNode; nom: string }) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={nom}
      {...etatA11y({ checked: choisi })}
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        minHeight: 44,
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 10,
        borderWidth: choisi ? 2 : 1,
        borderColor: choisi ? couleurs.rouge : couleurs.saisie,
        backgroundColor: choisi ? couleurs.rougeClair : couleurs.carte,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      {children}
    </Pressable>
  );
}

/** Réglages du coach : la force de chaque couleur et les couleurs qu'il a. */
function MesElastiques({ reglages, onEnregistre }: { reglages: ReglagesElastiques; onEnregistre: (r: ReglagesElastiques) => void }) {
  const [brouillon, setBrouillon] = useState(reglages);
  const [etat, setEtat] = useState<{ occupe?: boolean; message?: string; erreur?: string }>({});
  const maj = (cle: CouleurElastique['cle'], patch: Partial<CouleurElastique>) =>
    setBrouillon({ couleurs: brouillon.couleurs.map((c) => (c.cle === cle ? { ...c, ...patch } : c)) });

  const enregistrer = async () => {
    setEtat({ occupe: true });
    try {
      await elastiques.enregistrer(brouillon);
      onEnregistre(brouillon);
      setEtat({ message: 'Enregistré : ces forces s’appliquent aux prochains exercices que tu règles.' });
    } catch (e) {
      setEtat({ erreur: e instanceof Error ? e.message : 'Échec de l’enregistrement' });
    }
  };

  return (
    <View style={{ gap: 8 }}>
      <Text style={ts.doux}>Écris la force indiquée sur tes élastiques et décoche les couleurs que tu n’as pas.</Text>
      {brouillon.couleurs.map((c) => (
        <View key={c.cle} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, width: 92 }}>
            <Rond hex={c.hex} taille={16} />
            <Text style={[ts.texte, { fontFamily: polices.texteMoyen }]}>{c.nom}</Text>
          </View>
          <TextInput
            accessibilityLabel={`Force de l’élastique ${c.nom.toLowerCase()}`}
            value={c.force}
            maxLength={30}
            placeholder="7–16 kg"
            placeholderTextColor={couleurs.suggestion}
            onChangeText={(t) => maj(c.cle, { force: t })}
            style={{
              flex: 1,
              minWidth: 0,
              height: 40,
              borderWidth: 1,
              borderColor: couleurs.saisie,
              borderRadius: 8,
              paddingHorizontal: 10,
              fontFamily: polices.texte,
              fontSize: 14,
              color: couleurs.texte,
              backgroundColor: couleurs.carte,
            }}
          />
          <CaseACocher petite libelle="Je l’ai" valeur={c.active} onChange={(v) => maj(c.cle, { active: v })} />
        </View>
      ))}
      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
        <Action petit libelle="Enregistrer mes élastiques" chargement={etat.occupe} onPress={enregistrer} />
        <Action petit variante="fantome" libelle="Repères de départ" onPress={() => setBrouillon(REGLAGES_ELASTIQUES)} />
      </View>
      {etat.message && <Text style={[ts.doux, { color: couleurs.vert }]}>{etat.message}</Text>}
      {etat.erreur && (
        <Text accessibilityRole="alert" style={ts.erreur}>
          {etat.erreur}
        </Text>
      )}
    </View>
  );
}

/**
 * Choix de l'élastique dans la fiche d'un exercice : aide ou résistance, puis la couleur. Chaque couleur affiche sa
 * force, ce qui sert de légende ; « Ajuster mes élastiques » règle ces forces pour coller au matériel du coach.
 */
export function ChoixElastique({
  valeur,
  sensConseille,
  onChange,
}: {
  valeur?: ElastiqueLigne;
  /** Sens proposé pour cet exercice (aide pour une traction, résistance pour un rowing élastique). */
  sensConseille: SensElastique;
  onChange: (e?: ElastiqueLigne) => void;
}) {
  const [reglages, setReglages] = useState<{ r: ReglagesElastiques; lus: boolean }>({ r: REGLAGES_ELASTIQUES, lus: false });
  const [sensChoisi, setSens] = useState<SensElastique>();
  const sens = valeur?.sens ?? sensChoisi ?? sensConseille;
  useEffect(() => {
    let actif = true;
    elastiques.lire().then((r) => actif && setReglages({ r, lus: true }));
    return () => {
      actif = false;
    };
  }, []);

  const choisirSens = (s: SensElastique) => {
    setSens(s);
    if (valeur) onChange({ ...valeur, sens: s });
  };
  const proposees = couleursProposees(reglages.r, valeur?.couleur);

  return (
    <View style={{ gap: 10, borderWidth: 1, borderColor: couleurs.bordure, borderRadius: 10, padding: 12 }}>
      <Text style={ts.titreChamp}>Élastique</Text>
      <Text style={ts.doux}>
        {sens === 'aide' ? 'L’élastique aide : plus il est fort, plus l’exercice est facile.' : 'L’élastique freine : plus il est fort, plus l’exercice est dur.'}
      </Text>
      <View accessibilityRole="radiogroup" style={{ flexDirection: 'row', gap: 8 }}>
        {(['aide', 'resistance'] as SensElastique[]).map((s) => (
          <Pilule key={s} nom={LIBELLES_SENS[s]} choisi={sens === s} onPress={() => choisirSens(s)}>
            <Text style={[ts.texte, { fontFamily: polices.texteMoyen }]}>{LIBELLES_SENS[s]}</Text>
          </Pilule>
        ))}
      </View>
      <View accessibilityRole="radiogroup" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        <Pilule nom="Sans élastique" choisi={!valeur} onPress={() => onChange(undefined)}>
          <Text style={[ts.texte, { fontFamily: polices.texteMoyen }]}>Sans</Text>
        </Pilule>
        {proposees.map((c) => (
          <Pilule
            key={c.cle}
            nom={`${c.nom}${c.force ? `, ${c.force}` : ''}`}
            choisi={valeur?.couleur === c.cle}
            onPress={() => onChange(elastiqueDepuis(c, sens))}
          >
            <Rond hex={c.hex} taille={18} />
            <View>
              <Text style={[ts.texte, { fontFamily: polices.texteMoyen, lineHeight: 18 }]}>{c.nom}</Text>
              {!!c.force && <Text style={{ fontFamily: polices.chiffres, fontSize: 12, color: couleurs.texteDoux }}>{c.force}</Text>}
            </View>
          </Pilule>
        ))}
      </View>
      {valeur && (
        <View style={{ gap: 4 }}>
          <Text style={[ts.doux, { color: couleurs.texte }]}>Le client verra :</Text>
          <PastilleElastique e={valeur} />
        </View>
      )}
      <Repliable resume="Ajuster mes élastiques (force de chaque couleur)">
        <MesElastiques key={reglages.lus ? 'lus' : 'depart'} reglages={reglages.r} onEnregistre={(r) => setReglages({ r, lus: true })} />
      </Repliable>
    </View>
  );
}
