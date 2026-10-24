import { useFocusEffect } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { crm, ecouterCrm } from '@/data/crm';
import {
  filtrerContacts,
  formaterTelephone,
  normaliserTelephone,
  STATUTS,
  trouverDoublon,
  type ContactResume,
  type Statut,
} from '@/domain/crm';
import { useCharger, useRechargerSur } from '@/lib/useCharger';

import { Bouton, Carte, Chargement, ChampTexte, Erreur, Puce, Puces, Texte } from '../composants';
import { couleurs, espace, polices } from '../theme';
import { dateCourte, jourLisible, nomComplet, PastilleStatut } from './commun';

const ORDRE: Statut[] = ['prospect', 'booster_prevu', 'booster_fait', 'client', 'archive'];
const SOURCES = ['Instagram', 'Bouche-à-oreille', 'Google', 'Autre'];

function prochaineEtape(c: ContactResume): string {
  if (c.prochainBooster) return `Booster ${new Date(c.prochainBooster).toLocaleString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`;
  if (c.prochaineRelance) return `Relance ${jourLisible(c.prochaineRelance)}`;
  return `Ajouté le ${dateCourte(c.creeLe)}`;
}

/** Tous les contacts du coach : recherche, filtre par étape, ajout avec un simple téléphone. */
export function Contacts({ selection, onOuvrir }: { selection?: string; onOuvrir: (id: string) => void }) {
  const { donnee: contacts, erreur, recharger } = useCharger(() => crm.contacts(), 'contacts');
  useFocusEffect(recharger);
  useRechargerSur(recharger, ecouterCrm);
  const [recherche, setRecherche] = useState('');
  const [statut, setStatut] = useState<Statut>();
  const [ajout, setAjout] = useState(false);

  if (erreur) return <Erreur message={erreur} />;
  if (!contacts) return <Chargement />;
  const visibles = filtrerContacts(contacts, recherche, statut);
  const compte = (s: Statut) => contacts.filter((c) => c.statut === s).length;

  return (
    <View style={{ gap: espace(3) }}>
      {ajout ? (
        <NouveauContact
          contacts={contacts}
          onAnnuler={() => setAjout(false)}
          onOuvrir={(id) => {
            setAjout(false);
            onOuvrir(id);
          }}
        />
      ) : (
        <Bouton libelle="+ Nouveau contact" onPress={() => setAjout(true)} />
      )}
      <ChampTexte libelle="Rechercher" valeur={recherche} onChange={setRecherche} placeholder="Nom, e-mail ou numéro" />
      <Puces>
        <Puce libelle={`En cours ${contacts.filter((c) => c.statut !== 'archive').length}`} actif={!statut} onPress={() => setStatut(undefined)} />
        {ORDRE.map((s) => (
          <Puce key={s} libelle={`${STATUTS[s].libelle} ${compte(s)}`} actif={statut === s} onPress={() => setStatut(statut === s ? undefined : s)} />
        ))}
      </Puces>
      {visibles.length === 0 && <Texte doux>Aucun contact ne correspond.</Texte>}
      {visibles.map((c) => (
        <Pressable key={c.id} onPress={() => onOuvrir(c.id)} accessibilityRole="link">
          <Carte style={selection === c.id ? { borderColor: couleurs.rouge, borderWidth: 2 } : undefined}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: espace(2) }}>
              <Text style={{ fontFamily: polices.titre, fontSize: 22, color: couleurs.noir, flexShrink: 1 }}>{nomComplet(c)}</Text>
              <PastilleStatut statut={c.statut} />
            </View>
            <Texte doux style={{ fontSize: 14 }}>
              {[formaterTelephone(c.telephone), c.email].filter(Boolean).join(' · ') || 'Pas de coordonnées'}
            </Texte>
            <Texte style={{ fontSize: 14 }}>{prochaineEtape(c)}</Texte>
          </Carte>
        </Pressable>
      ))}
    </View>
  );
}

function NouveauContact({
  contacts,
  onAnnuler,
  onOuvrir,
}: {
  contacts: ContactResume[];
  onAnnuler: () => void;
  onOuvrir: (id: string) => void;
}) {
  const [prenom, setPrenom] = useState('');
  const [nom, setNom] = useState('');
  const [telephone, setTelephone] = useState('');
  const [email, setEmail] = useState('');
  const [source, setSource] = useState<string>();
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string>();

  // Vérifié pendant la saisie : on voit le doublon avant de le créer.
  const doublon = trouverDoublon(contacts, { telephone, email });
  const telInvalide = telephone.trim() !== '' && !normaliserTelephone(telephone);

  async function creer() {
    setEnvoi(true);
    try {
      const r = await crm.creerContact({ prenom, nom, telephone, email, source });
      if ('contact' in r) onOuvrir(r.contact.id);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Enregistrement impossible');
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <Carte>
      <Text style={{ fontFamily: polices.titre, fontSize: 24, color: couleurs.noir }}>Nouveau contact</Text>
      <Texte doux style={{ fontSize: 14 }}>Un prénom et un numéro suffisent : le questionnaire complétera le reste.</Texte>
      <ChampTexte libelle="Prénom" valeur={prenom} onChange={setPrenom} />
      <ChampTexte
        libelle="Téléphone"
        type="telephone"
        valeur={telephone}
        onChange={setTelephone}
        placeholder="06 12 34 56 78"
        erreur={telInvalide ? 'Numéro non reconnu' : undefined}
      />
      <ChampTexte libelle="Nom (facultatif)" valeur={nom} onChange={setNom} />
      <ChampTexte libelle="E-mail (facultatif)" type="email" valeur={email} onChange={setEmail} />
      <Text style={{ fontFamily: polices.texte, fontSize: 12, color: couleurs.texteDoux }}>Comment il t’a connu</Text>
      <Puces>
        {SOURCES.map((s) => (
          <Puce key={s} libelle={s} actif={source === s} onPress={() => setSource(source === s ? undefined : s)} />
        ))}
      </Puces>
      {doublon && (
        <View style={{ backgroundColor: couleurs.orangeClair, borderRadius: 10, padding: espace(3), gap: espace(2) }}>
          <Texte style={{ fontSize: 14 }}>
            {doublon.par === 'telephone' ? 'Ce numéro' : 'Cet e-mail'} est déjà celui de {nomComplet(doublon.contact)} (
            {STATUTS[doublon.contact.statut].libelle.toLowerCase()}).
          </Texte>
          <Bouton variante="discret" libelle={`Ouvrir la fiche de ${doublon.contact.prenom || 'ce contact'}`} onPress={() => onOuvrir(doublon.contact.id)} />
        </View>
      )}
      {erreur && <Erreur message={erreur} />}
      <Bouton
        libelle="Créer le contact"
        onPress={creer}
        chargement={envoi}
        desactive={!prenom.trim() || !!doublon || telInvalide || (!normaliserTelephone(telephone) && !email.trim())}
      />
      <Bouton variante="discret" libelle="Annuler" onPress={onAnnuler} />
    </Carte>
  );
}
