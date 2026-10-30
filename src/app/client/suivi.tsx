import { Redirect } from 'expo-router';

/** Ancienne adresse : le suivi est désormais un onglet de l'espace client. */
export default function SuiviClient() {
  return <Redirect href={{ pathname: '/client', params: { onglet: 'suivi' } }} />;
}
