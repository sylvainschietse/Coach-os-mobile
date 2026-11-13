import { Redirect, useLocalSearchParams } from 'expo-router';

/** Ancienne adresse de la séance Booster : l'éditeur d'origine s'ouvre désormais dans la rubrique Boosters. */
export default function EcranBooster() {
  const { id, contact } = useLocalSearchParams<{ id: string; contact: string }>();
  return <Redirect href={{ pathname: '/coach', params: { onglet: 'crm', rubrique: 'Boosters', booster: id, bc: contact } }} />;
}
