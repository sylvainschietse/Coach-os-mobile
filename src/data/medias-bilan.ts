// Photos et vidéos du bilan postural, gardées pour être revues avec les repères dessinés dessus.
// Vidéos : compartiment privé « videos-mouvement », dossier du client (<client>/bilan-<id>.<ext>) : le coach y dépose,
// lit et efface déjà ses vocaux. Elles ne sont pas dans la table videos_mouvement : ni la liste « Mes vidéos » du client
// ni l'effacement à 30 jours ne les touchent.
// Photos : compartiment privé « documents », dossier du coach (<coach>/bilans/<id>.<ext>).
// Le chemin gardé dans le bilan commence par le compartiment : « videos-mouvement:<chemin> » ou « documents:<chemin> ».
// En démo, la photo ou la vidéo reste sur l'appareil : seule son adresse locale est gardée (« local:<adresse> »).
import type { SupabaseClient } from '@supabase/supabase-js';

import { verifierFichier } from '@/domain/documents';
import { extension, typeSimple, verifierVideo } from '@/domain/videos-mouvement';
import { nouvelId } from '@/lib/identifiant';

import { supabase } from './supabase';
import type { FichierMedia } from './videos-mouvement';

export interface DepotMediasBilan {
  /** Garde la photo ou la vidéo et renvoie son chemin. */
  deposer(clientId: string, media: 'photo' | 'video', f: FichierMedia): Promise<string>;
  /** Lien de courte durée pour l'afficher. */
  lien(chemin: string): Promise<string>;
  /** Efface une photo ou une vidéo remplacée (sans erreur si elle n'existe plus). */
  retirer(chemin: string): Promise<void>;
}

const EXT_IMAGES: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic' };

function controler(media: 'photo' | 'video', f: FichierMedia) {
  const refus = media === 'video' ? verifierVideo(f) : verifierFichier({ nom: 'photo', type: typeSimple(f.type), taille: f.taille });
  if (refus) throw new Error(refus);
}

async function octets(d: Blob | ArrayBuffer): Promise<ArrayBuffer> {
  return d instanceof ArrayBuffer ? d : await d.arrayBuffer();
}

const decouper = (chemin: string) => {
  const i = chemin.indexOf(':');
  return { compartiment: chemin.slice(0, i), cle: chemin.slice(i + 1) };
};

export const mediasBilanDemo: DepotMediasBilan = {
  async deposer(_clientId, media, f) {
    controler(media, f);
    if (!f.uri) throw new Error('Fichier introuvable sur cet appareil.');
    return `local:${f.uri}`;
  },
  async lien(chemin) {
    return decouper(chemin).cle;
  },
  async retirer() {},
};

export function creerMediasBilanSupabase(db: SupabaseClient): DepotMediasBilan {
  return {
    async deposer(clientId, media, f) {
      controler(media, f);
      const type = typeSimple(f.type);
      let compartiment: string;
      let cle: string;
      if (media === 'video') {
        compartiment = 'videos-mouvement';
        cle = `${clientId}/bilan-${nouvelId()}.${extension(type)}`;
      } else {
        const coach = await db.rpc('mon_coach_id');
        if (coach.error || !coach.data) throw new Error('Session coach introuvable : reconnecte-toi.');
        compartiment = 'documents';
        cle = `${coach.data as string}/bilans/${nouvelId()}.${EXT_IMAGES[type] ?? 'jpg'}`;
      }
      const envoi = await db.storage.from(compartiment).upload(cle, await octets(f.donnees), { contentType: type, upsert: false });
      if (envoi.error) throw new Error(envoi.error.message);
      return `${compartiment}:${cle}`;
    },
    async lien(chemin) {
      const { compartiment, cle } = decouper(chemin);
      if (compartiment === 'local') return cle;
      const { data, error } = await db.storage.from(compartiment).createSignedUrl(cle, 3600);
      if (error || !data) throw new Error('Cette vidéo n’est plus accessible.');
      return data.signedUrl;
    },
    async retirer(chemin) {
      const { compartiment, cle } = decouper(chemin);
      if (compartiment === 'local') return;
      await db.storage.from(compartiment).remove([cle]).catch(() => undefined);
    },
  };
}

export const mediasBilan: DepotMediasBilan = supabase ? creerMediasBilanSupabase(supabase) : mediasBilanDemo;
