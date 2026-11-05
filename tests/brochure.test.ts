import { describe, expect, it } from 'vitest';

import { brochureHtml, lienWhatsApp, offresDeLaBrochure } from '../src/domain/brochure';
import { MODELES, OFFRES_DEMO } from '../src/domain/offres';

const pack = { ...MODELES.seances.base, id: 'p1', ordre: 0, enLigne: false };
const retiree = { ...OFFRES_DEMO[0], id: 'x', nom: 'Ancienne', active: false };

describe('brochure des prix', () => {
  it('reprend les offres en vente, abonnements puis packs', () => {
    const liste = offresDeLaBrochure([pack, retiree, ...OFFRES_DEMO]);
    expect(liste.map((o) => o.nom)).toEqual([...OFFRES_DEMO.map((o) => o.nom), pack.nom]);
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

  it('écrit le lien WhatsApp au format international', () => {
    expect(lienWhatsApp('06 48 64 08 45')).toBe('https://wa.me/33648640845');
    expect(lienWhatsApp('+32 470 12 34 56')).toBe('https://wa.me/32470123456');
    expect(lienWhatsApp('abc')).toBeUndefined();
  });

  it('garde la couleur par défaut si la couleur est invalide', () => {
    expect(brochureHtml(OFFRES_DEMO, { nom: 'S' }, { couleur: 'red;}' })).not.toContain('red;}');
  });
});
