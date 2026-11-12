// Mon profil › Mes newsletters : le coach écrit un article illustré, façon magazine, pour ses clients actifs, ses clients
// en veille ou les deux, choisit l'envoi (e-mail, notification) et l'heure. Le serveur l'envoie tout seul le moment venu.
// Des thèmes prêts à adapter évitent la page blanche ; l'aperçu montre l'e-mail exact, et « M'envoyer un test » l'envoie
// dans la boîte du coach.
import { decode, encode } from 'base64-arraybuffer';
import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { Eye, ImagePlus, Mail, Send, Trash2 } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { Image, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';

import { newsletters, ecouterNewsletters, type Comptes, type ImageAEnregistrer } from '@/data/newsletters';
import {
  CIBLES,
  cleThemeImage,
  erreurNewsletter,
  mailNewsletter,
  MAX_CHAPEAU,
  MAX_OBJET,
  MAX_RUBRIQUE,
  THEMES,
  type Cible,
  type Newsletter,
  type Theme,
} from '@/domain/newsletters';
import ARTICLES_BRUTS from '@/domain/articles-newsletters.json';
import { maintenantMs } from '@/lib/temps';
import { messageErreur, useCharger, useRechargerSur } from '@/lib/useCharger';

import { Bouton, Carte, Chargement, Erreur, Puce, Puces } from '../composants';
import { BoutonContour } from '../coque';
import { useCoachNom } from '../crm/commun';
import { ChampDate, ChampHeure } from '../date-heure';
import { ApercuHtml } from '../offres/apercu-html';
import { couleurs, espace, polices } from '../theme';
import { CLES_ILLUSTRATIONS, imageIllustration, octetsIllustration } from './illustrations';

/** 20 articles complets et sourcés sur le sport et l'alimentation (environ 3 pages chacun). */
const ARTICLES = ARTICLES_BRUTS as Theme[];

/** L'illustration à l'écran : un thème livré, une photo choisie (pas encore rangée), ou celle déjà rangée. */
type Illustration = { quoi: 'theme'; cle: string } | { quoi: 'photo'; base64: string } | { quoi: 'rangee'; chemin: string } | null;

const deux = (n: number) => String(n).padStart(2, '0');
const jourDe = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${deux(d.getMonth() + 1)}-${deux(d.getDate())}`;
};
const heureDe = (iso: string) => {
  const d = new Date(iso);
  return `${deux(d.getHours())}:${deux(d.getMinutes())}`;
};
/** Jour et heure (heure de l'appareil) en ISO ; undefined si l'un manque. */
const isoDe = (jour: string, heure: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(jour) || !/^\d{2}:\d{2}$/.test(heure)) return undefined;
  const [a, m, j] = jour.split('-').map(Number);
  const [h, mi] = heure.split(':').map(Number);
  return new Date(a, m - 1, j, h, mi).toISOString();
};
const quandLisible = (iso: string) => {
  const d = new Date(iso);
  const t = `${d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })} à ${d.getHours()} h ${deux(d.getMinutes())}`;
  return t.charAt(0).toUpperCase() + t.slice(1);
};

const vierge = (): Newsletter => ({
  id: '',
  rubrique: '',
  objet: '',
  chapeau: '',
  message: '',
  cibles: ['clients'],
  parEmail: true,
  parNotif: true,
  etat: 'brouillon',
  nbEmails: 0,
  nbNotifs: 0,
  creeLe: '',
});
const depuisTheme = (t: Theme): Newsletter => ({ ...vierge(), rubrique: t.rubrique, objet: t.objet, chapeau: t.chapeau, message: t.message, cibles: [t.pour], image: `theme:${t.illustration ?? t.cle}` });

function illustrationDe(n: Newsletter): Illustration {
  const cle = cleThemeImage(n.image);
  if (cle) return { quoi: 'theme', cle };
  return n.image ? { quoi: 'rangee', chemin: n.image } : null;
}

export function MesNewsletters() {
  const charge = useCharger(() => newsletters.liste(), 'newsletters');
  useRechargerSur(charge.recharger, ecouterNewsletters);
  const comptes = useCharger(() => newsletters.destinataires(), 'newsletters-destinataires');
  const [ouverte, setOuverte] = useState<Newsletter | null>(null);

  if (ouverte)
    return (
      <Editeur
        key={ouverte.id || ouverte.objet || 'nouvelle'}
        initiale={ouverte}
        comptes={comptes.donnee ?? undefined}
        onFermer={() => {
          setOuverte(null);
          charge.recharger();
        }}
      />
    );
  if (charge.erreur) return <Erreur message={charge.erreur} onReessayer={charge.recharger} />;
  if (!charge.donnee) return <Chargement />;
  const liste = charge.donnee;
  const groupes: { titre: string; liste: Newsletter[] }[] = [
    { titre: 'Programmées', liste: liste.filter((n) => n.etat === 'programmee' || n.etat === 'en_cours').sort((a, b) => (a.envoiLe ?? '').localeCompare(b.envoiLe ?? '')) },
    { titre: 'Brouillons', liste: liste.filter((n) => n.etat === 'brouillon') },
    { titre: 'Envoyées', liste: liste.filter((n) => n.etat === 'envoyee') },
  ];
  const c = comptes.donnee;
  return (
    <View style={{ gap: espace(4) }}>
      <Text style={styles.intro}>
        Écris une lettre illustrée, façon magazine, pour tes clients actifs ou ceux en veille. Elle part toute seule à l’heure choisie, par e-mail et en notification sur leur téléphone.
      </Text>
      {c && (
        <Text style={styles.detail}>
          {c.clients.total} client{c.clients.total > 1 ? 's' : ''} actif{c.clients.total > 1 ? 's' : ''} ({c.clients.emails} avec e-mail) · {c.veille.total} en veille ({c.veille.emails} avec e-mail)
        </Text>
      )}
      <View style={{ alignSelf: 'flex-start' }}>
        <Bouton libelle="Nouvelle newsletter" onPress={() => setOuverte(vierge())} />
      </View>

      {groupes.map(
        (g) =>
          g.liste.length > 0 && (
            <View key={g.titre} style={{ gap: espace(2) }}>
              <Text style={styles.groupe}>{g.titre}</Text>
              {g.liste.map((n) => (
                <LigneNewsletter key={n.id} n={n} onPress={() => setOuverte(n)} />
              ))}
            </View>
          ),
      )}

      <View style={{ gap: espace(2) }}>
        <Text style={styles.groupe}>Articles complets · sport et alimentation</Text>
        <Text style={styles.detail}>20 articles d’environ 3 pages, documentés et sourcés. Touche-en un pour le relire, l’adapter et le programmer.</Text>
        {CIBLES.map((cible) => (
          <View key={cible.cle} style={{ gap: espace(2) }}>
            <Text style={styles.sousGroupe}>{cible.cle === 'clients' ? 'Pour les clients actifs' : 'Pour les clients en veille'}</Text>
            {ARTICLES.filter((t) => t.pour === cible.cle).map((t) => (
              <Pressable
                key={t.cle}
                accessibilityRole="button"
                accessibilityLabel={`Article : ${t.rubrique}, ${t.objet}`}
                onPress={() => setOuverte(depuisTheme(t))}
                style={({ pressed }) => [styles.ligne, pressed && { backgroundColor: couleurs.discret }]}
              >
                <Image source={imageIllustration(t.illustration ?? t.cle)} style={styles.vignette} resizeMode="cover" />
                <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
                  <Text style={styles.rubrique}>{t.rubrique}</Text>
                  <Text style={styles.titre} numberOfLines={3}>
                    {t.objet.replace('{prenom}', 'Léa')}
                  </Text>
                  <Text style={styles.detail}>{Math.max(1, Math.round(t.message.length / 2600))} pages · sources citées</Text>
                </View>
              </Pressable>
            ))}
          </View>
        ))}
      </View>

      <View style={{ gap: espace(2) }}>
        <Text style={styles.groupe}>Idées de sujets</Text>
        <Text style={styles.detail}>Touche une idée : l’article est déjà écrit, il ne reste qu’à l’adapter.</Text>
        {CIBLES.map((cible) => (
          <View key={cible.cle} style={{ gap: espace(2) }}>
            <Text style={styles.sousGroupe}>{cible.cle === 'clients' ? 'Pour les clients actifs' : 'Pour les clients en veille'}</Text>
            <View style={styles.grille}>
              {THEMES.filter((t) => t.pour === cible.cle).map((t) => (
                <Pressable
                  key={t.cle}
                  accessibilityRole="button"
                  accessibilityLabel={`Idée : ${t.rubrique}, ${t.objet}`}
                  onPress={() => setOuverte(depuisTheme(t))}
                  style={({ pressed }) => [styles.idee, pressed && { opacity: 0.8 }]}
                >
                  <Image source={imageIllustration(t.cle)} style={styles.ideeImage} resizeMode="cover" />
                  <View style={{ padding: 10, gap: 2 }}>
                    <Text style={styles.rubrique}>{t.rubrique}</Text>
                    <Text style={styles.ideeTitre} numberOfLines={2}>
                      {t.objet.replace('{prenom}', 'Léa')}
                    </Text>
                  </View>
                </Pressable>
              ))}
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

function Pastilles({ n }: { n: Pick<Newsletter, 'cibles' | 'parEmail' | 'parNotif'> }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
      {n.cibles.map((c) => (
        <Text key={c} style={[styles.pastille, c === 'clients' ? styles.pastilleActifs : styles.pastilleVeille]}>
          {CIBLES.find((x) => x.cle === c)!.libelle}
        </Text>
      ))}
      <Text style={[styles.pastille, styles.pastilleCanal]}>{n.parEmail && n.parNotif ? 'E-mail + notif' : n.parEmail ? 'E-mail' : 'Notification'}</Text>
    </View>
  );
}

function LigneNewsletter({ n, onPress }: { n: Newsletter; onPress: () => void }) {
  const cle = cleThemeImage(n.image);
  const url = newsletters.urlImage(n.image);
  const detail =
    n.etat === 'envoyee'
      ? `Envoyée le ${new Date(n.envoyeeLe ?? n.envoiLe ?? n.creeLe).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })} · ${n.nbEmails} e-mail${n.nbEmails > 1 ? 's' : ''}, ${n.nbNotifs} notification${n.nbNotifs > 1 ? 's' : ''}`
      : n.etat === 'en_cours'
        ? 'Envoi en cours…'
        : n.envoiLe
          ? quandLisible(n.envoiLe)
          : 'Pas encore de date';
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.ligne, n.etat === 'envoyee' && { opacity: 0.8 }, pressed && { backgroundColor: couleurs.discret }]}>
      {cle || url ? <Image source={cle ? imageIllustration(cle) : { uri: url }} style={styles.vignette} resizeMode="cover" /> : <View style={[styles.vignette, { backgroundColor: couleurs.discret }]} />}
      <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
        {!!n.rubrique && <Text style={styles.rubrique}>{n.rubrique}</Text>}
        <Text style={styles.titre} numberOfLines={2}>
          {n.objet.replace('{prenom}', '…')}
        </Text>
        <Text style={styles.detail}>{detail}</Text>
        <Pastilles n={n} />
      </View>
    </Pressable>
  );
}

function Editeur({ initiale, comptes, onFermer }: { initiale: Newsletter; comptes?: Comptes; onFermer: () => void }) {
  const coach = useCoachNom();
  const [n, setN] = useState<Newsletter>(initiale);
  const [illustration, setIllustration] = useState<Illustration>(() => illustrationDe(initiale));
  const [choixImage, setChoixImage] = useState(false);
  const [jour, setJour] = useState(initiale.envoiLe ? jourDe(initiale.envoiLe) : '');
  const [heure, setHeure] = useState(initiale.envoiLe ? heureDe(initiale.envoiLe) : '09:00');
  const [occupe, setOccupe] = useState<string>();
  const [erreur, setErreur] = useState<string>();
  const [info, setInfo] = useState<string>();
  const [apercu, setApercu] = useState(false);
  const [selection, setSelection] = useState({ start: initiale.message.length, end: initiale.message.length });
  const partie = initiale.etat === 'envoyee' || initiale.etat === 'en_cours';
  const maj = (m: Partial<Newsletter>) => {
    setN({ ...n, ...m });
    setInfo(undefined);
  };
  const envoiLe = isoDe(jour, heure);

  const inserer = (code: string, debutLigne?: boolean) => {
    const v = n.message;
    const avant = v.slice(0, selection.start);
    const apres = v.slice(selection.end);
    const sep = debutLigne ? (avant && !avant.endsWith('\n\n') ? (avant.endsWith('\n') ? '\n' : '\n\n') : '') : avant && !/\s$/.test(avant) ? ' ' : '';
    maj({ message: `${avant}${sep}${code}${apres}` });
    const fin = avant.length + sep.length + code.length;
    setSelection({ start: fin, end: fin });
  };

  async function choisirPhoto() {
    setChoixImage(false);
    const choix = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [2, 1], quality: 1 });
    const f = choix.canceled ? undefined : choix.assets[0];
    if (!f) return;
    try {
      const rendu = await ImageManipulator.manipulate(f.uri).resize({ width: 1200 }).renderAsync();
      const r = await rendu.saveAsync({ format: SaveFormat.JPEG, compress: 0.8, base64: true });
      if (!r.base64) throw new Error();
      setIllustration({ quoi: 'photo', base64: r.base64 });
    } catch {
      setErreur('Cette photo n’a pas pu être préparée : essaie une autre image.');
    }
  }

  async function imageAEnregistrer(): Promise<ImageAEnregistrer> {
    if (!illustration) return null;
    if (illustration.quoi === 'rangee') return { chemin: illustration.chemin };
    if (illustration.quoi === 'photo') return { octets: decode(illustration.base64), type: 'image/jpeg' };
    // Thème : rangé tel quel, sauf s'il l'est déjà pour cette newsletter.
    return { octets: await octetsIllustration(illustration.cle), type: 'image/jpeg' };
  }

  async function enregistrer(etat: 'brouillon' | 'programmee') {
    setErreur(undefined);
    setInfo(undefined);
    const probleme = erreurNewsletter({ ...n, envoiLe }, etat === 'programmee' ? maintenantMs() : undefined);
    if (probleme) return setErreur(probleme);
    setOccupe(etat);
    try {
      const enregistree = await newsletters.enregistrer({ ...n, envoiLe, etat }, await imageAEnregistrer());
      setN(enregistree);
      setIllustration(illustrationDe(enregistree) ?? illustration);
      if (etat === 'programmee') onFermer();
      else setInfo('Brouillon enregistré.');
    } catch (e) {
      setErreur(messageErreur(e));
    } finally {
      setOccupe(undefined);
    }
  }

  async function test() {
    setErreur(undefined);
    setInfo(undefined);
    const probleme = erreurNewsletter({ ...n, parEmail: true });
    if (probleme) return setErreur(probleme);
    setOccupe('test');
    try {
      // L'illustration doit être en ligne pour s'afficher dans la boîte : on enregistre d'abord le brouillon.
      let image = n.image;
      if (illustration && illustration.quoi !== 'rangee') {
        const enregistree = await newsletters.enregistrer({ ...n, envoiLe, etat: n.etat === 'programmee' ? 'programmee' : 'brouillon' }, await imageAEnregistrer());
        setN(enregistree);
        setIllustration(illustrationDe(enregistree));
        image = enregistree.image;
      }
      const a = await newsletters.envoyerTest({ ...n, image });
      setInfo(`Test envoyé à ${a}. Regarde ta boîte de réception.`);
    } catch (e) {
      setErreur(messageErreur(e));
    } finally {
      setOccupe(undefined);
    }
  }

  async function supprimer() {
    setOccupe('supprimer');
    try {
      await newsletters.supprimer(n);
      onFermer();
    } catch (e) {
      setErreur(messageErreur(e));
      setOccupe(undefined);
    }
  }

  const sourceImage = illustration
    ? illustration.quoi === 'theme'
      ? imageIllustration(illustration.cle)
      : illustration.quoi === 'photo'
        ? { uri: `data:image/jpeg;base64,${illustration.base64}` }
        : { uri: newsletters.urlImage(illustration.chemin) }
    : undefined;

  return (
    <View style={{ gap: espace(4) }}>
      <View style={{ alignSelf: 'flex-start' }}>
        <BoutonContour libelle="Mes newsletters" onPress={onFermer} />
      </View>
      {partie && (
        <Text style={styles.bandeau}>
          {initiale.etat === 'en_cours' ? 'Cette newsletter est en train de partir.' : `Envoyée : ${initiale.nbEmails} e-mail${initiale.nbEmails > 1 ? 's' : ''} et ${initiale.nbNotifs} notification${initiale.nbNotifs > 1 ? 's' : ''}.`} Elle ne peut plus être modifiée.
        </Text>
      )}

      <Carte style={styles.carte}>
        <Text style={styles.champ}>Pour qui ?</Text>
        <Puces>
          {CIBLES.map((c) => {
            const k = comptes?.[c.cle];
            const actif = n.cibles.includes(c.cle);
            return (
              <Puce
                key={c.cle}
                libelle={`${c.libelle}${k ? ` · ${k.total}` : ''}`}
                actif={actif}
                onPress={() => !partie && maj({ cibles: actif ? n.cibles.filter((x) => x !== c.cle) : ([...n.cibles, c.cle] as Cible[]) })}
              />
            );
          })}
        </Puces>
        {comptes && n.cibles.length > 0 && (
          <Text style={styles.detail}>
            {n.cibles.reduce((s, c) => s + comptes[c].emails, 0)} recevront l’e-mail · {n.cibles.reduce((s, c) => s + comptes[c].notifs, 0)} ont l’appli pour la notification
          </Text>
        )}
      </Carte>

      <Carte style={styles.carte}>
        <Text style={styles.champ}>Illustration</Text>
        {sourceImage ? (
          <View style={styles.couverture}>
            <Image source={sourceImage} style={StyleSheet.absoluteFill} resizeMode="cover" accessibilityIgnoresInvertColors />
          </View>
        ) : (
          <View style={[styles.couverture, { backgroundColor: couleurs.discret, alignItems: 'center', justifyContent: 'center' }]}>
            <Text style={styles.detail}>Sans illustration</Text>
          </View>
        )}
        {!partie && (
          <View style={styles.boutons}>
            <BoutonContour libelle="Changer d’illustration" icone={ImagePlus} iconeAGauche onPress={() => setChoixImage(!choixImage)} />
            {illustration && <BoutonContour libelle="Retirer" onPress={() => setIllustration(null)} />}
          </View>
        )}
        {choixImage && (
          <View style={{ gap: espace(2) }}>
            <View style={styles.grille}>
              {CLES_ILLUSTRATIONS.map((cle) => (
                <Pressable
                  key={cle}
                  accessibilityRole="button"
                  accessibilityLabel={`Illustration ${cle}`}
                  onPress={() => {
                    setIllustration({ quoi: 'theme', cle });
                    setChoixImage(false);
                  }}
                  style={[styles.choixImage, illustration?.quoi === 'theme' && illustration.cle === cle && { borderColor: couleurs.rouge }]}
                >
                  <Image source={imageIllustration(cle)} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                </Pressable>
              ))}
            </View>
            <View style={{ alignSelf: 'flex-start' }}>
              <BoutonContour libelle="Une photo de mon téléphone" icone={ImagePlus} iconeAGauche onPress={choisirPhoto} />
            </View>
          </View>
        )}
      </Carte>

      <Carte style={styles.carte}>
        <Champ libelle="Rubrique (petit titre au-dessus)" valeur={n.rubrique} max={MAX_RUBRIQUE} placeholder="Le conseil du mois" onChange={(v) => maj({ rubrique: v })} lectureSeule={partie} />
        <Champ libelle="Titre (et objet de l’e-mail)" valeur={n.objet} max={MAX_OBJET} placeholder="Le squat parfait, en trois réglages" onChange={(v) => maj({ objet: v })} lectureSeule={partie} grand />
        <Champ libelle="Introduction" valeur={n.chapeau} max={MAX_CHAPEAU} placeholder="Deux phrases qui donnent envie de lire la suite." onChange={(v) => maj({ chapeau: v })} lectureSeule={partie} multiligne />
        <Text style={styles.champ}>Article</Text>
        <TextInput
          accessibilityLabel="Article"
          value={n.message}
          editable={!partie}
          onChangeText={(v) => maj({ message: v })}
          onSelectionChange={(e) => setSelection(e.nativeEvent.selection)}
          multiline
          placeholder="Écris ton article ici…"
          placeholderTextColor={couleurs.suggestion}
          style={[styles.saisie, { minHeight: 220, textAlignVertical: 'top' }]}
        />
        {!partie && (
          <>
            <Text style={styles.detail}>Mettre en forme :</Text>
            <Puces>
              <Puce libelle="Prénom du client" onPress={() => inserer('{prenom}')} />
              <Puce libelle="Intertitre" onPress={() => inserer('## ', true)} />
              <Puce libelle="Liste" onPress={() => inserer('- ', true)} />
              <Puce libelle="Citation" onPress={() => inserer('> ', true)} />
            </Puces>
            <Text style={styles.aide}>« ## » au début d’une ligne en fait un intertitre, « - » un point de liste, « {">"} » une citation en grand.</Text>
          </>
        )}
        <Text style={[styles.champ, { marginTop: espace(2) }]}>Bouton (facultatif)</Text>
        <View style={styles.boutons}>
          <TextInput
            accessibilityLabel="Texte du bouton"
            value={n.boutonLibelle ?? ''}
            editable={!partie}
            onChangeText={(v) => maj({ boutonLibelle: v })}
            placeholder="Réserver ma séance"
            placeholderTextColor={couleurs.suggestion}
            maxLength={60}
            style={[styles.saisie, { flex: 1, minWidth: 160 }]}
          />
          <TextInput
            accessibilityLabel="Lien du bouton"
            value={n.boutonLien ?? ''}
            editable={!partie}
            onChangeText={(v) => maj({ boutonLien: v })}
            placeholder="https://…"
            placeholderTextColor={couleurs.suggestion}
            autoCapitalize="none"
            inputMode="url"
            style={[styles.saisie, { flex: 1, minWidth: 160 }]}
          />
        </View>
      </Carte>

      <Carte style={styles.carte}>
        <Text style={styles.champ}>Envoyer par</Text>
        <Puces>
          <Puce libelle="E-mail" actif={n.parEmail} onPress={() => !partie && maj({ parEmail: !n.parEmail })} />
          <Puce libelle="Notification" actif={n.parNotif} onPress={() => !partie && maj({ parNotif: !n.parNotif })} />
        </Puces>
        <Text style={styles.detail}>La notification montre le titre et l’introduction, et n’arrive qu’à ceux qui ont l’appli.</Text>
        {!partie && (
          <View style={{ gap: espace(3), marginTop: espace(2) }}>
            <ChampDate libelle="Jour d’envoi" jour={jour} onChange={setJour} />
            <ChampHeure libelle="Heure" heure={heure} onChange={setHeure} />
          </View>
        )}
      </Carte>

      {erreur && (
        <Text accessibilityRole="alert" style={styles.erreur}>
          {erreur}
        </Text>
      )}
      {info && <Text style={styles.info}>{info}</Text>}

      <View style={styles.boutons}>
        <BoutonContour libelle="Aperçu" icone={Eye} iconeAGauche onPress={() => setApercu(true)} />
        {!partie && (
          <>
            <BoutonContour libelle={occupe === 'test' ? 'Envoi…' : 'M’envoyer un test'} icone={Mail} iconeAGauche desactive={!!occupe} onPress={test} />
            <BoutonContour libelle={occupe === 'brouillon' ? 'Enregistrement…' : n.etat === 'programmee' ? 'Repasser en brouillon' : 'Enregistrer le brouillon'} desactive={!!occupe} onPress={() => enregistrer('brouillon')} />
            <Bouton libelle={occupe === 'programmee' ? 'Programmation…' : envoiLe ? `Programmer · ${quandLisible(envoiLe)}` : 'Programmer'} desactive={!!occupe} onPress={() => enregistrer('programmee')} />
          </>
        )}
      </View>
      {!partie && n.id && (
        <View style={{ alignSelf: 'flex-start' }}>
          <BoutonContour libelle={occupe === 'supprimer' ? 'Suppression…' : 'Supprimer'} icone={Trash2} iconeAGauche desactive={!!occupe} onPress={supprimer} />
        </View>
      )}

      <Apercu visible={apercu} onFermer={() => setApercu(false)} n={n} illustration={illustration} coach={coach} quand={envoiLe} />
    </View>
  );
}

function Champ({
  libelle,
  valeur,
  onChange,
  max,
  placeholder,
  multiligne,
  grand,
  lectureSeule,
}: {
  libelle: string;
  valeur: string;
  onChange: (v: string) => void;
  max: number;
  placeholder?: string;
  multiligne?: boolean;
  grand?: boolean;
  lectureSeule?: boolean;
}) {
  return (
    <View style={{ gap: espace(1) }}>
      <Text style={styles.champ}>{libelle}</Text>
      <TextInput
        accessibilityLabel={libelle}
        value={valeur}
        editable={!lectureSeule}
        onChangeText={onChange}
        maxLength={max}
        multiline={multiligne}
        placeholder={placeholder}
        placeholderTextColor={couleurs.suggestion}
        style={[styles.saisie, grand && { fontFamily: polices.texteGras, fontSize: 17 }, multiligne && { minHeight: 70, textAlignVertical: 'top' }]}
      />
    </View>
  );
}

/** L'e-mail exact, avec le prénom d'un client d'exemple. */
function Apercu({ visible, onFermer, n, illustration, coach, quand }: { visible: boolean; onFermer: () => void; n: Newsletter; illustration: Illustration; coach: string; quand?: string }) {
  const { width, height } = useWindowDimensions();
  const [image, setImage] = useState<string>();
  useEffect(() => {
    if (!visible) return;
    let fini = false;
    (async () => {
      if (!illustration) return setImage(undefined);
      if (illustration.quoi === 'photo') return setImage(`data:image/jpeg;base64,${illustration.base64}`);
      if (illustration.quoi === 'rangee') return setImage(newsletters.urlImage(illustration.chemin));
      const octets = await octetsIllustration(illustration.cle).catch(() => null);
      if (!fini) setImage(octets ? `data:image/jpeg;base64,${encode(octets)}` : undefined);
    })();
    return () => {
      fini = true;
    };
  }, [visible, illustration]);
  const html = useMemo(() => {
    const m = mailNewsletter({ ...n, image: image?.replace(/^data:/, 'https://data/') }, { prenom: 'Léa', coach, desabonnement: 'https://exemple', quand });
    // Les images en data: ne sont pas des liens https : on les remet après la mise en page.
    const corps = image?.startsWith('data:') ? m.html.replace(image.replace(/^data:/, 'https://data/'), image) : m.html;
    return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body style="margin:0">${corps}</body></html>`;
  }, [n, image, coach, quand]);
  const largeur = Math.min(width - 24, 640);
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onFermer} transparent>
      <View style={styles.fondModal}>
        <View style={[styles.modal, { width: largeur + 16, height: height - 80 }]}>
          <View style={[styles.boutons, { justifyContent: 'space-between', padding: 8 }]}>
            <Text style={styles.champ}>Aperçu de l’e-mail · {n.objet ? mailNewsletter(n, { prenom: 'Léa', coach, desabonnement: '' }).sujet : 'sans titre'}</Text>
            <BoutonContour libelle="Fermer" onPress={onFermer} />
          </View>
          {n.parNotif && (
            <View style={styles.notif}>
              <Send size={14} color={couleurs.texteDoux} />
              <Text style={styles.detail} numberOfLines={2}>
                Notification : {n.objet.replace('{prenom}', 'Léa')}
              </Text>
            </View>
          )}
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ alignItems: 'center' }}>
            <ApercuHtml html={html} largeur={largeur} hauteur={Math.max(1400, 900 + n.message.length / 2)} />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  intro: { fontFamily: polices.texte, fontSize: 14, lineHeight: 20, color: couleurs.texteDoux },
  groupe: { fontFamily: polices.texteGras, fontSize: 12, letterSpacing: 1.2, textTransform: 'uppercase', color: couleurs.texteDoux, marginLeft: 4 },
  sousGroupe: { fontFamily: polices.texteGras, fontSize: 14, color: couleurs.texte, marginTop: espace(1) },
  carte: { padding: 18, gap: espace(2) },
  ligne: { flexDirection: 'row', gap: 12, backgroundColor: couleurs.carte, borderRadius: 18, borderWidth: 1, borderColor: couleurs.bordure, padding: 12 },
  vignette: { width: 104, height: 66, borderRadius: 10 },
  rubrique: { fontFamily: polices.texteGras, fontSize: 11, letterSpacing: 1.4, textTransform: 'uppercase', color: couleurs.rouge },
  titre: { fontFamily: polices.texteGras, fontSize: 15, color: couleurs.texte },
  detail: { fontFamily: polices.texte, fontSize: 13, lineHeight: 18, color: couleurs.texteDoux, flexShrink: 1 },
  aide: { fontFamily: polices.texte, fontSize: 12, lineHeight: 17, color: couleurs.texteDoux },
  pastille: { fontFamily: polices.texteGras, fontSize: 12, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3, overflow: 'hidden' },
  pastilleActifs: { backgroundColor: couleurs.vertClair, color: '#0F4D2A' },
  pastilleVeille: { backgroundColor: '#F1ECFF', color: '#4A3699' },
  pastilleCanal: { backgroundColor: couleurs.discret, color: couleurs.secondaire },
  grille: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  idee: { width: 160, flexGrow: 1, maxWidth: 220, backgroundColor: couleurs.carte, borderRadius: 14, borderWidth: 1, borderColor: couleurs.bordure, overflow: 'hidden' },
  ideeImage: { width: '100%', height: 80 },
  ideeTitre: { fontFamily: polices.texteMoyen, fontSize: 13, lineHeight: 17, color: couleurs.texte },
  couverture: { width: '100%', aspectRatio: 2, borderRadius: 12, overflow: 'hidden' },
  choixImage: { width: 96, height: 48, borderRadius: 8, overflow: 'hidden', borderWidth: 2, borderColor: 'transparent' },
  champ: { fontFamily: polices.texteGras, fontSize: 13, color: couleurs.texte, flexShrink: 1 },
  saisie: { borderWidth: 1, borderColor: couleurs.saisie, borderRadius: 11, backgroundColor: couleurs.carte, paddingHorizontal: 12, paddingVertical: 10, fontFamily: polices.texte, fontSize: 15, color: couleurs.texte },
  boutons: { flexDirection: 'row', flexWrap: 'wrap', gap: espace(2), alignItems: 'center' },
  erreur: { fontFamily: polices.texte, fontSize: 14, color: couleurs.rouge },
  info: { fontFamily: polices.texteMoyen, fontSize: 14, color: couleurs.vert },
  bandeau: { fontFamily: polices.texte, fontSize: 14, lineHeight: 20, color: couleurs.texte, backgroundColor: couleurs.discret, borderRadius: 12, padding: 12 },
  fondModal: { flex: 1, backgroundColor: 'rgba(17,18,22,0.55)', alignItems: 'center', justifyContent: 'center' },
  modal: { backgroundColor: '#F4F1EC', borderRadius: 18, overflow: 'hidden', paddingBottom: 8 },
  notif: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 8, marginBottom: 8, backgroundColor: couleurs.carte, borderRadius: 12, padding: 10 },
});
