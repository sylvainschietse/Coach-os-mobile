// CiqualSearch.tsx d'origine : aliments courants Ciqual pendant la saisie, produits de marque Open Food Facts sur
// « Rechercher », et un code-barres tapé dans le champ ouvre directement la fiche produit.
import { Search } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { rechercherProduits } from '@/data/nutrition';
import { ciqualFoods, ciqualGroups, searchCiqual, type CiqualFood } from '@/domain/nutrition/ciqual';
import type { NamedProduct } from '@/domain/nutrition/personnel';
import { roleWeb } from '@/lib/role-web';

import { Selecteur } from '../coque';
import { CaseACocher, Repliable, Saisie } from '../crm/dossier';
import { Action, Etat, ts } from '../entrainement/commun';
import { couleurs, polices } from '../theme';
import { doux, Lien } from './commun';

const GROUPES = [{ cle: '', libelle: 'Toutes les catégories' }, ...ciqualGroups.map((g) => ({ cle: g, libelle: g }))];
const ETATS = [
  { cle: '', libelle: 'Tous les états' },
  { cle: 'cru', libelle: 'Cru' },
  { cle: 'cuit', libelle: 'Cuit' },
];

function Resultat({ titre, detail, note, desactive, onPress }: { titre: string; detail: string; note?: string; desactive: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={desactive}
      onPress={onPress}
      style={(e) => [
        { minHeight: 56, borderRadius: 8, borderWidth: 1, borderColor: couleurs.bordure, backgroundColor: couleurs.carte, padding: 12, opacity: desactive ? 0.5 : 1 },
        (e as { hovered?: boolean }).hovered && { borderColor: couleurs.rouge },
      ]}
    >
      <Text style={ts.titreChamp}>{titre}</Text>
      <Text style={[doux, { marginTop: 4 }]}>{detail}</Text>
      {note && <Text style={[doux, { fontSize: 11, marginTop: 4 }]}>{note}</Text>}
    </Pressable>
  );
}

