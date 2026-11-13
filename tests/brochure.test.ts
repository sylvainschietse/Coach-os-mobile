import { describe, expect, it } from 'vitest';

import { brochureHtml, carteDeLOffre, groupesBrochure, lienWhatsApp, lireReglagesBrochure, offresDeLaBrochure, REGLAGES_BROCHURE } from '../src/domain/brochure';
import { deplacerOffre, MODELES, OFFRES_DEMO } from '../src/domain/offres';

const pack = { ...MODELES.seances.base, id: 'p1', ordre: 0, enLigne: false };
const retiree = { ...OFFRES_DEMO[0], id: 'x', nom: 'Ancienne', active: false };

describe('brochure des prix', () => {
  it('reprend les offres en vente, dans l’ordre choisi par le coach', () => {
    const liste = offresDeLaBrochure([{ ...pack, ordre: 2.5 }, retiree, ...OFFRES_DEMO]);
    expect(liste.map((o) => o.nom)).toEqual([OFFRES_DEMO[0].nom, OFFRES_DEMO[1].nom, pack.nom, OFFRES_DEMO[2].nom, OFFRES_DEMO[3].nom]);
  });

  it('monte ou descend une offre parmi celles en vente', () => {
    const liste = [pack, retiree, ...OFFRES_DEMO];
    expect(deplacerOffre(liste, OFFRES_DEMO[3].id, -1)).toEqual([pack.id, OFFRES_DEMO[0].id, OFFRES_DEMO[1].id, OFFRES_DEMO[3].id, OFFRES_DEMO[2].id]);
    expect(deplacerOffre(liste, pack.id, -1)).toBeUndefined();
    expect(deplacerOffre(liste, OFFRES_DEMO[3].id, 1)).toBeUndefined();
    expect(deplacerOffre(liste, retiree.id, 1)).toBeUndefined();
  });

  it('affiche prix, contenu, lien et couleur du coach, sans laisser passer de HTML', () => {
    const html = brochureHtml([{ ...OFFRES_DEMO[0], nom: 'Appli <b>' }], { nom: 'Sylvain', telephone: '06 12 34 56 78' }, { couleur: '#1F4E9E', lien: (id) => `https://exemple.fr/offre/${id}` });
    expect(html).toContain('Appli &lt;b&gt;');
    expect(html).toContain('59 €</span> <span class="suffixe">/ mois');
    expect(html).toContain('Ton programme et ton suivi dans l’appli');
    expect(html).toContain(`https://exemple.fr/offre/${OFFRES_DEMO[0].id}`);
    expect(html).toContain('#1F4E9E');
    expect(html).toContain('06 12 34 56 78');
  });

  it('met un QR code WhatsApp quand le coach a un numéro', () => {
    expect(brochureHtml(OFFRES_DEMO, { nom: 'S', telephone: '06 48 64 08 45' })).toContain('<svg');
    expect(brochureHtml(OFFRES_DEMO, { nom: 'S' })).not.toContain('<svg');
  });

  it('met le badge « Mon conseil » sur l’offre conseillée seulement', () => {
    const html = brochureHtml(OFFRES_DEMO, { nom: 'S' });
    expect(html.match(/class="badge"/g)).toHaveLength(OFFRES_DEMO.filter((o) => o.conseil).length);
  });

  it('écrit le lien WhatsApp au format international', () => {
    expect(lienWhatsApp('06 48 64 08 45')).toBe('https://wa.me/33648640845');
    expect(lienWhatsApp('+32 470 12 34 56')).toBe('https://wa.me/32470123456');
    expect(lienWhatsApp('abc')).toBeUndefined();
  });

  it('garde la couleur par défaut si la couleur est invalide', () => {
    expect(brochureHtml(OFFRES_DEMO, { nom: 'S' }, { couleur: 'red;}' })).not.toContain('red;}');
  });

  describe('réglages du coach (« Ma brochure »)', () => {
    const offres = [...OFFRES_DEMO, { ...pack, ordre: 5 }];

    it('range les offres par blocs, dans l’ordre des blocs choisi, et cache un bloc masqué', () => {
      const r = lireReglagesBrochure({ parBlocs: true, ordreBlocs: ['seances', 'formules'], blocs: { appli: { visible: false } } });
      expect(r.ordreBlocs).toEqual(['seances', 'formules', 'appli']);
      const groupes = groupesBrochure(offres, r);
      expect(groupes.map((g) => g.titre)).toEqual(['Séances', 'Avec ton coach']);
      expect(groupes[0].offres.map((o) => o.id)).toEqual([pack.id]);
      expect(groupes[1].offres.map((o) => o.nom)).toEqual(['Hybride léger', 'Hybride complet']);
    });

    it('change la couleur d’une carte et le bloc d’une offre', () => {
      const r = lireReglagesBrochure({ parBlocs: true, offres: { [pack.id]: { carte: 'clair', bloc: 'formules' } } });
      expect(carteDeLOffre(pack, r)).toBe('clair');
      expect(carteDeLOffre(pack, REGLAGES_BROCHURE)).toBe('couleur');
      expect(carteDeLOffre(OFFRES_DEMO[3], r)).toBe('sombre');
      expect(groupesBrochure(offres, r).find((g) => g.bloc === 'formules')?.offres.map((o) => o.id)).toContain(pack.id);
      expect(brochureHtml(offres, { nom: 'S' }, { reglages: r })).toContain('<div class="h3">Avec ton coach</div>');
    });

    it('reprend les textes, la couleur et les parties choisies, sans laisser passer de HTML', () => {
      const r = lireReglagesBrochure({ couleur: '#0e7c66', titre: 'Bouge <i>', intro: 'Mon intro', contact: false, atouts: false, liens: false });
      const html = brochureHtml(offres, { nom: 'S', telephone: '06 48 64 08 45' }, { reglages: r, lien: (id) => `https://x.fr/${id}` });
      expect(html).toContain('#0E7C66');
      expect(html).toContain('Bouge &lt;i&gt;');
      expect(html).toContain('Mon intro');
      expect(html).not.toContain('<svg');
      expect(html).not.toContain('class="atouts"');
      expect(html).not.toContain('https://x.fr/');
    });

    it('ignore les réglages illisibles', () => {
      const r = lireReglagesBrochure({ couleur: 'red;}', parBlocs: 'oui', ordreBlocs: ['x', 'appli', 'appli'], offres: { a: { carte: 'rose' } }, titre: '   ' });
      expect(r).toEqual({ ...REGLAGES_BROCHURE, couleur: undefined, surtitre: undefined, titre: undefined, titreCouleur: undefined, intro: undefined, titreOffres: undefined });
      expect(lireReglagesBrochure(null)).toEqual(lireReglagesBrochure({}));
    });
  });
});
