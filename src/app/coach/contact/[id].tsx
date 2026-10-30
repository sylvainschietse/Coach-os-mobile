import { Redirect, useLocalSearchParams } from 'expo-router';

/** Ancienne adresse de la fiche contact : la fiche d'origine est une modale de la rubrique Contacts. */
export default function FicheContact() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <Redirect href={{ pathname: '/coach', params: { onglet: 'crm', rubrique: 'Contacts', contact: id } }} />;
}
