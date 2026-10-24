// DeleteTraining.tsx d'origine : suppression vers la corbeille (jamais d'effacement) et corbeille avec Restaurer.
import { RotateCcw, Trash2 } from 'lucide-react-native';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { entrainement } from '@/data/entrainement';
import type { ElementCorbeille } from '@/domain/entrainement-etat';

import { couleurs, polices } from '../theme';
import { Action, Confirmation, ts } from './commun';

export function SuppressionEntrainement({ items, onFermer, onSupprime }: { items: ElementCorbeille[]; onFermer: () => void; onSupprime: () => void }) {
  return (
    <Confirmation
      titre={`Supprimer ${items.length === 1 ? 'cet élément' : `${items.length} éléments`} ?`}
      texte="Ils seront retirés de la bibliothèque et conservés dans la corbeille. Un programme supprimé masque aussi ses séances. Les éléments liés à un client ou à des résultats sont protégés."
      action="Supprimer"
      danger
      onFermer={onFermer}
      onConfirmer={async () => {
        await entrainement.supprimer(items.map(({ kind, id }) => ({ kind, id })));
        onSupprime();
      }}
    >
      <View style={{ maxHeight: 192, overflow: 'scroll' as never }}>
        {items.map((i) => (
          <Text key={i.kind + i.id} style={[ts.texte, { borderBottomWidth: 1, borderBottomColor: couleurs.bordure, paddingVertical: 8 }]}>
            {i.nom}
          </Text>
        ))}
      </View>
    </Confirmation>
  );
}

export function Corbeille({ coachId, onRestaure }: { coachId: string; onRestaure: () => void }) {
  const [ouverte, setOuverte] = useState(false);
  const [items, setItems] = useState<ElementCorbeille[]>([]);
  const [chargement, setChargement] = useState(false);
  const [occupe, setOccupe] = useState('');
  const [erreur, setErreur] = useState('');
  const [message, setMessage] = useState('');

  const charger = async () => {
    setChargement(true);
    setErreur('');
    try {
      setItems(await entrainement.corbeille(coachId));
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Corbeille indisponible');
    } finally {
      setChargement(false);
    }
  };
  const restaurer = async (i: ElementCorbeille) => {
    if (occupe) return;
    setOccupe(i.id);
    setErreur('');
    setMessage('');
    try {
      await entrainement.restaurer(i);
      setItems((v) => v.filter((x) => x.id !== i.id || x.kind !== i.kind));
      setMessage(`${i.nom} restauré.`);
      onRestaure();
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Restauration impossible');
    } finally {
      setOccupe('');
    }
  };

  return (
    <View style={{ marginTop: 24, gap: 12 }}>
      <View style={{ alignSelf: 'flex-start' }}>
        <Action
          libelle="Corbeille"
          icone={Trash2}
          variante="fantome"
          onPress={() => {
            setOuverte(!ouverte);
            if (!ouverte) charger();
          }}
        />
      </View>
      {ouverte && (
        <View style={[ts.carte, { padding: 16, gap: 8 }]}>
          <Text style={ts.doux}>Pour retrouver une séance dont le programme est supprimé, restaurez aussi ce programme.</Text>
          {erreur ? (
            <Text accessibilityRole="alert" style={ts.erreur}>
              {erreur}
            </Text>
          ) : null}
          {message ? (
            <Text accessibilityRole={'status' as never} style={[ts.doux, { color: couleurs.vert }]}>
              {message}
            </Text>
          ) : null}
          {chargement ? (
            <Text style={ts.texte}>Chargement…</Text>
          ) : !items.length ? (
            <Text style={[ts.texte, { color: couleurs.texteDoux }]}>La corbeille est vide.</Text>
          ) : (
            items.map((i, n) => (
              <View
                key={i.kind + i.id}
                style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingVertical: 12, borderTopWidth: n ? 1 : 0, borderTopColor: couleurs.bordure }}
              >
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[ts.texte, { fontFamily: polices.texteMoyen }]}>{i.nom}</Text>
                  <Text style={ts.doux}>{i.kind === 'seance' ? 'Séance' : 'Programme / séance seule'}</Text>
                </View>
                <Action libelle="Restaurer" icone={RotateCcw} variante="contour" petit desactive={!!occupe && occupe !== i.id} chargement={occupe === i.id} onPress={() => restaurer(i)} />
              </View>
            ))
          )}
        </View>
      )}
    </View>
  );
}
