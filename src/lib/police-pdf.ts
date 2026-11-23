// La police des titres des PDF (Bebas Neue en base64, 77 Ko) n'est chargée qu'au moment de fabriquer un PDF :
// la version web ne la télécharge plus avant le premier écran.
let police: Promise<string> | null = null;
export function policeTitrePdf(): Promise<string> {
  police ??= import('./police-titre-pdf').then((m) => m.BEBAS_NEUE_BASE64);
  return police;
}
