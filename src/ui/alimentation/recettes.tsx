import * as Linking from 'expo-linking';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { depot } from '@/data';
import { alimentation } from '@/data/alimentation';
import {
  adapterAuxBesoins,
  adapterAuxRegimes,
  calculerBesoins,
  cibleDuRepas,
  convientAuRegime,
  entreeRecette,
  MOMENTS,
  momentSelonHeure,
  objectifsDuJour,
  quantiteLisible,
  recetteDeVariante,
  recettesPourLeClient,
  regimesDeLaRecette,
  rechercherRecettes,
  totalRecette,
} from '@/domain/alimentation';
import { jourLocal } from '@/domain/crm';
import { formaterNombre } from '@/domain/suivi';
import type { MomentRepas, OrigineRecette, Recette, TypeRecette, VarianteRecette } from '@/domain/types';
import { nouvelId } from '@/lib/identifiant';
import { useCharger } from '@/lib/useCharger';

import { Bouton, Carte, Chargement, ChampTexte, Erreur, Pastille, Puce, Puces, SousTitre, Texte } from '../composants';
import { couleurs, espace } from '../theme';
import { libelleRegime, LigneMacros } from './commun';
import { EditeurRecette } from './editeur-recette';
import { chargerProfil } from './profil';

const nouvelleRecette = (clientId?: string): Recette => ({
  id: nouvelId(),
  clientId,
  titre: '',
  portions: 1,
  ingredients: [],
  statut: 'brouillon',
  regimesConfirmes: [],
});

const TYPES: { cle: TypeRecette; libelle: string }[] = [
  { cle: 'plat', libelle: 'Plats' },
  { cle: 'collation', libelle: 'Collations' },
  { cle: 'sucre', libelle: 'Sucré' },
  { cle: 'sale', libelle: 'Salé' },
];
const PAR_PAGE = 20;

/** « Good Food · 4,2/5 (26 avis de lecteurs) » : l'avis des lecteurs de la source, pas une validation du coach. */
const libelleOrigine = (o: OrigineRecette) => `${o.nom}${o.note ? ` · ${formaterNombre(o.note)}/5 (${o.votes} avis de lecteurs)` : ''}`;

/** Recherche, type de repas et pagination : la banque compte des centaines de recettes. */
function useFiltre() {
  const [recherche, setRecherche] = useState('');
  const [type, setType] = useState<TypeRecette>();
  const [page, setPage] = useState(1);
  const appliquer = <T,>(liste: T[], recette: (x: T) => Recette) => {
    const trouvees = rechercherRecettes(liste.map(recette), recherche, type);
    const gardees = liste.filter((x) => trouvees.has(recette(x).id));
    return {
      visibles: gardees.slice(0, page * PAR_PAGE),
      total: gardees.length,
    };
  };
  const champs = (
    <View style={{ gap: espace(2) }}>
      <ChampTexte
        libelle="Chercher une recette"
        valeur={recherche}
        onChange={(t) => (setRecherche(t), setPage(1))}
        placeholder="poulet, curry, overnight…"
      />
      <Puces>
        <Puce libelle="Tout" actif={!type} onPress={() => (setType(undefined), setPage(1))} />
        {TYPES.map((t) => (
          <Puce key={t.cle} libelle={t.libelle} actif={type === t.cle} onPress={() => (setType(t.cle), setPage(1))} />
        ))}
      </Puces>
    </View>
  );
  const suite = (total: number) =>
    total > page * PAR_PAGE ? (
      <Bouton variante="discret" libelle={`Voir plus (${total - page * PAR_PAGE} autres)`} onPress={() => setPage(page + 1)} />
    ) : null;
  return { appliquer, champs, suite };
}

