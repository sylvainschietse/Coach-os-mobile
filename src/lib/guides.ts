import { adresseWeb } from './adresse-web';

/** Guides nutrition offerts (dossier public/, publiés avec le site web). */
export const LIEN_GUIDE_MACROS = process.env.EXPO_PUBLIC_LIEN_GUIDE_MACROS || adresseWeb('/guide-macros-mode-d-emploi.pdf');
/** Version pour les prospects sans l'appli (Booster non converti) : elle propose l'appli plutôt que l'option nutrition. */
export const LIEN_GUIDE_PROSPECTS = process.env.EXPO_PUBLIC_LIEN_GUIDE_PROSPECTS || adresseWeb('/guide-macros-prospects.pdf');
