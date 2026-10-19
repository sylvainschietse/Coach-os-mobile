// Contacts fictifs du mode démo, datés par rapport à aujourd'hui pour que la journée du coach soit remplie.
import { ajouterJours, jourLocal, type Carnet } from '@/domain/crm';

export function carnetDemo(maintenant: Date): Carnet {
  const jour = jourLocal(maintenant);
  const ilYA = (jours: number, heure = 10) => {
    const d = new Date(maintenant);
    d.setDate(d.getDate() - jours);
    d.setHours(heure, 0, 0, 0);
    return d.toISOString();
  };
  const dans = (jours: number, heure: number, minutes = 0) => {
    const d = new Date(maintenant);
    d.setDate(d.getDate() + jours);
    d.setHours(heure, minutes, 0, 0);
    return d.toISOString();
  };

  return {
    contacts: [
      { id: 'contact-lea', prenom: 'Léa', nom: 'Martin', telephone: '33611223344', email: 'lea@exemple.fr', statut: 'client', clientId: 'client-lea', source: 'Instagram', creeLe: ilYA(60) },
      { id: 'contact-thomas', prenom: 'Thomas', nom: 'Bernard', telephone: '33622334455', statut: 'client', clientId: 'client-thomas', source: 'Bouche-à-oreille', creeLe: ilYA(45) },
      { id: 'contact-julie', prenom: 'Julie', nom: '', telephone: '33612345678', statut: 'prospect', source: 'Instagram', creeLe: ilYA(2, 18) },
      { id: 'contact-karim', prenom: 'Karim', nom: 'Benali', telephone: '33698765432', email: 'karim.benali@exemple.fr', statut: 'booster_prevu', source: 'Google', creeLe: ilYA(5) },
      { id: 'contact-sophie', prenom: 'Sophie', nom: 'Laurent', telephone: '33677889900', email: 'sophie.l@exemple.fr', statut: 'booster_fait', source: 'Bouche-à-oreille', creeLe: ilYA(9) },
      { id: 'contact-marc', prenom: 'Marc', nom: 'Petit', telephone: '33655443322', statut: 'archive', statutAvantArchive: 'prospect', notes: 'Pas disponible avant l’été.', creeLe: ilYA(40) },
    ],
    questionnaires: [
      {
        id: 'q-karim',
        contactId: 'contact-karim',
        recuLe: ilYA(4, 21),
        alertes: [],
        reponses: {
          prenom: 'Karim', nom: 'Benali', telephone: '06 98 76 54 32', email: 'karim.benali@exemple.fr', dateNaissance: '14/03/1990',
          objectif: 'Prendre du muscle', objectifDetail: 'Reprendre la muscu après 2 ans d’arrêt, gagner 5 kg.',
          activite: '1 fois par semaine', blessures: 'Douleur ancienne à l’épaule droite.', disponibilites: 'Soirs de semaine après 18 h',
          source: 'Google',
        },
      },
      {
        id: 'q-sophie',
        contactId: 'contact-sophie',
        recuLe: ilYA(8, 12),
        alertes: [],
        reponses: {
          prenom: 'Sophie', nom: 'Laurent', telephone: '06 77 88 99 00', email: 'sophie.l@exemple.fr',
          objectif: 'Remise en forme', objectifDetail: 'Retrouver de l’énergie et me sentir mieux dans mon corps.',
          activite: 'Pas de sport', blessures: 'Rien à signaler', disponibilites: 'Mardi et jeudi midi', source: 'Bouche-à-oreille',
        },
      },
    ],
    boosters: [
      { id: 'b-karim', contactId: 'contact-karim', date: dans(1, 18, 30), statut: 'prevu', priorites: [] },
      {
        id: 'b-sophie',
        contactId: 'contact-sophie',
        date: ilYA(2, 12),
        statut: 'fait',
        paye: true,
        tests: 'Squat poids du corps : 20 rép. propres. Gainage : 45 s. Test de marche 6 min : 540 m.',
        compteRendu: 'Bonne motivation, base cardio faible. Mobilité de hanches limitée.',
        priorites: ['Mobilité des hanches', 'Cardio doux 2 fois par semaine', 'Sommeil et récupération'],
      },
    ],
    relances: [
      { id: 'r-julie', contactId: 'contact-julie', echeance: ajouterJours(jour, -1), modele: 'questionnaire' },
      { id: 'r-karim', contactId: 'contact-karim', echeance: jour, modele: 'rappel_booster' },
      { id: 'r-sophie', contactId: 'contact-sophie', echeance: jour, modele: 'suivi_booster' },
    ],
  };
}
