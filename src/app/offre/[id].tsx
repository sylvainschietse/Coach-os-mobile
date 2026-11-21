// Page publique d'une offre, ouverte depuis le lien que le coach partage (WhatsApp, Instagram, site…), sans compte.
// La personne voit l'offre et le coach, puis paie sur la page Stripe du coach. Au retour, sa fiche est déjà créée chez lui.
// Habillage (audit design, point 1) : marque CoachGo, photo, coach, prix et bouton visibles sans défiler, puis le contenu.
import { Stack, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import {
  Image,
  ImageBackground,
  Platform,
  ScrollView,
  Text,
  View,
  useWindowDimensions,
  type ViewStyle,
} from "react-native";

import { offres } from "@/data/offres";
import { useSession } from "@/data/session";
import { ouvrirLien } from "@/lib/ouvrir-lien";
import { messageErreur, useCharger } from "@/lib/useCharger";
import { contenuOffre, libellePrix } from "@/domain/offres";
import {
  Bouton,
  Carte,
  Chargement,
  Ecran,
  Erreur,
  Texte,
  Titre,
} from "@/ui/composants";
import {
  Check,
  Clock,
  Dumbbell,
  MessageCircle,
  Users,
  Utensils,
  Video,
  type LucideIcon,
} from "@/ui/icones";
import {
  Kicker,
  LigneAvantage,
  Marque,
  SCENE_PROSPECT,
  SUR_SCENE,
} from "@/ui/offres/page-prospect";
import { PhotoCoach } from "@/ui/profil-coach";
import { couleurs, espacementTitre, polices, titreSection } from "@/ui/theme";

export default function OffreParLien() {
  const { id, paiement } = useLocalSearchParams<{
    id: string;
    paiement?: string;
  }>();
  const page = useCharger(() => offres.voir(id), `offre-${id}`);
  const { profil } = useSession();
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState<string>();
  const { width } = useWindowDimensions();

  const payer = async () => {
    setErreur(undefined);
    setOccupe(true);
    try {
      const lien = await offres.payer(id);
      // Sur le web, la page Stripe remplace celle-ci et revient ici une fois le paiement fait.
      if (Platform.OS === "web" && typeof window !== "undefined")
        window.location.assign(lien);
      else await ouvrirLien(lien);
    } catch (e) {
      setErreur(messageErreur(e));
    } finally {
      setOccupe(false);
    }
  };

  if (page.erreur) {
    return (
      <Ecran>
        <Erreur message={page.erreur} onReessayer={page.recharger} />
      </Ecran>
    );
  }
  if (!page.donnee) return <Chargement />;
  const { offre, coach } = page.donnee;
  const unique = offre.periodicite === "unique";

  if (paiement === "merci") {
    return (
      <Ecran>
        <Carte>
          <Titre>Merci !</Titre>
          <Texte style={{ fontSize: 15 }}>
            {`Ton paiement pour « ${offre.nom} » est bien reçu. ${coach.nom} est prévenu${
              unique
                ? " et tes séances sont créditées."
                : profil?.role === "client"
                  ? " et ton accès est à jour."
                  : " et va t’envoyer ton accès à l’appli."
            }`}
          </Texte>
          <Texte doux style={{ fontSize: 14 }}>
            Ta facture sera dans l’appli, dans Mon compte › Mes factures.
          </Texte>
        </Carte>
      </Ecran>
    );
  }

  const lignes = contenuOffre(offre);
  const large = width >= 900;
  const action = page.donnee.paiement ? (
    <Bouton
      libelle={
        unique
          ? "Payer par carte"
          : offre.essaiJours
            ? `Commencer l’essai gratuit`
            : "Commencer maintenant"
      }
      onPress={payer}
      chargement={occupe}
    />
  ) : (
    <Text
      style={{
        fontFamily: polices.texte,
        fontSize: 15,
        lineHeight: 21,
        color: SUR_SCENE.doux,
      }}
    >
      {`Le paiement en ligne n’est pas encore ouvert : contacte ${coach.nom} pour t’inscrire.`}
    </Text>
  );
  const mentionPaiement = page.donnee.paiement ? (
    <Text
      style={{
        fontFamily: polices.texte,
        fontSize: 13,
        color: SUR_SCENE.discret,
        textAlign: large ? "left" : "center",
      }}
    >
      {unique
        ? `Paiement sécurisé par Stripe, versé directement à ${coach.nom}.`
        : `Paiement sécurisé par Stripe · résiliable à tout moment.`}
    </Text>
  ) : null;

  const photo = (
    <ImageBackground
      source={PHOTO}
      accessibilityLabel="Coach et cliente à l’entraînement"
      resizeMode="cover"
      style={
        large
          ? { flex: 1, minHeight: 420, borderRadius: 24, overflow: "hidden" }
          : { height: 380 }
      }
      // Sur le web, l'image garde sinon sa largeur d'origine (1024 px) et seul un morceau apparaît.
      imageStyle={{
        width: "100%",
        height: "100%",
        borderRadius: large ? 24 : 0,
      }}
    >
      {!large && (
        <View
          style={{
            flex: 1,
            padding: 20,
            justifyContent: "space-between",
            ...VOILE,
          }}
        >
          <Marque />
          <EnTeteOffre nom={offre.nom} accroche={offre.accroche} taille={52} />
        </View>
      )}
    </ImageBackground>
  );

  return (
    <View style={{ flex: 1, backgroundColor: couleurs.fond }}>
      <Stack.Screen
        options={{
          headerShown: false,
          title: offre.nom || "Offre de coaching",
        }}
      />
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        {!large && photo}
        <View
          style={[
            SCENE_PROSPECT,
            {
              paddingHorizontal: large ? 64 : 20,
              paddingTop: large ? 28 : 4,
              paddingBottom: large ? 56 : 28,
            },
          ]}
        >
          <View
            style={{
              width: "100%",
              maxWidth: 1200,
              alignSelf: "center",
              gap: large ? 40 : 0,
            }}
          >
            {large && <Marque />}
            <View
              style={{
                flexDirection: large ? "row" : "column",
                gap: large ? 56 : 0,
              }}
            >
              <View
                style={{
                  flex: large ? 1 : undefined,
                  gap: 18,
                  justifyContent: "center",
                }}
              >
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 14,
                  }}
                >
                  <View
                    style={{
                      borderRadius: 999,
                      borderWidth: 3,
                      borderColor: couleurs.rougeMarque,
                    }}
                  >
                    <PhotoCoach photo={coach.photo ?? undefined} taille={66} />
                  </View>
                  <View>
                    <Text
                      style={{
                        fontFamily: polices.texte,
                        fontSize: 14,
                        color: SUR_SCENE.discret,
                      }}
                    >
                      Ton coach
                    </Text>
                    <Text
                      style={{
                        fontFamily: polices.texteGras,
                        fontSize: 20,
                        color: SUR_SCENE.texte,
                      }}
                    >
                      {coach.nom}
                    </Text>
                  </View>
                </View>
                {large && (
                  <EnTeteOffre
                    nom={offre.nom}
                    accroche={offre.accroche}
                    taille={84}
                  />
                )}
                <Text
                  style={{
                    fontFamily: polices.titre,
                    fontSize: large ? 60 : 52,
                    lineHeight: large ? 62 : 54,
                    letterSpacing: 1,
                    color: SUR_SCENE.texte,
                  }}
                >
                  {libellePrix(offre)}
                </Text>
                {paiement === "annule" && (
                  <Text
                    style={{
                      fontFamily: polices.texte,
                      fontSize: 14,
                      color: SUR_SCENE.doux,
                    }}
                  >
                    Paiement interrompu : rien n’a été prélevé. Tu peux
                    reprendre quand tu veux.
                  </Text>
                )}
                <View style={{ maxWidth: large ? 420 : undefined, gap: 10 }}>
                  {action}
                  {mentionPaiement}
                </View>
                {erreur && (
                  <Text
                    style={{
                      fontFamily: polices.texte,
                      fontSize: 14,
                      color: SUR_SCENE.kicker,
                    }}
                  >
                    {erreur}
                  </Text>
                )}
              </View>
              {large && photo}
            </View>
          </View>
        </View>

        <View style={{ paddingHorizontal: large ? 64 : 20, marginTop: 28 }}>
          <View
            style={{
              width: "100%",
              maxWidth: 1200,
              alignSelf: "center",
              gap: 32,
            }}
          >
            <View style={{ gap: 14 }}>
              <Text accessibilityRole="header" style={titreSection}>
                {unique ? "Ce que tu reçois" : "Ce que tu reçois chaque mois"}
              </Text>
              <View
                style={{
                  flexDirection: large ? "row" : "column",
                  flexWrap: "wrap",
                  gap: 10,
                }}
              >
                {lignes.map((l) => (
                  <LigneAvantage
                    key={l}
                    libelle={l}
                    icone={iconeDe(l)}
                    style={
                      large ? { flexBasis: "48%", flexGrow: 1 } : undefined
                    }
                  />
                ))}
              </View>
            </View>

            {offre.accesAppli && (
              <View style={{ gap: 14 }}>
                <Text accessibilityRole="header" style={titreSection}>
                  Ta séance, dans ta poche
                </Text>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 18,
                  }}
                >
                  <Image
                    source={APERCU_SEANCE}
                    accessibilityLabel="Écran de séance CoachGo : exercices en vidéo, séries à noter"
                    style={{
                      width: large ? 200 : 140,
                      height: ((large ? 200 : 140) * 844) / 390,
                      borderRadius: 22,
                      borderWidth: 5,
                      borderColor: "#111216",
                    }}
                  />
                  <Text
                    style={{
                      flex: 1,
                      maxWidth: 420,
                      fontFamily: polices.texte,
                      fontSize: 16,
                      lineHeight: 23,
                      color: couleurs.texteDoux,
                    }}
                  >
                    {`Chaque exercice en vidéo, tes charges notées au fur et à mesure, et ${coach.nom} voit tout ce que tu fais.`}
                  </Text>
                </View>
              </View>
            )}

            {page.donnee.paiement && (
              <View style={{ maxWidth: large ? 420 : undefined, gap: 10 }}>
                <Bouton
                  libelle={
                    unique
                      ? "Payer par carte"
                      : offre.essaiJours
                        ? `Commencer l’essai gratuit`
                        : `Commencer avec ${coach.nom}`
                  }
                  onPress={payer}
                  chargement={occupe}
                />
              </View>
            )}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const PHOTO = require("../../../assets/images/programmes/coaching.jpg");