function CarteRecette({ r, note, onPress }: { r: Recette; note?: string; onPress: () => void }) {
  const regimes = regimesDeLaRecette(r);
  return (
    <Pressable accessibilityRole="button" onPress={onPress}>
      <Carte>
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            gap: espace(2),
          }}
        >
          <SousTitre>{r.titre}</SousTitre>
          {r.tempsMin ? (
            <Texte doux style={{ fontSize: 13 }}>
              {r.tempsMin} min
            </Texte>
          ) : null}
        </View>
        <LigneMacros m={totalRecette(r).parPortion} />
        {regimes.length > 0 && (
          <Texte doux style={{ fontSize: 13 }}>
            {regimes.map(libelleRegime).join(' · ')}
          </Texte>
        )}
        {r.origine && (
          <Texte doux style={{ fontSize: 12 }}>
            {libelleOrigine(r.origine)}
          </Texte>
        )}
        {note && <Texte style={{ fontSize: 13, color: couleurs.orange }}>{note}</Texte>}
      </Carte>
    </Pressable>
  );
}

async function chargerPourClient(clientId: string) {
  const [donnees, plan, banque, perso] = await Promise.all([
    chargerProfil(clientId),
    depot.planNutrition(clientId),
    alimentation.banqueRecettes(),
    alimentation.recettesPerso(clientId),
  ]);
  const besoins = calculerBesoins(donnees.profil, jourLocal(new Date()), donnees.dernierPoids).besoins;
  return {
    profil: donnees.profil,
    objectifs: objectifsDuJour(plan, besoins),
    banque: banque.filter((r) => r.statut === 'approuvee'),
    perso,
  };
}

type Donnees = Awaited<ReturnType<typeof chargerPourClient>>;

