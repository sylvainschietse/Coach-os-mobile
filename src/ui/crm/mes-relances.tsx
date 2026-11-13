// Mon profil › Mes relances : le texte de chaque relance prête à l'emploi (modifiable, texte d'origine à un toucher),
// les relances coupées, et les relances du coach (quand ? pour qui ? quel message ?). Les relances arrivent le jour venu
// dans « À faire » de l'Accueil, message prêt ; le coach l'envoie en un toucher.
import { Plus } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { relancesCoach } from '@/data/relances-coach';
import { lireJour, MODELES } from '@/domain/crm';
import {
  DECLENCHEURS,
  erreurPerso,
  erreurTexte,
  libelleDeclencheur,
  PUBLICS,
  RELANCES_AUTO,
  remplir,
  texteDe,
  VARIABLES,
  type Declencheur,
  type ModeleAuto,
  type Public,
  type RelancePerso,
  type ReglagesRelances,
} from '@/domain/relances-coach';
import { nouvelId } from '@/lib/identifiant';

import { Bouton, Carte, Puce, Puces } from '../composants';
import { BoutonContour } from '../coque';
import { couleurs, espace, polices } from '../theme';
import { useCoachNom, useReglagesRelances } from './commun';

type Ouvert = { quoi: 'auto'; cle: ModeleAuto } | { quoi: 'perso'; id: string | 'nouvelle' } | null;

export function MesRelances() {
  const reglages = useReglagesRelances();
  const [ouvert, setOuvert] = useState<Ouvert>(null);
  const [erreur, setErreur] = useState<string>();
  const enregistrer = async (r: ReglagesRelances) => {
    setErreur(undefined);
    try {
      await relancesCoach.enregistrer(r);
      return true;
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Non enregistré, réessaie.');
      return false;
    }
  };
  const basculerAuto = (cle: ModeleAuto) =>
    enregistrer({ ...reglages, coupees: reglages.coupees.includes(cle) ? reglages.coupees.filter((c) => c !== cle) : [...reglages.coupees, cle] });
  const basculerPerso = (id: string) => enregistrer({ ...reglages, perso: reglages.perso.map((p) => (p.id === id ? { ...p, active: !p.active } : p)) });

  return (
    <View style={{ gap: espace(4) }}>
      <Text style={styles.intro}>
        CoachGo prépare le message au bon moment et le met dans « À faire » de l’Accueil. Tu l’envoies en un toucher, par SMS, WhatsApp ou e-mail.
      </Text>
      {erreur && (
        <Text accessibilityRole="alert" style={styles.erreur}>
          {erreur}
        </Text>
      )}

      <Carte style={styles.carte}>
        <Text style={styles.titre}>Relances prêtes à l’emploi</Text>
        {RELANCES_AUTO.map((r, i) => {
          const active = !reglages.coupees.includes(r.cle);
          const modifie = !!reglages.textes[r.cle];
          const estOuvert = ouvert?.quoi === 'auto' && ouvert.cle === r.cle;
          return (
            <View key={r.cle} style={[styles.ligne, i > 0 && styles.separee]}>
              <View style={styles.ligneHaut}>
                <Pressable accessibilityRole="button" accessibilityState={{ expanded: estOuvert }} onPress={() => setOuvert(estOuvert ? null : { quoi: 'auto', cle: r.cle })} style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[styles.nom, !active && styles.coupee]}>{MODELES[r.cle].libelle}</Text>
                  <Text style={styles.detail}>
                    {r.quand}
                    {modifie ? ' · texte modifié' : ''}
                  </Text>
                  <Text style={styles.lien}>{estOuvert ? 'Fermer' : 'Modifier le texte'}</Text>
                </Pressable>
                <Bascule libelle={MODELES[r.cle].libelle} valeur={active} onChange={() => basculerAuto(r.cle)} />
              </View>
              {estOuvert && (
                <EditeurTexte
                  key={r.cle}
                  initial={texteDe(reglages, r.cle)}
                  origine={MODELES[r.cle].texte}
                  onAnnuler={() => setOuvert(null)}
                  onEnregistrer={async (texte) => {
                    const textes = { ...reglages.textes };
                    if (texte.trim() === MODELES[r.cle].texte) delete textes[r.cle];
                    else textes[r.cle] = texte.trim();
                    if (await enregistrer({ ...reglages, textes })) setOuvert(null);
                  }}
                />
              )}
            </View>
          );
        })}
      </Carte>

      <Carte style={styles.carte}>
        <Text style={styles.titre}>Mes relances à moi</Text>
        {!reglages.perso.length && ouvert?.quoi !== 'perso' && (
          <Text style={styles.detail}>Aucune pour l’instant. Par exemple : « Fin de pack bientôt », quand il reste 2 séances.</Text>
        )}
        {reglages.perso.map((p, i) => {
          const estOuvert = ouvert?.quoi === 'perso' && ouvert.id === p.id;
          return (
            <View key={p.id} style={[styles.ligne, i > 0 && styles.separee]}>
              <View style={styles.ligneHaut}>
                <Pressable accessibilityRole="button" accessibilityState={{ expanded: estOuvert }} onPress={() => setOuvert(estOuvert ? null : { quoi: 'perso', id: p.id })} style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[styles.nom, !p.active && styles.coupee]}>{p.nom}</Text>
                  <Text style={styles.detail}>
                    {libelleDeclencheur(p.declencheur)} · {p.pour.map((x) => PUBLICS.find((q) => q.cle === x)!.libelle).join(', ')}
                  </Text>
                  <Text style={styles.lien}>{estOuvert ? 'Fermer' : 'Modifier'}</Text>
                </Pressable>
                <Bascule libelle={p.nom} valeur={p.active} onChange={() => basculerPerso(p.id)} />
              </View>
              {estOuvert && (
                <EditeurPerso
                  initiale={p}
                  onAnnuler={() => setOuvert(null)}
                  onSupprimer={async () => {
                    if (await enregistrer({ ...reglages, perso: reglages.perso.filter((x) => x.id !== p.id) })) setOuvert(null);
                  }}
                  onEnregistrer={async (r) => {
                    if (await enregistrer({ ...reglages, perso: reglages.perso.map((x) => (x.id === p.id ? r : x)) })) setOuvert(null);
                  }}
                />
              )}
            </View>
          );
        })}
        {ouvert?.quoi === 'perso' && ouvert.id === 'nouvelle' ? (
          <View style={[styles.ligne, reglages.perso.length > 0 && styles.separee]}>
            <Text style={styles.nom}>Nouvelle relance</Text>
            <EditeurPerso
              onAnnuler={() => setOuvert(null)}
              onEnregistrer={async (r) => {
                if (await enregistrer({ ...reglages, perso: [...reglages.perso, r] })) setOuvert(null);
              }}
            />
          </View>
        ) : (
          <View style={{ alignSelf: 'flex-start' }}>
            <BoutonContour libelle="Créer ma relance" icone={Plus} iconeAGauche onPress={() => setOuvert({ quoi: 'perso', id: 'nouvelle' })} />
          </View>
        )}
      </Carte>
    </View>
  );
}

