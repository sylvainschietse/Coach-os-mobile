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
          nom: 'Benali', prenom: 'Karim', telephone: '06 98 76 54 32', email: 'karim.benali@exemple.fr', dateNaissance: '14/03/1990',
          motivation: 'Je veux reprendre la muscu après 2 ans d’arrêt.', objectif: 'Prendre du muscle',
          pourquoi: 'Je me sens moins en forme et j’ai mal au dos au travail.', echeance: 'Mariage de mon frère le 10 juin',
          sommeilHeures: 'Entre 6 et 7 h', sommeilQualite: '5', reveilRepose: 'Parfois',
          alimentation: 'À améliorer', repas: '2', grignotage: 'Souvent', proteines: 'Rarement', fruitsLegumes: 'Non',
          ultraTransformes: '3 à 5 fois par semaine', sel: 'Parfois', boissonsSucrees: 'Plusieurs fois par semaine', restaurant: '1 à 2 fois par semaine',
          eau: 'Entre 1 et 1,5 L', stress: '7', tabac: 'Non', alcool: 'Occasionnellement',
          activiteReguliere: 'Oui', activites: 'Musculation, Autre', activitesAutre: 'Padel', anciennete: 'Plus de 2 ans',
          seancesActuelles: '1 séance', seancesPossibles: '3 séances', lieu: 'En salle',
          typesAimes: 'Musculation, HIIT', aEviter: 'Le cardio long sur tapis.', douleur: 'Oui',
          douleurDetail: 'Épaule droite, depuis 2 ans, quand je pousse au-dessus de la tête.', contreIndication: 'Non',
          attentes: 'Avoir un programme clair, Corriger ma technique', dejaCoach: 'Non', motivationNote: '8',
          empeche: 'Mes horaires de travail changent souvent.', obstacle: 'Manque de temps',
        },
      },
      {
        id: 'q-sophie',
        contactId: 'contact-sophie',
        recuLe: ilYA(8, 12),
        alertes: [],
        reponses: {
          nom: 'Laurent', prenom: 'Sophie', telephone: '06 77 88 99 00', email: 'sophie.l@exemple.fr', dateNaissance: '02/09/1985',
          motivation: 'Retrouver de l’énergie et me sentir mieux dans mon corps.', objectif: 'Retrouver la forme',
          pourquoi: 'Je suis fatiguée tout le temps depuis la naissance de mon deuxième.',
          sommeilHeures: 'Moins de 6 h', sommeilQualite: '4', reveilRepose: 'Rarement',
          alimentation: 'Plutôt équilibrée', repas: '3', grignotage: 'Occasionnellement', proteines: 'Souvent', fruitsLegumes: 'Oui',
          ultraTransformes: 'Rarement', sel: 'Jamais', boissonsSucrees: 'Jamais', restaurant: 'Rarement',
          eau: 'Moins de 1 L', stress: '6', tabac: 'Non', alcool: 'Occasionnellement',
          activiteReguliere: 'Non', anciennete: 'Je débute', seancesActuelles: 'Aucune', seancesPossibles: '2 séances', lieu: 'En salle et à la maison',
          materiel: 'Tapis, Élastiques', typesAimes: 'Je n’ai pas encore de préférence', douleur: 'Non', contreIndication: 'Non',
          attentes: 'Me remettre en forme, Être motivé(e), Être suivi régulièrement', dejaCoach: 'Oui',
          coachApprecie: 'Les séances variées.', coachDecu: 'Pas de suivi entre les séances.', motivationNote: '7', obstacle: 'Fatigue',
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
