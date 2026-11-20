// Miniature YouTube avec un gros bouton lecture, pour la vidéo intégrée de la séance par bloc.
import { Play } from 'lucide-react-native';
import { Image, Pressable, View, type ViewStyle } from 'react-native';

export function Miniature({ image, nom, style, onPress }: { image: string; nom: string; style: ViewStyle; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`Lire la démonstration : ${nom}`} onPress={onPress} style={({ pressed }) => [style, pressed && { opacity: 0.85 }]}>
      <Image source={{ uri: image }} resizeMode="cover" style={{ width: '100%', height: '100%' }} />
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.25)' }}>
        <View style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: 'rgba(255,255,255,0.92)', alignItems: 'center', justifyContent: 'center' }}>
          <Play size={20} color="#111216" fill="#111216" style={{ marginLeft: 3 }} />
        </View>
      </View>
    </Pressable>
  );
}