function Bascule({ libelle, valeur, onChange }: { libelle: string; valeur: boolean; onChange: () => void }) {
  return (
    <Pressable accessibilityRole="switch" accessibilityLabel={libelle} accessibilityState={{ checked: valeur }} onPress={onChange} hitSlop={8} style={[styles.bascule, valeur && styles.basculeOn]}>
      <View style={[styles.rond, valeur && { alignSelf: 'flex-end' }]} />
    </Pressable>
  );
}

/** Le texte, les boutons pour insérer une variable là où est le curseur, et l'aperçu avec un prénom d'exemple. */
function ChampMessage({ valeur, onChange }: { valeur: string; onChange: (v: string) => void }) {
  const coach = useCoachNom();
  const [selection, setSelection] = useState({ start: valeur.length, end: valeur.length });
  const inserer = (code: string) => {
    const avant = valeur.slice(0, selection.start);
    const apres = valeur.slice(selection.end);
    const espaceAvant = avant && !/\s$/.test(avant) ? ' ' : '';
    onChange(`${avant}${espaceAvant}${code}${apres}`);
    const fin = avant.length + espaceAvant.length + code.length;
    setSelection({ start: fin, end: fin });
  };
  const erreur = valeur ? erreurTexte(valeur) : null;
  return (
    <View style={{ gap: espace(2) }}>
      <Text style={styles.champ}>Ton texte</Text>
      <TextInput
        accessibilityLabel="Ton texte"
        value={valeur}
        onChangeText={onChange}
        onSelectionChange={(e) => setSelection(e.nativeEvent.selection)}
        multiline
        style={[styles.saisie, { minHeight: 110, textAlignVertical: 'top' }, !!erreur && { borderColor: couleurs.rouge }]}
      />
      <Text style={styles.detail}>Insérer :</Text>
      <Puces>
        {VARIABLES.map((v) => (
          <Puce key={v.code} libelle={v.libelle} onPress={() => inserer(v.code)} />
        ))}
      </Puces>
      {erreur ? (
        <Text style={styles.erreur}>{erreur}</Text>
      ) : (
        !!valeur.trim() && (
          <View style={styles.apercu}>
            <Text style={styles.champ}>Aperçu</Text>
            <Text style={styles.texte}>{remplir(valeur, { prenom: 'Léa', coach, quand: 'jeudi 19 novembre', lien: 'https://…', guide: 'https://…/guide.pdf' })}</Text>
          </View>
        )
      )}
    </View>
  );
}

