/** Horloge isolée ici : les écrans calculent tout à partir d'heures absolues. */
export const maintenantMs = () => Date.now();
export const dansSecondes = (secondes: number) => Date.now() + secondes * 1000;
