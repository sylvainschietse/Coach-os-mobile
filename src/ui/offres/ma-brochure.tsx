// « Ma brochure » : le coach règle sa brochure des prix en voyant l'aperçu A4 changer en direct.
// Couleur, textes du haut, offres rangées par blocs titrés, couleur de chaque carte, parties affichées.
import { useDeferredValue, useEffect, useState } from 'react';
import { Modal, Pressable, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { brochure } from '@/data/brochure';
import { factures } from '@/data/factures';
import { useSession } from '@/data/session';
import {
  BLOCS_BROCHURE,
  blocDeLOffre,
  brochureHtml,
  CARTES_BROCHURE,
  carteDeLOffre,
  groupesBrochure,
  offresDeLaBrochure,
  REGLAGES_BROCHURE,
  type BlocBrochure,
  type CarteBrochure,
  type ReglagesBrochure,
  type VisuelsBrochure,
} from '@/domain/brochure';
import { COULEURS_FACTURE, estCouleur, type EnteteFacture } from '@/domain/factures';
import { libellePrix, type Offre } from '@/domain/offres';
import { BEBAS_NEUE_BASE64 } from '@/lib/police-titre-pdf';
import { messageErreur } from '@/lib/useCharger';
import { JOST_400_BASE64, JOST_600_BASE64, PHOTO_BROCHURE_BASE64 } from '@/lib/visuels-brochure-pdf';

import { Bouton, Carte, Chargement, ChampTexte, SousTitre, Texte } from '../composants';
import { Selecteur } from '../coque';
import { CaseACocher, Saisie } from '../crm/dossier';
import { couleurs, espace, polices } from '../theme';
import { DefilementClavier } from '../clavier';
import { ApercuHtml } from './apercu-html';

export const VISUELS_BROCHURE: VisuelsBrochure = {
  police: BEBAS_NEUE_BASE64,
  texte: { normal: JOST_400_BASE64, gras: JOST_600_BASE64 },
  photo: PHOTO_BROCHURE_BASE64,
};

/** Largeur d'une page A4 en pixels CSS (210 mm à 96 points par pouce). */
const LARGEUR_A4 = 793.7;
const hauteurA4 = (largeur: number) => Math.round((largeur * 297) / 210);
/** À partir de cette largeur d'écran, l'aperçu se met à côté des réglages. */
const LARGE = 900;

/** Coordonnées du coach telles que la brochure les montre. */
export function coachDeLaBrochure(profil: ReturnType<typeof useSession>['profil'], entete?: EnteteFacture) {
  const nom = profil?.role === 'coach' ? profil.nom : (entete?.nom ?? 'Coach');
  return { nom, telephone: entete?.telephone || undefined };
}

function Section({ titre, aide, children }: { titre: string; aide?: string; children: React.ReactNode }) {
  return (
    <Carte>
      <SousTitre>{titre}</SousTitre>
      {aide && <Texte doux style={{ fontSize: 13 }}>{aide}</Texte>}
      {children}
    </Carte>
  );
}

function PetitBouton({ libelle, onPress, desactive }: { libelle: string; onPress: () => void; desactive?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={libelle}
      onPress={onPress}
      disabled={desactive}
      style={({ pressed }) => ({
        borderWidth: 1,
        borderColor: couleurs.bordure,
        borderRadius: 8,
        paddingHorizontal: espace(2.5),
        paddingVertical: espace(1.5),
        opacity: desactive ? 0.35 : pressed ? 0.7 : 1,
        backgroundColor: couleurs.carte,
      })}
    >
      <Text style={{ fontFamily: polices.texteMoyen, fontSize: 14, color: couleurs.texte }}>{libelle}</Text>
    </Pressable>
  );
}

export function MaBrochure({ liste, lien, onFini }: { liste: Offre[]; lien: (id: string) => string; onFini: () => void }) {
  const { profil } = useSession();
  const [r, setR] = useState<ReglagesBrochure>();
  const [entete, setEntete] = useState<EnteteFacture>();
  const [saisieCouleur, setSaisieCouleur] = useState('');
  const { width, height } = useWindowDimensions();
  const marges = useSafeAreaInsets();
  const [grand, setGrand] = useState(false);
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState<string>();

  useEffect(() => {
    let actif = true;
    void Promise.all([brochure.lire(), factures.entete().catch(() => undefined)]).then(([reglages, e]) => {
      if (!actif) return;
      setR(reglages);
      setEntete(e);
      setSaisieCouleur(reglages.couleur ?? '');
    });
    return () => {
      actif = false;
    };
  }, []);

  // L'aperçu suit avec un temps de retard pendant la frappe, pour que la saisie reste fluide.
  const differe = useDeferredValue(r);
  if (!r || !differe) return <Chargement />;

  const enVente = offresDeLaBrochure(liste);
  const maj = (m: Partial<ReglagesBrochure>) => setR({ ...r, ...m });
  const majBloc = (b: BlocBrochure, m: Partial<ReglagesBrochure['blocs'][BlocBrochure]>) => maj({ blocs: { ...r.blocs, [b]: { ...r.blocs[b], ...m } } });
  const majOffre = (id: string, m: { carte?: CarteBrochure; bloc?: BlocBrochure }) => maj({ offres: { ...r.offres, [id]: { ...r.offres[id], ...m } } });
  const deplacerBloc = (i: number, sens: -1 | 1) => {
    const ordre = [...r.ordreBlocs];
    [ordre[i], ordre[i + sens]] = [ordre[i + sens], ordre[i]];
    maj({ ordreBlocs: ordre });
  };
  const changerCouleur = (c: string) => {
    setSaisieCouleur(c);
    const propre = c.trim().toUpperCase();
    if (!propre) maj({ couleur: undefined });
    else if (estCouleur(propre)) maj({ couleur: propre });
  };

  const large = width >= LARGE;
  // Aperçu : colonne fixe à côté des réglages sur grand écran ; vignette dans un coin sur téléphone, en grand au toucher.
  const largeurApercu = large ? Math.min(420, Math.round(width * 0.36)) : Math.round(Math.min(width * 0.3, 150));
  const largeurGrand = Math.min(width - 32, ((height - marges.top - marges.bottom - 120) * 210) / 297);
  const page = (l: number) =>
    brochureHtml(enVente, coachDeLaBrochure(profil, entete), { ...VISUELS_BROCHURE, logo: entete?.logo, lien, reglages: differe, apercu: l / LARGEUR_A4 });
  const groupes = groupesBrochure(enVente, r);
  const cachees = r.parBlocs ? enVente.filter((o) => !groupes.some((g) => g.offres.includes(o))) : [];

  const enregistrer = async () => {
    setErreur(undefined);
    setOccupe(true);
    try {
      await brochure.enregistrer(r);
      onFini();
    } catch (e) {
      setErreur(messageErreur(e));
    } finally {
      setOccupe(false);
    }
  };

  const reglages = (
    <View style={{ gap: espace(3) }}>
      <Texte doux style={{ fontSize: 13 }}>
        {large
          ? 'L’aperçu à droite change en direct. Rien n’est gardé tant que tu n’as pas enregistré.'
          : 'La vignette en bas à droite change en direct : touche-la pour la voir en grand. Rien n’est gardé tant que tu n’as pas enregistré.'}
      </Texte>

      <Section titre="Ma couleur" aide="Titres, puces, badge « Mon conseil » et cartes « À ma couleur ».">
        <View style={{ flexDirection: 'row', gap: espace(3), flexWrap: 'wrap', alignItems: 'center' }}>
          {COULEURS_FACTURE.map((c) => (
            <Pressable
              key={c}
              accessibilityRole="button"
              accessibilityLabel={`Couleur ${c}`}
              onPress={() => changerCouleur(c)}
              style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: c, borderWidth: 3, borderColor: r.couleur === c ? couleurs.noir : 'transparent' }}
            />
          ))}
          <View style={{ width: 130 }}>
            <ChampTexte libelle="Ou ta couleur" valeur={saisieCouleur} onChange={changerCouleur} placeholder="#D9232D" />
          </View>
        </View>
      </Section>

      <Section titre="Textes du haut" aide="Laisse un champ vide pour garder le texte de départ.">
        <Saisie libelle="Petite ligne au-dessus du titre" valeur={r.surtitre ?? ''} onChange={(v) => maj({ surtitre: v || undefined })} max={60} placeholder="Après la séance, on continue" />
        <Saisie libelle="Titre" valeur={r.titre ?? ''} onChange={(v) => maj({ titre: v || undefined })} max={60} placeholder="Ton coach. Ton programme." />
        <Saisie libelle="Fin du titre, en couleur" valeur={r.titreCouleur ?? ''} onChange={(v) => maj({ titreCouleur: v || undefined })} max={40} placeholder="Chaque mois." />
        <Saisie libelle="Phrase de présentation" long valeur={r.intro ?? ''} onChange={(v) => maj({ intro: v || undefined })} max={220} placeholder="Un abonnement simple, sans engagement…" />
        <Saisie libelle="Titre au-dessus des offres" valeur={r.titreOffres ?? ''} onChange={(v) => maj({ titreOffres: v || undefined })} max={40} placeholder="Choisis ta formule" />
      </Section>

      <Section titre="Blocs d’offres" aide="Range tes offres en blocs titrés, par exemple l’appli d’un côté, tes formules et tes séances de l’autre.">
        <CaseACocher libelle="Ranger mes offres par blocs" valeur={r.parBlocs} onChange={(v) => maj({ parBlocs: v })} />
        {r.parBlocs &&
          r.ordreBlocs.map((b, i) => {
            const n = enVente.filter((o) => blocDeLOffre(o, r) === b).length;
            return (
              <View key={b} style={{ gap: espace(1.5), borderTopWidth: 1, borderTopColor: couleurs.bordure, paddingTop: espace(2) }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: espace(2) }}>
                  <Text style={{ flex: 1, fontFamily: polices.texteMoyen, fontSize: 14, color: couleurs.texteDoux }}>
                    {`Bloc ${i + 1} · ${n} offre${n > 1 ? 's' : ''}`}
                  </Text>
                  <PetitBouton libelle="↑" onPress={() => deplacerBloc(i, -1)} desactive={i === 0} />
                  <PetitBouton libelle="↓" onPress={() => deplacerBloc(i, 1)} desactive={i === r.ordreBlocs.length - 1} />
                </View>
                <Saisie libelle="Titre du bloc" valeur={r.blocs[b].titre} onChange={(v) => majBloc(b, { titre: v })} max={40} placeholder={BLOCS_BROCHURE[b].titre} />
                <CaseACocher petite libelle="Afficher ce bloc" valeur={r.blocs[b].visible} onChange={(v) => majBloc(b, { visible: v })} />
              </View>
            );
          })}
        {cachees.length > 0 && (
          <Texte style={{ fontSize: 13, color: couleurs.rouge }}>
            {`Pas sur la brochure (bloc masqué) : ${cachees.map((o) => o.nom).join(', ')}.`}
          </Texte>
        )}
      </Section>

      <Section titre="Chaque offre" aide="La couleur de sa carte, et son bloc. L’ordre des offres se règle dans « Mes offres ».">
        {enVente.map((o) => (
          <View key={o.id} style={{ gap: espace(1.5), borderTopWidth: 1, borderTopColor: couleurs.bordure, paddingTop: espace(2) }}>
            <Text style={{ fontFamily: polices.texteMoyen, fontSize: 15, color: couleurs.texte }}>{`${o.nom} · ${libellePrix(o)}`}</Text>
            <Selecteur
              libelle="Carte"
              options={(Object.keys(CARTES_BROCHURE) as CarteBrochure[]).map((c) => ({ cle: c, libelle: CARTES_BROCHURE[c] }))}
              valeur={carteDeLOffre(o, r)}
              onChange={(c) => majOffre(o.id, { carte: c })}
            />
            {r.parBlocs && (
              <Selecteur
                libelle="Bloc"
                options={r.ordreBlocs.map((b) => ({ cle: b, libelle: r.blocs[b].titre || BLOCS_BROCHURE[b].libelle }))}
                valeur={blocDeLOffre(o, r)}
                onChange={(b) => majOffre(o.id, { bloc: b })}
              />
            )}
          </View>
        ))}
      </Section>

      <Section titre="Ce qui apparaît">
        <CaseACocher libelle="Photo dans le bandeau du haut" valeur={r.photo} onChange={(v) => maj({ photo: v })} />
        <CaseACocher libelle="Atouts (sans engagement, paiement en ligne…)" valeur={r.atouts} onChange={(v) => maj({ atouts: v })} />
        <CaseACocher libelle="Mes coordonnées et le QR code WhatsApp" valeur={r.contact} onChange={(v) => maj({ contact: v })} />
        <CaseACocher libelle="Lien d’inscription sous chaque offre" valeur={r.liens} onChange={(v) => maj({ liens: v })} />
      </Section>

      {erreur && <Texte style={{ fontSize: 14, color: couleurs.rouge }}>{erreur}</Texte>}
      <View style={{ flexDirection: 'row', gap: espace(2) }}>
        <View style={{ flex: 1 }}>
          <Bouton libelle="Enregistrer" onPress={enregistrer} chargement={occupe} />
        </View>
        <View style={{ flex: 1 }}>
          <Bouton variante="discret" libelle="Annuler" onPress={onFini} desactive={occupe} />
        </View>
      </View>
      <Bouton
        variante="discret"
        libelle="Revenir à la brochure de départ"
        onPress={() => {
          setR(REGLAGES_BROCHURE);
          setSaisieCouleur('');
        }}
        desactive={occupe}
      />
    </View>
  );

  return (
    <Modal visible animationType="slide" onRequestClose={onFini}>
      <View style={{ flex: 1, backgroundColor: couleurs.fond, paddingTop: marges.top }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: espace(4), paddingVertical: espace(3), borderBottomWidth: 1, borderBottomColor: couleurs.bordure, backgroundColor: couleurs.carte }}>
          <Text style={{ flex: 1, fontFamily: polices.texteGras, fontSize: 18, color: couleurs.texte }}>Ma brochure</Text>
          <PetitBouton libelle="Fermer" onPress={onFini} desactive={occupe} />
        </View>
        <View style={{ flex: 1, flexDirection: large ? 'row' : 'column' }}>
          <DefilementClavier style={{ flex: 1 }} contentContainerStyle={{ padding: espace(4), paddingBottom: large ? espace(6) : hauteurA4(largeurApercu) + espace(8) + marges.bottom }}>
            <View style={{ width: '100%', maxWidth: 640, alignSelf: 'center' }}>{reglages}</View>
          </DefilementClavier>
          {large ? (
            <View style={{ width: largeurApercu + espace(8), padding: espace(4), borderLeftWidth: 1, borderLeftColor: couleurs.bordure, alignItems: 'center' }}>
              <ApercuHtml html={page(largeurApercu)} largeur={largeurApercu} hauteur={hauteurA4(largeurApercu)} />
            </View>
          ) : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Voir l’aperçu en grand"
              onPress={() => setGrand(true)}
              style={{ position: 'absolute', right: espace(3), bottom: espace(3) + marges.bottom, borderRadius: 8, backgroundColor: couleurs.carte, padding: 3, boxShadow: '0 8px 24px rgba(17,17,17,0.28)' }}
            >
              {/* La vignette ne capte pas les gestes : un toucher l'ouvre en grand. */}
              <View pointerEvents="none">
                <ApercuHtml html={page(largeurApercu)} largeur={largeurApercu} hauteur={hauteurA4(largeurApercu)} />
              </View>
              <Text style={{ textAlign: 'center', fontFamily: polices.texteMoyen, fontSize: 11, color: couleurs.texteDoux, marginTop: 2 }}>Voir en grand</Text>
            </Pressable>
          )}
        </View>
        {grand && !large && (
          <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(17,18,22,0.85)', alignItems: 'center', justifyContent: 'center', gap: espace(3), paddingTop: marges.top, paddingBottom: marges.bottom }}>
            <ApercuHtml html={page(largeurGrand)} largeur={largeurGrand} hauteur={hauteurA4(largeurGrand)} />
            <PetitBouton libelle="Revenir aux réglages" onPress={() => setGrand(false)} />
          </View>
        )}
      </View>
    </Modal>
  );
}