export function RechercheAliment({
  onSelect,
  onBarcode,
  disabled,
}: {
  onSelect: (food: CiqualFood) => void;
  onBarcode: (code: string) => void;
  disabled: boolean;
}) {
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState('');
  const [state, setState] = useState('');
  const [france, setFrance] = useState(true);
  const [products, setProducts] = useState<NamedProduct[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const request = useRef(0);
  useEffect(
    () => () => {
      request.current++;
    },
    [],
  );
  const change = (value: string) => {
    request.current++;
    setQuery(value);
    setProducts([]);
    setDone(false);
    setBusy(false);
    setError('');
  };
  const reset = () => {
    change('');
    setGroup('');
    setState('');
  };
  const search = async () => {
    if (disabled || busy) return;
    const text = query.trim();
    setError('');
    if (/^(?:\d{8}|\d{12}|\d{13}|\d{14})$/.test(text)) {
      onBarcode(text);
      reset();
      return;
    }
    if (text.length < 2) {
      setError('Saisissez au moins deux caractères.');
      return;
    }
    const token = ++request.current;
    setBusy(true);
    setDone(false);
    try {
      const r = await rechercherProduits(text, france);
      if (token !== request.current) return;
      setProducts(r);
      setDone(true);
    } catch (e) {
      if (token === request.current) setError(e instanceof Error ? e.message : 'Recherche indisponible');
    } finally {
      if (token === request.current) setBusy(false);
    }
  };
  const results = searchCiqual(query, group, state);
  const searched = query.trim().length >= 2 || !!group || !!state;
  return (
    <View style={{ gap: 12, borderRadius: 12, backgroundColor: 'rgba(237,239,242,0.5)', padding: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Search size={16} color={couleurs.rouge} />
        <Text style={[ts.titreChamp, { fontFamily: polices.texteGras }]}>Rechercher un aliment ou une marque</Text>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Saisie libelle="Nom, marque ou code-barres" max={100} placeholder="Nutella, Danone, pomme, riz cru…" valeur={query} onChange={change} />
        </View>
        <Action libelle={busy ? 'Recherche…' : 'Rechercher'} desactive={disabled || busy} onPress={search} />
      </View>
      <Text style={doux}>
        Ciqual apparaît pendant la saisie. Appuyez sur Rechercher pour les produits de marque ; sélectionner un produit récupère sa fiche par code-barres.
      </Text>
      <CaseACocher
        petite
        libelle="Produits commercialisés en France"
        valeur={france}
        onChange={(v) => {
          setFrance(v);
          change(query);
        }}
      />
      <Etat erreur={error || undefined} />
      {(busy || done || products.length > 0) && (
        <View style={{ gap: 8 }}>
          <Text style={{ fontFamily: polices.texteGras, fontSize: 12, color: couleurs.rouge }}>Produits de marque · Open Food Facts</Text>
          {busy ? (
            <Text {...roleWeb('status')} style={doux}>
              Recherche des produits…
            </Text>
          ) : (
            <View style={{ gap: 4 }}>
              {products.map((p) => (
                <Resultat
                  key={p.barcode}
                  titre={p.name}
                  detail={`${p.brand}${p.quantity ? ' · ' + p.quantity : ''} · ${p.barcode}`}
                  desactive={disabled}
                  onPress={() => {
                    onBarcode(p.barcode);
                    reset();
                  }}
                />
              ))}
              {done && !products.length && (
                <Text style={doux}>Aucun produit de marque trouvé. Essayez sans le filtre France, précisez le nom ou scannez le code-barres.</Text>
              )}
              {products.length === 12 && <Text style={doux}>12 premiers produits : précisez la marque, le nom ou le format.</Text>}
            </View>
          )}
        </View>
      )}
      <Repliable key={searched ? 'ouvert' : 'ferme'} ouvert={searched} resume={<Text style={[doux, { fontFamily: polices.texteGras, color: couleurs.texte }]}>Aliments courants · Ciqual</Text>}>
        <View style={{ gap: 8 }}>
          <Selecteur libelle="Catégorie Ciqual" sansLibelle options={GROUPES} valeur={group} onChange={setGroup} />
          <Selecteur libelle="État de l’aliment" sansLibelle options={ETATS} valeur={state} onChange={setState} />
          {searched && (
            <View style={{ gap: 4 }}>
              {results.map((f) => (
                <Resultat
                  key={f.code}
                  titre={f.name}
                  detail={`${f.group} · pour 100 g : ${f.raw.kcal || '—'} kcal · P ${f.raw.protein || '—'} g · G ${f.raw.carbs || '—'} g · L ${f.raw.fat || '—'} g`}
                  note={f.notes.length > 0 ? 'Certaines valeurs sont manquantes ou indiquées par un seuil.' : undefined}
                  desactive={disabled}
                  onPress={() => {
                    onSelect(f);
                    reset();
                  }}
                />
              ))}
              {!results.length && <Text style={[doux, { padding: 8 }]}>Aucun aliment générique pour cette recherche. Essayez la recherche de marques au-dessus.</Text>}
              {results.length === 30 && <Text style={doux}>30 premiers résultats : précisez le nom ou la catégorie.</Text>}
            </View>
          )}
        </View>
      </Repliable>
      <View style={{ gap: 2 }}>
        <Text style={[doux, { fontSize: 11 }]}>
          {ciqualFoods.length.toLocaleString('fr-FR')} aliments · Anses · Ciqual 2025. Quantités en grammes de partie comestible, y compris les liquides.
          Choisissez le bon état cru/cuit ; les poids ne sont pas convertis automatiquement. Marques : Open Food Facts (ODbL).
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 12 }}>
          <Lien petit url="https://doi.org/10.57745/RDMHWY">Anses · Ciqual 2025</Lien>
          <Lien petit url="https://world.openfoodfacts.org">Open Food Facts</Lien>
        </View>
      </View>
    </View>
  );
}
