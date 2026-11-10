// Attribuer un programme ou une séance à un client depuis la bibliothèque : une copie à son nom, rangée dans un cycle
// de son suivi (un cycle encore vide, ou un nouveau cycle de quatre semaines).
import { useMemo, useState } from 'react';
import { Text, View } from 'react-native';

import { attribuerAuClient, entrainement, type CibleAttribution } from '@/data/entrainement';
import { aujourdhuiParis, correspondRecherche } from '@/domain/entrainement';
import type { SuiviClient } from '@/domain/entrainement-etat';
import { useCharger } from '@/lib/useCharger';

import { Modale, Recherche } from '../crm/dossier';
import { couleurs, polices } from '../theme';
import { Action, CaseSelection, Etat, jourCourt, Ligne, ListeChoix, ts } from './commun';

const NOUVEAU = 'nouveau';

export function AttributionClient({
  coachId,
  clientId: clientFixe,
  source,
  nom,
  onFermer,
}: {
  coachId: string;
  /** Depuis la fiche d'un client : il est déjà choisi, la liste des clients n'est pas montrée. */
  clientId?: string;
  source: { programmeId: string } | { seanceId: string };
  nom: string;
  onFermer: () => void;
}) {
  const { donnee, erreur: erreurLecture } = useCharger(() => entrainement.suivis(coachId), `suivis-${coachId}`);
  const [q, setQ] = useState('');
  const [clientId, setClientId] = useState(clientFixe ?? '');
  const [cycleId, setCycleId] = useState(NOUVEAU);
  const [activer, setActiver] = useState(true);
  const [occupe, setOccupe] = useState(false);
  const [etat, setEtat] = useState<{ message?: string; erreur?: string }>({});

  const clients = useMemo(() => (donnee ? donnee.filter((c) => correspondRecherche(c.nom, q)) : null), [donnee, q]);
  const client = donnee?.find((c) => c.clientId === clientId);
  const vides = client?.cycles.filter((c) => !c.programmeId && c.statut !== 'Terminé') ?? [];
  const actif = client?.cycles.find((c) => c.statut === 'Actif');
  const fait = !!etat.message;

  const choisirClient = (c: SuiviClient) => {
    setClientId(c.clientId);
    setCycleId(NOUVEAU);
    setEtat({});
  };

  const valider = async () => {
    if (!client || occupe) return;
    setOccupe(true);
    setEtat({});
    try {
      const cible: CibleAttribution = cycleId === NOUVEAU ? { nouveau: true, activer } : { cycleId };
      const r = await attribuerAuClient(coachId, source, client, cible, client.suivi ? undefined : { debut: aujourdhuiParis() });
      setEtat({
        message: r.active
          ? `Attribué à ${client.nom} dans « ${r.cycle} », visible dès maintenant dans son espace.`
          : `Attribué à ${client.nom} dans « ${r.cycle} » (prêt). Activez ce cycle depuis Suivis quand il doit commencer.`,
      });
    } catch (e) {
      setEtat({ erreur: e instanceof Error ? e.message : 'Attribution impossible' });
    } finally {
      setOccupe(false);
    }
  };

  return (
    <Modale
      titre={client && clientFixe ? `Attribuer « ${nom} » à ${client.nom}` : `Attribuer « ${nom} »`}
      largeur={640}
      onFermer={() => !occupe && onFermer()}
      pied={
        <Ligne style={{ justifyContent: 'flex-end' }}>
          <Action libelle={fait ? 'Fermer' : 'Annuler'} variante="contour" desactive={occupe} onPress={onFermer} />
          {!fait && <Action libelle="Attribuer" chargement={occupe} desactive={!client} onPress={valider} />}
        </Ligne>
      }
    >
      <Text style={ts.doux}>Le client reçoit une copie à son nom. Vous pouvez la modifier pour lui sans toucher au modèle de la bibliothèque.</Text>
      {!clientFixe && <Text style={ts.titreChamp}>Client</Text>}
      {!clientFixe && (
        <View style={{ flexDirection: 'row' }}>
          <Recherche valeur={q} onChange={setQ} libelle="Rechercher un client" placeholder="Rechercher un client…" />
        </View>
      )}
      {erreurLecture ? (
        <Etat erreur={erreurLecture} />
      ) : clientFixe ? (
        donnee && !client && <Etat erreur="Ce client n’est plus actif : impossible de lui attribuer un programme." />
      ) : (
        <ListeChoix
          elements={clients}
          cle={(c) => c.clientId}
          libelle={(c) => c.nom}
          detail={(c) => (c.suivi ? `Suivi depuis le ${jourCourt(c.suivi.debut)}` : 'Pas encore de suivi')}
          choisi={clientId}
          onChoisir={choisirClient}
          vide="Aucun client actif ne correspond."
        />
      )}

      {client && !client.suivi && <Text style={ts.texte}>{client.nom} n’a pas encore de suivi : il démarrera aujourd’hui avec ce programme.</Text>}

      {client && (
        <View style={{ gap: 8 }}>
          <Text style={ts.titreChamp}>Cycle</Text>
          <ListeChoix
            elements={[
              ...vides.map((c) => ({ id: c.id, libelle: `Remplir « ${c.nom} »`, detail: `${jourCourt(c.debut)} → ${jourCourt(c.fin)} · ${c.statut}` })),
              { id: NOUVEAU, libelle: 'Nouveau cycle de 4 semaines', detail: actif ? `Après « ${actif.nom} », à activer ensuite` : 'À la suite des cycles existants' },
            ]}
            cle={(c) => c.id}
            libelle={(c) => c.libelle}
            detail={(c) => c.detail}
            choisi={cycleId}
            onChoisir={(c) => setCycleId(c.id)}
          />
          {cycleId === NOUVEAU && !actif && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <CaseSelection nom="Activer le cycle tout de suite" valeur={activer} onChange={setActiver} />
              <Text style={[ts.texte, { flex: 1, fontFamily: polices.texteMoyen }]}>Activer tout de suite (le client le voit dans son espace)</Text>
            </View>
          )}
          {actif && cycleId === NOUVEAU && <Text style={[ts.doux, { color: couleurs.texteDoux }]}>Le cycle en cours « {actif.nom} » n’est pas modifié.</Text>}
        </View>
      )}
      <Etat {...etat} />
    </Modale>
  );
}