const APERCU_SEANCE = require("../../../assets/images/apercu-seance.jpg");

/** Voile sombre sur la photo pour que le titre reste lisible (dégradé sur le web, uni sur téléphone). */
const VOILE = {
  backgroundColor: "rgba(17, 18, 22, 0.35)",
  backgroundImage:
    "linear-gradient(180deg, rgba(17,18,22,0.2) 0%, rgba(17,18,22,0.55) 50%, #111216 100%)",
} as ViewStyle;

function EnTeteOffre({
  nom,
  accroche,
  taille,
}: {
  nom: string;
  accroche?: string | null;
  taille: number;
}) {
  return (
    <View style={{ gap: 6 }}>
      <Kicker>Coaching CoachGo</Kicker>
      <Text
        accessibilityRole="header"
        style={{
          fontFamily: polices.titre,
          fontSize: taille,
          lineHeight: taille * 0.98,
          letterSpacing: espacementTitre(taille),
          color: SUR_SCENE.texte,
        }}
      >
        {nom || "Ton offre"}
      </Text>
      {accroche ? (
        <Text
          style={{
            fontFamily: polices.texte,
            fontSize: 17,
            lineHeight: 24,
            color: "#E4E5E9",
          }}
        >
          {accroche}
        </Text>
      ) : null}
    </View>
  );
}

/** Une icône par ligne de l'offre, d'après son texte (voir contenuOffre). */
function iconeDe(ligne: string): LucideIcon {
  if (/séance/.test(ligne)) return Users;
  if (/appli/.test(ligne)) return Dumbbell;
  if (/Nutrition/.test(ligne)) return Utensils;
  if (/Messagerie/.test(ligne)) return MessageCircle;
  if (/vidéo/.test(ligne)) return Video;
  if (/essai/.test(ligne)) return Clock;
  return Check;
}