function DetailRecette({
  recette,
  donnees,
  clientId,
  variante: variantePreferee,
  onFermer,
  onModifier,
}: {
  recette: Recette;
  donnees: Donnees;
  clientId: string;
  variante?: VarianteRecette;
  onFermer: () => void;
  onModifier?: () => void;
}) {
  const regimes = donnees.profil?.regimes ?? [];
  const [varianteId, setVarianteId] = useState(variantePreferee?.id);
  const variante = recette.variantes?.find((v) => v.id === varianteId);
  const choisie = variante ? recetteDeVariante(recette, variante) : recette;
  const aAdapter = regimes.filter((g) => !convientAuRegime(choisie, g));
  const parRegime = aAdapter.length ? adapterAuxRegimes(choisie, aAdapter) : undefined;
  const [moment, setMoment] = useState<MomentRepas>(momentSelonHeure(new Date()));
  const [ajuster, setAjuster] = useState(!!donnees.objectifs);
  const [ajoute, setAjoute] = useState(false);
  const [erreur, setErreur] = useState<string>();

  const base = parRegime && parRegime.impossibles.length === 0 ? parRegime.recette : choisie;
  const ajustee = ajuster && donnees.objectifs ? adapterAuxBesoins(base, cibleDuRepas(donnees.objectifs, moment)) : undefined;
  const affichee = ajustee?.recette ?? base;
  const portions = ajustee ? 1 : base.portions;

  async function ajouter() {
    setErreur(undefined);
    try {
      await alimentation.ajouterRepas([
        {
          ...entreeRecette(affichee, 1, {
            id: nouvelId(),
            clientId,
            date: jourLocal(new Date()),
            moment,
          }),
          libelle: variante ? `${recette.titre} (${variante.libelle})` : recette.titre,
          recetteId: recette.id,
        },
      ]);
      setAjoute(true);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Ajout impossible');
    }
  }

  return (
    <View style={{ gap: espace(4) }}>
      <Bouton variante="discret" libelle="← Toutes les recettes" onPress={onFermer} />
      <Carte>
        <SousTitre>{recette.titre}</SousTitre>
        {recette.description && (
          <Texte doux style={{ fontSize: 14 }}>
            {recette.description}
          </Texte>
        )}
        <Texte doux style={{ fontSize: 13 }}>
          {recette.tempsMin ? `${recette.tempsMin} min · ` : ''}
          {regimesDeLaRecette(choisie).map(libelleRegime).join(' · ') || 'Aucun régime particulier'}
        </Texte>
        {recette.origine && (
          <Pressable accessibilityRole="link" onPress={() => Linking.openURL(recette.origine!.url).catch(() => undefined)}>
            <Texte doux style={{ fontSize: 12 }}>
              D’après {libelleOrigine(recette.origine)} ·{' '}
              <Texte style={{ fontSize: 12, textDecorationLine: 'underline' }}>voir la recette d’origine</Texte>
            </Texte>
          </Pressable>
        )}
        {!!recette.variantes?.length && (
          <Puces>
            <Puce libelle="Recette source" actif={!variante} onPress={() => setVarianteId(undefined)} />
            {recette.variantes.map((v) => (
              <Puce key={v.id} libelle={v.libelle} actif={varianteId === v.id} onPress={() => setVarianteId(v.id)} />
            ))}
          </Puces>
        )}
        {variante?.notes?.map((n, k) => (
          <Texte key={k} doux style={{ fontSize: 13 }}>
            {n}
          </Texte>
        ))}
      </Carte>

      {parRegime && (
        <Carte style={{ borderColor: couleurs.orange }}>
          <SousTitre>Adaptée à ton régime</SousTitre>
          {parRegime.adaptations.map((a, i) => (
            <Texte key={i} style={{ fontSize: 14 }}>
              {a.avant.nom} ({quantiteLisible(a.avant)}) → {a.apres.nom} ({quantiteLisible(a.apres)})
            </Texte>
          ))}
          {parRegime.impossibles.length > 0 && (
            <Texte style={{ fontSize: 14, color: couleurs.rouge }}>À revoir avec ton coach : {parRegime.impossibles.join(', ')}.</Texte>
          )}
        </Carte>
      )}

      <Carte>
        {donnees.objectifs ? (
          <>
            <Puces>
              <Puce libelle="Adaptée à mes besoins" actif={ajuster} onPress={() => setAjuster(true)} />
              <Puce libelle="Recette d’origine" actif={!ajuster} onPress={() => setAjuster(false)} />
            </Puces>
            {ajuster && (
              <Puces>
                {MOMENTS.map((m) => (
                  <Puce key={m.cle} libelle={m.libelle} actif={moment === m.cle} onPress={() => setMoment(m.cle)} />
                ))}
              </Puces>
            )}
          </>
        ) : (
          <Texte doux style={{ fontSize: 13 }}>
            Remplis ton profil pour adapter les quantités à tes besoins.
          </Texte>
        )}
        <Texte style={{ fontSize: 14 }}>
          {ajustee ? `Ta portion ${MOMENTS.find((m) => m.cle === moment)!.au} :` : `Pour ${portions} portion${portions > 1 ? 's' : ''} :`}
        </Texte>
        {affichee.ingredients.map((i, n) => (
          <View
            key={n}
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              borderTopWidth: 1,
              borderTopColor: couleurs.bordure,
              paddingTop: espace(1.5),
            }}
          >
            <Texte style={{ fontSize: 15, flex: 1 }}>
              {i.nom}
              {i.facultatif ? (
                <Texte doux style={{ fontSize: 13 }}>
                  {' '}
                  (facultatif)
                </Texte>
              ) : null}
            </Texte>
            <Texte style={{ fontSize: 15 }}>{quantiteLisible(i)}</Texte>
          </View>
        ))}
        <Texte doux style={{ fontSize: 13 }}>
          {affichee.macrosPortion ? 'Une portion (valeurs publiées par la source) :' : 'Une portion :'}
        </Texte>
        <LigneMacros m={totalRecette(affichee).parPortion} />
        {ajustee && donnees.objectifs && (
          <Texte doux style={{ fontSize: 12 }}>
            Cible du repas : <LigneMacros m={cibleDuRepas(donnees.objectifs, moment)} taille={12} />
          </Texte>
        )}
      </Carte>

      {choisie.etapes && (
        <Carte>
          <SousTitre>Préparation</SousTitre>
          <Texte>{choisie.etapes}</Texte>
        </Carte>
      )}
      {erreur && <Erreur message={erreur} />}
      {ajoute ? (
        <Texte style={{ color: couleurs.vert }}>Ajoutée à ton journal du jour.</Texte>
      ) : (
        <Bouton libelle={`Ajouter ${MOMENTS.find((m) => m.cle === moment)!.au} d’aujourd’hui`} onPress={ajouter} />
      )}
      {onModifier && <Bouton variante="discret" libelle="Modifier ma recette" onPress={onModifier} />}
    </View>
  );
}

