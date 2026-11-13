// Vidéos de démonstration des exercices : identifiant YouTube et miniature, pour illustrer l'exercice dans la séance.

/** Identifiant d'une vidéo YouTube (watch, shorts, youtu.be, embed, m.youtube…), ou undefined si le lien n'en est pas une. */
export function idYoutube(url: string | undefined | null): string | undefined {
  if (!url) return undefined;
  const m = url
    .trim()
    .match(
      /^(?:https?:\/\/)?(?:(?:www|m)\.)?(?:youtube\.com\/(?:watch\?(?:[^#]*&)?v=|shorts\/|embed\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{11})(?![A-Za-z0-9_-])/,
    );
  return m?.[1];
}

/** Miniature 16:9 (320 × 180) servie par YouTube pour cette vidéo. */
export function miniatureYoutube(url: string | undefined | null): string | undefined {
  const id = idYoutube(url);
  return id ? `https://i.ytimg.com/vi/${id}/mqdefault.jpg` : undefined;
}
