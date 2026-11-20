// Le clavier du téléphone ne doit jamais cacher ce qu'on écrit. Sur Android (affichage bord à bord), la fenêtre ne se
// rétrécit plus quand le clavier sort, et sur iPhone elle ne l'a jamais fait : on mesure donc nous-mêmes ce que le
// clavier recouvre, on ajoute cette hauteur sous le contenu et on fait remonter le champ actif juste au-dessus.
// Sur navigateur mobile, le clavier réduit la zone visible (visualViewport) : même principe.
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState, type ComponentRef, type ReactNode } from 'react';
import { Dimensions, Keyboard, Platform, ScrollView, TextInput, View, type KeyboardEvent, type NativeScrollEvent, type NativeSyntheticEvent, type ScrollViewProps, type StyleProp, type ViewStyle } from 'react-native';

/** Espace laissé entre le bas du champ et le haut du clavier. */
const MARGE = 24;
const web = Platform.OS === 'web';

/** Haut du clavier, en coordonnées de la fenêtre ; undefined quand il est rangé. */
function useHautClavier() {
  const [haut, setHaut] = useState<number>();
  useEffect(() => {
    if (web) {
      const vv = typeof window !== 'undefined' ? window.visualViewport : null;
      if (!vv) return;
      const maj = () => {
        // Moins de 120 px de différence : barre d'adresse qui bouge, pas un clavier.
        const cache = window.innerHeight - vv.height - vv.offsetTop;
        setHaut(cache > 120 ? vv.height + vv.offsetTop : undefined);
      };
      vv.addEventListener('resize', maj);
      return () => vv.removeEventListener('resize', maj);
    }
    const montre = (e: KeyboardEvent) => setHaut(e.endCoordinates.screenY);
    const cache = () => setHaut(undefined);
    const abonnements =
      Platform.OS === 'ios'
        ? [Keyboard.addListener('keyboardWillShow', montre), Keyboard.addListener('keyboardWillChangeFrame', montre), Keyboard.addListener('keyboardWillHide', cache)]
        : [Keyboard.addListener('keyboardDidShow', montre), Keyboard.addListener('keyboardDidHide', cache)];
    return () => abonnements.forEach((a) => a.remove());
  }, []);
  return haut;
}

/** Hauteur cachée par le clavier en bas de l'écran (0 s'il est rangé). Sert aux fenêtres (Modale) pour se rétrécir. */
export function useHauteurClavier() {
  const haut = useHautClavier();
  if (haut === undefined) return 0;
  // Sur téléphone, le haut du clavier se compare à la hauteur de l'écran ; sur navigateur, à celle de la page.
  const hauteur = web ? window.innerHeight : Dimensions.get('screen').height;
  return Math.max(0, hauteur - haut);
}

/**
 * ScrollView qui garde le champ en cours de saisie au-dessus du clavier. Remplace ScrollView partout où l'on écrit.
 * Le champ actif est surveillé tant que le clavier est sorti : passer au champ suivant le fait remonter aussi.
 */
export const DefilementClavier = forwardRef<ComponentRef<typeof ScrollView>, ScrollViewProps>(function DefilementClavier({ children, onScroll, ...props }, ref) {
  const interne = useRef<ComponentRef<typeof ScrollView>>(null);
  useImperativeHandle(ref, () => interne.current!, []);
  const y = useRef(0);
  const haut = useHautClavier();
  const [recouvert, setRecouvert] = useState(0);

  const remonter = useCallback((hautClavier: number) => {
    if (web) {
      const actif = typeof document !== 'undefined' ? (document.activeElement as HTMLElement | null) : null;
      if (actif && /^(INPUT|TEXTAREA)$/.test(actif.tagName)) actif.scrollIntoView({ block: 'center', behavior: 'smooth' });
      return;
    }
    const champ = TextInput.State.currentlyFocusedInput();
    const vue = interne.current;
    if (!champ || !vue) return;
    // Le champ doit être dans cette liste : une autre liste ouverte par-dessus s'en occupe elle-même.
    champ.measureInWindow((_x, cy, _l, ch) => {
      vue.measureInWindow((_vx, vy) => {
        if (cy < vy) return;
        const depasse = cy + ch + MARGE - hautClavier;
        if (depasse > 0) vue.scrollTo({ y: y.current + depasse, animated: true });
      });
    });
  }, []);

  useEffect(() => {
    if (haut === undefined) return;
    const vue = interne.current;
    if (!web)
      vue?.measureInWindow((_x, vy, _l, vh) => {
        setRecouvert(Math.max(0, vy + vh - haut));
      });
    // On attend que la place sous le contenu soit ajoutée (et que le clavier ait fini de monter sur iPhone).
    const t = setTimeout(() => remonter(haut), web ? 250 : 120);
    // Passage d'un champ à l'autre, clavier déjà sorti.
    let dernier = web ? null : TextInput.State.currentlyFocusedInput();
    const suivi = web
      ? undefined
      : setInterval(() => {
          const actif = TextInput.State.currentlyFocusedInput();
          if (actif && actif !== dernier) {
            dernier = actif;
            remonter(haut);
          }
        }, 250);
    const surFocus = () => setTimeout(() => remonter(haut), 50);
    if (web && typeof document !== 'undefined') document.addEventListener('focusin', surFocus);
    return () => {
      clearTimeout(t);
      if (suivi) clearInterval(suivi);
      if (web && typeof document !== 'undefined') document.removeEventListener('focusin', surFocus);
    };
  }, [haut, remonter]);

  const suivre = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      y.current = e.nativeEvent.contentOffset.y;
      onScroll?.(e);
    },
    [onScroll],
  );

  return (
    <ScrollView ref={interne} keyboardShouldPersistTaps="handled" scrollEventThrottle={16} {...props} onScroll={suivre}>
      {children}
      {haut !== undefined && recouvert > 0 && <View style={{ height: recouvert }} />}
    </ScrollView>
  );
});

/**
 * Zone dont le bas reste au-dessus du clavier sur Android (barre de saisie collée en bas, comme la messagerie).
 * Le recouvrement est mesuré : si le système a déjà rétréci la fenêtre, il vaut 0 et rien n'est ajouté.
 * Sur iPhone, KeyboardAvoidingView s'en charge déjà.
 */
export function ZoneClavier({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const vue = useRef<ComponentRef<typeof View>>(null);
  const haut = useHautClavier();
  const [recouvert, setRecouvert] = useState(0);
  useEffect(() => {
    if (haut === undefined || Platform.OS !== 'android') return;
    const t = setTimeout(() => vue.current?.measureInWindow((_x, y, _l, h) => setRecouvert(Math.max(0, y + h - haut))), 50);
    return () => clearTimeout(t);
  }, [haut]);
  return (
    <View ref={vue} style={[style, { paddingBottom: haut === undefined ? 0 : recouvert }]}>
      {children}
    </View>
  );
}