function EditeurTexte({ initial, origine, onAnnuler, onEnregistrer }: { initial: string; origine: string; onAnnuler: () => void; onEnregistrer: (t: string) => Promise<void> }) {
  const [texte, setTexte] = useState(initial);
  const [occupe, setOccupe] = useState(false);
  const valide = !erreurTexte(texte);
  return (
    <View style={styles.editeur}>
      <ChampMessage valeur={texte} onChange={setTexte} />
      <View style={styles.boutons}>
        <Bouton
          libelle={occupe ? 'Enregistrement…' : 'Enregistrer'}
          desactive={!valide || occupe || texte === initial}
          onPress={async () => {
            setOccupe(true);
            await onEnregistrer(texte);
            setOccupe(false);
          }}
        />
        <BoutonContour libelle="Texte d’origine" desactive={texte === origine} onPress={() => setTexte(origine)} />
        <BoutonContour libelle="Annuler" onPress={onAnnuler} />
      </View>
    </View>
  );
}

const jourAffiche = (d: string) => d.split('-').reverse().join('/');

function EditeurPerso({
  initiale,
  onAnnuler,
  onEnregistrer,
  onSupprimer,
}: {
  initiale?: RelancePerso;
  onAnnuler: () => void;
  onEnregistrer: (r: RelancePerso) => Promise<void>;
  onSupprimer?: () => Promise<void>;
}) {
  const [nom, setNom] = useState(initiale?.nom ?? '');
  const [type, setType] = useState<Declencheur['type']>(initiale?.declencheur.type ?? 'sans_seance');
  const nombreInitial = initiale && 'jours' in initiale.declencheur ? initiale.declencheur.jours : initiale && 'restantes' in initiale.declencheur ? initiale.declencheur.restantes : undefined;
  const [nombre, setNombre] = useState(nombreInitial !== undefined ? String(nombreInitial) : '');
  const [date, setDate] = useState(initiale?.declencheur.type === 'date' ? jourAffiche(initiale.declencheur.date) : '');
  const [pour, setPour] = useState<Public[]>(initiale?.pour ?? ['clients']);
  const [texte, setTexte] = useState(initiale?.texte ?? 'Bonjour {prenom}, ');
  const [occupe, setOccupe] = useState(false);
  const def = DECLENCHEURS.find((d) => d.type === type)!;
  const n = def.nombre ? (nombre.trim() ? Number(nombre) : def.nombre.defaut) : 0;
  const nombreFaux = !!def.nombre && (!Number.isInteger(n) || n < def.nombre.min || n > def.nombre.max);
  const declencheur: Declencheur =
    type === 'anniversaire'
      ? { type }
      : type === 'date'
        ? { type, date: lireJour(date) ?? '' }
        : type === 'fin_pack'
          ? { type, restantes: n }
          : ({ type, jours: n } as Declencheur);
  const erreur = nombreFaux ? `${def.nombre!.libelle} : entre ${def.nombre!.min} et ${def.nombre!.max}.` : erreurPerso({ nom, texte, declencheur, pour });
  return (
    <View style={styles.editeur}>
      <Text style={styles.champ}>Nom</Text>
      <TextInput accessibilityLabel="Nom de la relance" value={nom} onChangeText={setNom} placeholder="Fin de pack bientôt" placeholderTextColor={couleurs.suggestion} maxLength={80} style={styles.saisie} />
      <Text style={styles.champ}>Quand ?</Text>
      <Puces>
        {DECLENCHEURS.map((d) => (
          <Puce key={d.type} libelle={d.libelle} actif={d.type === type} onPress={() => setType(d.type)} />
        ))}
      </Puces>
      {def.nombre && (
        <View style={{ gap: espace(1) }}>
          <Text style={styles.champ}>{def.nombre.libelle}</Text>
          <TextInput
            accessibilityLabel={def.nombre.libelle}
            value={nombre}
            onChangeText={setNombre}
            placeholder={String(def.nombre.defaut)}
            placeholderTextColor={couleurs.suggestion}
            inputMode="numeric"
            style={[styles.saisie, { maxWidth: 120 }]}
          />
        </View>
      )}
      {type === 'date' && (
        <View style={{ gap: espace(1) }}>
          <Text style={styles.champ}>Date</Text>
          <TextInput accessibilityLabel="Date" value={date} onChangeText={setDate} placeholder="jj/mm/aaaa" placeholderTextColor={couleurs.suggestion} style={[styles.saisie, { maxWidth: 160 }]} />
        </View>
      )}
      <Text style={styles.detail}>{libelleDeclencheur(declencheur.type === 'date' && !declencheur.date ? { type: 'date', date: '….' } : declencheur)}</Text>
      <Text style={styles.champ}>Pour qui ?</Text>
      <Puces>
        {PUBLICS.map((q) => (
          <Puce key={q.cle} libelle={q.libelle} actif={pour.includes(q.cle)} onPress={() => setPour(pour.includes(q.cle) ? pour.filter((x) => x !== q.cle) : [...pour, q.cle])} />
        ))}
      </Puces>
      <ChampMessage valeur={texte} onChange={setTexte} />
      {erreur && <Text style={styles.erreur}>{erreur}</Text>}
      <View style={styles.boutons}>
        <Bouton
          libelle={occupe ? 'Enregistrement…' : 'Enregistrer'}
          desactive={!!erreur || occupe}
          onPress={async () => {
            setOccupe(true);
            await onEnregistrer({ id: initiale?.id ?? nouvelId(), nom: nom.trim(), texte: texte.trim(), declencheur, pour, active: initiale?.active ?? true });
            setOccupe(false);
          }}
        />
        <BoutonContour libelle="Annuler" onPress={onAnnuler} />
        {onSupprimer && <BoutonContour libelle="Supprimer" onPress={onSupprimer} />}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  intro: { fontFamily: polices.texte, fontSize: 14, lineHeight: 20, color: couleurs.texteDoux },
  carte: { padding: 20, gap: espace(3) },
  titre: { fontFamily: polices.texteGras, fontSize: 16, color: couleurs.texte },
  ligne: { gap: espace(3), paddingTop: espace(1) },
  separee: { borderTopWidth: 1, borderTopColor: couleurs.bordure, paddingTop: espace(3) },
  ligneHaut: { flexDirection: 'row', alignItems: 'center', gap: espace(3) },
  nom: { fontFamily: polices.texteGras, fontSize: 15, color: couleurs.texte },
  coupee: { color: couleurs.texteDoux, textDecorationLine: 'line-through' },
  detail: { fontFamily: polices.texte, fontSize: 13, lineHeight: 18, color: couleurs.texteDoux },
  lien: { fontFamily: polices.texteMoyen, fontSize: 13, color: couleurs.rouge, marginTop: 4 },
  bascule: { width: 48, height: 28, borderRadius: 14, backgroundColor: couleurs.saisie, padding: 3, justifyContent: 'center' },
  basculeOn: { backgroundColor: couleurs.vert },
  rond: { width: 22, height: 22, borderRadius: 11, backgroundColor: couleurs.carte },
  editeur: { gap: espace(2), backgroundColor: couleurs.fond, borderRadius: 14, padding: espace(3) },
  champ: { fontFamily: polices.texteGras, fontSize: 13, color: couleurs.texte },
  saisie: { borderWidth: 1, borderColor: couleurs.saisie, borderRadius: 11, backgroundColor: couleurs.carte, paddingHorizontal: 12, paddingVertical: 10, fontFamily: polices.texte, fontSize: 15, color: couleurs.texte },
  apercu: { gap: 4, backgroundColor: couleurs.carte, borderRadius: 11, padding: 12, borderWidth: 1, borderColor: couleurs.bordure },
  texte: { fontFamily: polices.texte, fontSize: 14, lineHeight: 20, color: couleurs.texte },
  erreur: { fontFamily: polices.texte, fontSize: 13, color: couleurs.rouge },
  boutons: { flexDirection: 'row', flexWrap: 'wrap', gap: espace(2), alignItems: 'center' },
});
