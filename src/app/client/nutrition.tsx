import { Redirect } from 'expo-router';

/** Ancienne adresse : la nutrition est désormais un onglet de l'espace client. */
export default function NutritionClient() {
  return <Redirect href={{ pathname: '/client', params: { onglet: 'nutrition' } }} />;
}