/** Côté client : la banque du coach filtrée selon son régime, et ses propres recettes. */
export function RecettesClient({ clientId }: { clientId: string }) {
  const { donnee, erreur, recharger } = useCharger(() => chargerPourClient(clientId), `recettes-${clientId}`);
  const [ouverte, setOuverte] = useState<{
    recette: Recette;
    variante?: VarianteRecette;
  }>();
  const [edition, setEdition] = useState<Recette>();
  const [toutes, setToutes] = useState(false);
  const filtre = useFiltre();

  if (erreur) return <Erreur message={erreur} onReessayer={recharger} />;
  if (!donnee) return <Chargement />;

  if (edition) {
    return (
      <EditeurRecette
        recette={edition}
        auteur={{ clientId }}
        onAnnuler={() => setEdition(undefined)}
        onEnregistrer={async (r) => {
          await alimentation.enregistrerRecette({
            ...r,
            clientId,
            statut: 'brouillon',
          });
          setEdition(undefined);
          setOuverte(undefined);
          recharger();
        }}
      />
    );
  }
  if (ouverte) {
    return (
      <DetailRecette
        recette={ouverte.recette}
        variante={ouverte.variante}
        donnees={donnee}
        clientId={clientId}
        onFermer={() => setOuverte(undefined)}
        onModifier={ouverte.recette.clientId ? () => setEdition(ouverte.recette) : undefined}
      />
    );
  }

  const pourMoi = recettesPourLeClient(donnee.banque, donnee.profil);
  const liste = toutes
    ? donnee.banque.map((r) => ({
        recette: r,
        adaptation: undefined,
        variante: undefined,
        convient: true,
        exclusions: [],
      }))
    : pourMoi;
  const { visibles, total } = filtre.appliquer(liste, (x) => x.recette);
  const regimes = donnee.profil?.regimes ?? [];

  return (
    <View style={{ gap: espace(4) }}>
      <SousTitre>Mes recettes</SousTitre>
      {donnee.perso.length === 0 && (
        <Texte doux style={{ fontSize: 14 }}>
          Enregistre tes plats habituels pour les ajouter en un geste.
        </Texte>
      )}
      {donnee.perso.map((r) => (
        <CarteRecette key={r.id} r={r} onPress={() => setOuverte({ recette: r })} />
      ))}
      <Bouton variante="secondaire" libelle="Créer une recette" onPress={() => setEdition(nouvelleRecette(clientId))} />

      <SousTitre>Recettes de ton coach</SousTitre>
      {regimes.length > 0 && (
        <Puces>
          <Puce libelle={`Pour moi (${regimes.map(libelleRegime).join(', ')})`} actif={!toutes} onPress={() => setToutes(false)} />
          <Puce libelle="Toutes" actif={toutes} onPress={() => setToutes(true)} />
        </Puces>
      )}
      {donnee.banque.length > 0 && filtre.champs}
      {donnee.banque.length === 0 && (
        <Texte doux style={{ fontSize: 14 }}>
          Ton coach n’a pas encore publié de recettes.
        </Texte>
      )}
      {donnee.banque.length > 0 && liste.length === 0 && (
        <Texte doux style={{ fontSize: 14 }}>
          Aucune recette ne correspond à ton régime et à tes exclusions pour l’instant.
        </Texte>
      )}
      {visibles.map(({ recette, adaptation, variante }) => (
        <CarteRecette
          key={recette.id}
          r={variante ? recetteDeVariante(recette, variante) : recette}
          note={
            variante
              ? `Version proposée : ${variante.libelle}`
              : adaptation
                ? `Adaptable : ${adaptation.adaptations.map((a) => `${a.avant.nom} → ${a.apres.nom}`).join(', ')}`
                : undefined
          }
          onPress={() => setOuverte({ recette, variante })}
        />
      ))}
      {filtre.suite(total)}
    </View>
  );
}

