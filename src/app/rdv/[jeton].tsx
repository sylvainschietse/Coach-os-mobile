// Page ouverte depuis le mail du rendez-vous, sans compte : confirmer, refuser ou annuler (jusqu'à 24 h avant),
// sinon appeler le coach. Le lien contient un jeton propre à ce rendez-vous.
import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { agenda, type ActionClient } from '@/data/agenda';
import { annulableEnLigne, cleJour, heureDe, STATUTS_RDV, TYPES_RDV } from '@/domain/agenda';
import { normaliserTelephone } from '@/domain/crm';
import { ouvrirLien } from '@/lib/ouvrir-lien';
import { maintenantMs } from '@/lib/temps';
import { useCharger } from '@/lib/useCharger';
import { jourLong, majuscule } from '@/ui/agenda/commun';
import { Bouton, Carte, Chargement, Ecran, Erreur, Texte, Titre } from '@/ui/composants';
import { couleurs, espace } from '@/ui/theme';

const MERCI: Record<ActionClient, string> = {
  confirme: 'C’est noté, ton coach sait que tu viens. À bientôt !',
  refuse: 'C’est noté, ton coach est prévenu et te proposera un autre créneau.',
  annule: 'Rendez-vous annulé, ton coach est prévenu.',
};

export default function RendezVousParLien() {
  const { jeton, action } = useLocalSearchParams<{ jeton: string; action?: string }>();
  const rdv = useCharger(async () => ({ r: await agenda.parLien(jeton) }), `rdv-${jeton}`);
  const [maintenant] = useState(maintenantMs);
  const [fait, setFait] = useState<ActionClient>();
  const [occupe, setOccupe] = useState<ActionClient>();
  const [erreur, setErreur] = useState<string>();
  const [annulation, setAnnulation] = useState(action === 'annuler');

  async function agir(a: ActionClient) {
    setOccupe(a);
    setErreur(undefined);
    try {
      await agenda.repondreParLien(jeton, a);
      setFait(a);
      rdv.recharger();
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Réponse non enregistrée.');
    } finally {
      setOccupe(undefined);
    }
  }

  const r = rdv.donnee?.r;
  const telephone = normaliserTelephone(r?.telephone);
  const avenir = r && new Date(r.debut).getTime() > maintenant;
  const annulable = r && annulableEnLigne(r, new Date(maintenant));
  return (
    <Ecran>
      <Stack.Screen options={{ title: 'Mon rendez-vous' }} />
      {rdv.erreur && <Erreur message={rdv.erreur} onReessayer={rdv.recharger} />}
      {!rdv.donnee && !rdv.erreur && <Chargement />}
      {rdv.donnee && !r && <Texte>Ce lien ne correspond à aucun rendez-vous. Il a peut-être été supprimé : contacte ton coach.</Texte>}
      {r && (
        <Carte>
          <Titre>{TYPES_RDV[r.type]} avec {r.coach}</Titre>
          <Texte style={{ fontSize: 17 }}>
            {majuscule(jourLong(cleJour(r.debut)))} · {heureDe(r.debut)}–{heureDe(r.fin)}
          </Texte>
          <Texte doux style={{ fontSize: 15 }}>
            Pour {r.prenoms}
            {r.lieu ? ` · ${r.lieu}` : ''}
          </Texte>
          <Texte style={{ fontSize: 15 }}>Statut : {STATUTS_RDV[r.statut]}</Texte>
          {fait && <Texte style={{ fontSize: 15, color: couleurs.vert }}>{MERCI[fait]}</Texte>}
          {r.lienVisio && avenir && <Bouton variante="discret" libelle="Rejoindre la visio" onPress={() => ouvrirLien(r.lienVisio!).catch(() => undefined)} />}
          {avenir && (r.statut === 'propose' || r.statut === 'refuse') && (
            <View style={{ gap: espace(2) }}>
              <Bouton libelle="Je confirme" onPress={() => agir('confirme')} chargement={occupe === 'confirme'} desactive={!!occupe} />
              {r.statut === 'propose' && <Bouton variante="discret" libelle="Je ne peux pas" onPress={() => agir('refuse')} chargement={occupe === 'refuse'} desactive={!!occupe} />}
            </View>
          )}
          {avenir && (r.statut === 'propose' || r.statut === 'confirme') &&
            (annulable ? (
              annulation ? (
                <View style={{ gap: espace(2) }}>
                  <Texte style={{ fontSize: 15 }}>Annuler ce rendez-vous ?</Texte>
                  <Bouton libelle="Oui, annuler" onPress={() => agir('annule')} chargement={occupe === 'annule'} desactive={!!occupe} />
                  <Bouton variante="discret" libelle="Non, garder" onPress={() => setAnnulation(false)} />
                </View>
              ) : (
                r.statut === 'confirme' && <Bouton variante="discret" libelle="Annuler ce rendez-vous" onPress={() => setAnnulation(true)} />
              )
            ) : (
              <>
                <Texte doux style={{ fontSize: 14 }}>Moins de 24 h avant : pour annuler, appelle {r.coach}.</Texte>
                {telephone && <Bouton variante="discret" libelle={`Appeler ${r.coach}`} onPress={() => ouvrirLien(`tel:+${telephone}`).catch(() => undefined)} />}
              </>
            ))}
          {erreur && <Texte style={{ fontSize: 14, color: couleurs.rouge }}>{erreur}</Texte>}
        </Carte>
      )}
    </Ecran>
  );
}
