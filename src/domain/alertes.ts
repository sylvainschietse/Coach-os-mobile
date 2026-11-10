// Alertes envoyées par le serveur sur le téléphone (notifications push), selon qu'on est coach ou client.
// Les clés sont celles des déclencheurs de la base (migration notifications_push) : chacun peut couper celles qu'il
// ne veut pas recevoir. Tout est actif par défaut.

export type Role = 'coach' | 'client';

export interface Alerte {
  cle: string;
  titre: string;
  detail: string;
}

export const ALERTES: Record<Role, Alerte[]> = {
  coach: [
    { cle: 'message', titre: 'Messages', detail: 'Dès qu’un client t’écrit.' },
    { cle: 'rdv_accepte', titre: 'Séance acceptée', detail: 'Quand un client confirme une séance proposée.' },
    { cle: 'rdv_refuse', titre: 'Séance refusée ou annulée', detail: 'Quand un client refuse ou annule une séance.' },
    { cle: 'rdv_rappel', titre: 'Rappel de séance', detail: 'Une heure avant chaque séance de ton agenda.' },
    { cle: 'seance_faite', titre: 'Entraînement fait', detail: 'Quand un client termine une séance de son programme.' },
    { cle: 'paiement', titre: 'Paiement reçu', detail: 'Paiement en ligne ou changement d’offre.' },
    { cle: 'questionnaire', titre: 'Nouveau prospect', detail: 'Quand quelqu’un remplit ton questionnaire.' },
    { cle: 'bilan_semaine', titre: 'Bilan de la semaine', detail: 'Quand un client remplit son bilan.' },
    { cle: 'video', titre: 'Vidéo à corriger', detail: 'Quand un client t’envoie un mouvement filmé.' },
    { cle: 'pack_fin', titre: 'Pack bientôt fini', detail: 'Quand il reste peu de séances dans le pack d’un client.' },
    { cle: 'inactif', titre: 'Client inactif', detail: 'Le matin où un client atteint 3 semaines sans rien (réglable dans Agenda).' },
  ],
  client: [
    { cle: 'message', titre: 'Messages de mon coach', detail: 'Dès que ton coach t’écrit.' },
    { cle: 'programme', titre: 'Nouveau programme', detail: 'Quand ton coach t’envoie un programme.' },
    { cle: 'rdv_propose', titre: 'Séance à accepter', detail: 'Quand ton coach te propose une séance.' },
    { cle: 'rdv_rappel', titre: 'Rappel de séance', detail: 'La veille d’une séance avec ton coach.' },
    { cle: 'rdv_change', titre: 'Séance déplacée ou annulée', detail: 'Quand ton coach change la date ou annule.' },
    { cle: 'video_corrigee', titre: 'Vidéo corrigée', detail: 'Quand ton coach répond à ta vidéo.' },
    { cle: 'bilan_retour', titre: 'Retour sur mon bilan', detail: 'Quand ton coach répond à ton bilan de la semaine.' },
    { cle: 'facture', titre: 'Facture disponible', detail: 'Quand une nouvelle facture t’attend.' },
    { cle: 'pack_fin', titre: 'Pack bientôt fini', detail: 'Quand il te reste peu de séances.' },
  ],
};