/** Côté coach : la banque de recettes, brouillons compris. */
export function BanqueRecettes({ coachId }: { coachId: string }) {
  const { donnee, erreur, recharger } = useCharger(() => alimentation.banqueRecettes(), `banque-${coachId}`);
  const [edition, setEdition] = useState<Recette>();
  const [archiver, setArchiver] = useState<string>();
  const [statut, setStatut] = useState<Recette['statut']>();
  const filtre = useFiltre();

  if (edition) {
    return (
      <EditeurRecette
        recette={edition}
        auteur={{ coachId }}
        coachId={coachId}
        onAnnuler={() => setEdition(undefined)}
        onEnregistrer={async (r) => {
          await alimentation.enregistrerRecette(r, coachId);
          setEdition(undefined);
          recharger();
        }}
      />
    );
  }

  const approuvees = donnee?.filter((r) => r.statut === 'approuvee').length ?? 0;
  const { visibles, total } = filtre.appliquer(donnee?.filter((r) => !statut || r.statut === statut) ?? [], (r) => r);
  const approuver = async (r: Recette) => {
    await alimentation.enregistrerRecette({ ...r, statut: 'approuvee' }, coachId);
    recharger();
  };
  return (
    <View style={{ gap: espace(4) }}>
      <Texte doux style={{ fontSize: 14 }}>
        Tes clients voient les recettes approuvées, filtrées selon leur régime et adaptées à leurs besoins.{' '}
        {donnee ? `${approuvees} approuvée${approuvees > 1 ? 's' : ''} sur ${donnee.length}.` : ''}
      </Texte>
      <Bouton libelle="Nouvelle recette" onPress={() => setEdition(nouvelleRecette())} />
      {erreur && <Erreur message={erreur} />}
      {!donnee && !erreur && <Chargement />}
      {donnee && donnee.length > 0 && (
        <>
          <Puces>
            <Puce libelle={`À valider (${donnee.length - approuvees})`} actif={statut === 'brouillon'} onPress={() => setStatut('brouillon')} />
            <Puce libelle={`Approuvées (${approuvees})`} actif={statut === 'approuvee'} onPress={() => setStatut('approuvee')} />
            <Puce libelle="Toutes" actif={!statut} onPress={() => setStatut(undefined)} />
          </Puces>
          {filtre.champs}
        </>
      )}
      {visibles.map((r) => (
        <Carte key={r.id}>
          <Pressable accessibilityRole="button" onPress={() => setEdition(r)} style={{ gap: espace(1) }}>
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                gap: espace(2),
              }}
            >
              <SousTitre>{r.titre}</SousTitre>
              <Pastille
                libelle={r.statut === 'approuvee' ? 'Approuvée' : 'Brouillon'}
                couleur={r.statut === 'approuvee' ? couleurs.vert : couleurs.texteDoux}
              />
            </View>
            <LigneMacros m={totalRecette(r).parPortion} />
            <Texte doux style={{ fontSize: 13 }}>
              {r.ingredients.length} ingrédient
              {r.ingredients.length > 1 ? 's' : ''} · {r.portions} portion
              {r.portions > 1 ? 's' : ''}
              {regimesDeLaRecette(r).length ? ` · ${regimesDeLaRecette(r).map(libelleRegime).join(', ')}` : ''}
              {r.variantes?.length ? ` · ${r.variantes.map((v) => v.libelle).join(', ')}` : ''}
            </Texte>
            {r.origine && (
              <Texte doux style={{ fontSize: 12 }}>
                {libelleOrigine(r.origine)}
              </Texte>
            )}
          </Pressable>
          {r.statut === 'brouillon' && <Bouton variante="secondaire" libelle="Testée, je l’approuve" onPress={() => approuver(r)} />}
          {archiver === r.id ? (
            <View style={{ flexDirection: 'row', gap: espace(4) }}>
              <Pressable
                accessibilityRole="button"
                onPress={async () => {
                  await alimentation.enregistrerRecette({ ...r, archive: true }, coachId);
                  setArchiver(undefined);
                  recharger();
                }}
              >
                <Texte style={{ fontSize: 13, color: couleurs.rouge }}>Confirmer l’archivage</Texte>
              </Pressable>
              <Pressable accessibilityRole="button" onPress={() => setArchiver(undefined)}>
                <Texte doux style={{ fontSize: 13 }}>
                  Annuler
                </Texte>
              </Pressable>
            </View>
          ) : (
            <Pressable accessibilityRole="button" onPress={() => setArchiver(r.id)}>
              <Texte doux style={{ fontSize: 13 }}>
                Archiver
              </Texte>
            </Pressable>
          )}
        </Carte>
      ))}
      {filtre.suite(total)}
    </View>
  );
}
