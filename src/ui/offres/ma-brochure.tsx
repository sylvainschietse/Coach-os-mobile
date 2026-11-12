// « Ma brochure » : le coach règle sa brochure des prix en voyant l'aperçu A4 changer en direct.
// Couleur, textes du haut, offres rangées par blocs titrés, couleur de chaque carte, parties affichées.
import { useDeferredValue, useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

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
import { ApercuHtml } from './apercu-html';

export const VISUELS_BROCHURE: VisuelsBrochure = {
  police: BEBAS_NEUE_BASE64,
  texte: { normal: JOST_400_BASE64, gras: JOST_600_BASE64 },
  photo: PHOTO_BROCHURE_BASE64,
};

/** Largeur d'une page A4 en pixels CSS (210 mm à 96 points par pouce). */
const LARGEUR_A4 = 793.7;

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
  const [largeur, setLargeur] = useState(0);
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

  const echelle = largeur / LARGEUR_A4;
  const html = largeur
    ? brochureHtml(enVente, coachDeLaBrochure(profil, entete), { ...VISUELS_BROCHURE, logo: entete?.logo, lien, reglages: differe, apercu: echelle })
    : '';
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

  return (
    <View style={{ gap: espace(3) }}>
      <Carte>
        <SousTitre>Ma brochure</SousTitre>
        <Texte doux style={{ fontSize: 13 }}>Règle ta brochure ci-dessous : l’aperçu change en direct. Rien n’est gardé tant que tu n’as pas enregistré.</Texte>
        <View onLayout={(e) => setLargeur(Math.floor(e.nativeEvent.layout.width))} style={{ width: '100%', alignItems: 'center' }}>
          {largeur > 0 && <ApercuHtml html={html} largeur={largeur} hauteur={Math.round((largeur * 297) / 210)} />}
        </View>
      </Carte>

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
}
