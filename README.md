# Coach OS · application mobile (prototype)

Application iPhone / Android de Coach OS, avec l'espace coach utilisable aussi dans un navigateur.
Construite avec [Expo](https://expo.dev) (React Native, TypeScript) et [Supabase](https://supabase.com) pour la base.

Ce prototype couvre deux parcours de bout en bout.

**Accueil des clients (CRM)**, qui remplace Tally → Make → Airtable :

1. le coach crée un contact avec un simple numéro de téléphone (doublons détectés à la saisie, numéro normalisé) ;
2. le prospect remplit le bilan « Forme & objectifs » (repris du Tally de Sylvain, page par page) par un lien, sans compte : ses réponses arrivent sur la bonne fiche (rapprochement par téléphone puis e-mail, jamais par le nom ; les différences sont signalées, pas écrasées) ;
3. le coach planifie la séance Booster, puis saisit tests, observations et 3 priorités ;
4. les relances du jour (questionnaire, proposition de Booster, rappel la veille, suivi après Booster) s'affichent sur l'accueil du coach, avec le message déjà écrit qui s'ouvre dans SMS, WhatsApp ou e-mail ;
5. « Passer en client » ouvre l'espace client ; les contacts peuvent être archivés puis réactivés, sans rien effacer.

**Séance du client** :

1. un client se connecte et ouvre sa séance du jour ;
2. il la réalise : charges suggérées grisées, qu'il valide ou corrige série par série, minuteur de récupération qui sonne même téléphone verrouillé ;
3. il laisse un commentaire de fin de séance ;
4. le coach retrouve la séance, série par série, avec le commentaire.

Il contient aussi le minuteur d'intervalles (Tabata, circuit). Le coach peut en régler un sous un exercice ou sous un circuit de la séance : la cliente le lance d'un appui, déjà configuré.

**Programmes et séances (coach)** :

1. depuis la fiche d'un client (onglet Séances), le coach crée une séance : blocs, exercices choisis dans le catalogue, séries, répétitions, charge, durée, récupération, RIR, tempo et consignes ; il peut la modifier, la dupliquer ou la masquer ;
2. onglet Programmes : il crée un programme modèle (ses séances, sa durée, son rythme) et l'attribue à un client avec une date de début ; le client reçoit une copie, datée sur la semaine ;
3. le catalogue, ce sont les 750 exercices validés de la table Airtable « Exercices » (copiés dans Supabase, Airtable n'est pas modifié), avec recherche par nom, muscle, matériel ou famille, et le lien vidéo affiché au client pendant la séance. Ce que le client note (charge et répétitions, durée, distance) est déduit de la famille et du matériel (`scripts/import-exercices.mjs`) ;
4. retirer un exercice d'une séance déjà faite ne supprime rien : l'historique du client reste.

**Suivi du client** : le client saisit ses mensurations (poids, masse grasse, tours) et ses records (PR) ; l'appli lui propose ses meilleures charges en séance comme pistes, sans les enregistrer d'elle-même. Le coach voit tout dans la fiche du client.

**Nutrition** : le coach écrit un plan par client (calories, macros, eau, conseils) ; le client le consulte et note sa journée (respect du plan sur 5, eau, repas, ressenti). Le coach voit le journal et la moyenne des 7 derniers jours notés.

Pas encore de compte rendu PDF automatique ni de paiements.

## Essayer sur ton téléphone (gratuit, sans compte Apple ni Google)

Il faut un ordinateur avec [Node.js](https://nodejs.org) (version 20 ou plus) et l'app **Expo Go** sur le téléphone (App Store ou Google Play).

```bash
git clone https://github.com/sylvainschietse/coach-os-mobile.git
cd coach-os-mobile
npm install
npx expo start
```

Scanne le QR code affiché : avec l'appareil photo sur iPhone, depuis Expo Go sur Android. Le téléphone et l'ordinateur doivent être sur le même Wi-Fi (sinon `npx expo start --tunnel`).

Pour l'espace coach sur ordinateur : appuie sur `w` dans le terminal, l'app s'ouvre dans le navigateur. En largeur ordinateur, la liste des clients est à gauche et le suivi à droite.

### Mode démo

Le fichier `.env` branche l'app sur la base Supabase « Coach OS » (connexion par e-mail et mot de passe). Pour l'essayer sans compte, lance `EXPO_NO_DOTENV=1 npx expo start` : l'app démarre alors en **mode démo** : données fictives (Sylvain coach, Léa et Thomas clients), tout reste sur l'appareil. Sur l'écran d'accueil, choisis « Je suis Léa », fais la séance, déconnecte-toi, puis choisis « Je suis Sylvain » pour voir le résultat. Léa a déjà une séance la semaine précédente (4 × 12 à 45 kg au développé couché) : l'app lui suggère donc 47,5 kg.

## Brancher une vraie base Supabase (offre gratuite)

C'est déjà fait pour le projet « Coach OS » (région Europe, offre gratuite). Les étapes ci-dessous servent pour un nouveau projet.

1. Créer un projet sur [supabase.com](https://supabase.com), région Europe.
2. Dans *SQL Editor*, coller tout le fichier `supabase/installation.sql` (toutes les migrations, dans l'ordre) puis *Run*. Pour des données d'essai, exécuter ensuite `supabase/seed.sql` après avoir créé ses comptes.
3. Dans *Authentication > Users*, créer le compte du coach (*Add user*, cocher *Auto Confirm User*).
4. Dans *SQL Editor* : `select public.creer_coach('e-mail du coach', 'Prénom', 'lien-du-questionnaire');`
5. Renseigner l'URL du projet et la clé publique (*Project Settings > API Keys*, clé « publishable ») dans `.env` (ou `.env.local` pour un essai local). Ces deux valeurs sont publiques ; ne jamais y mettre la clé secrète.
6. Relancer `npx expo start`. L'écran d'accueil demande alors e-mail et mot de passe, et le coach voit sur son ordinateur ce que le client fait sur son téléphone.

### Accès des clients à l'appli

Sur la fiche d'un client, « Créer son accès » crée son compte avec un mot de passe provisoire, que le coach lui envoie par WhatsApp ou SMS. À sa première connexion, le client choisit son propre mot de passe ; il ne voit que ses séances et son suivi. Le même bouton renouvelle le mot de passe provisoire en cas d'oubli. C'est la fonction `supabase/functions/acces-client` qui crée le compte (`npx supabase functions deploy acces-client`). Pour ajouter un lien d'installation au message, renseigner `EXPO_PUBLIC_LIEN_APPLI`.

### Connexion avec Google, Microsoft, Apple ou inscription libre

Un client peut aussi se connecter avec Google, Microsoft ou Apple, ou créer lui-même son compte avec son e-mail. À la première connexion, `rattacher_mon_compte()` relie son compte à sa fiche client si l'e-mail est **vérifié** (par le fournisseur ou par l'e-mail de confirmation) et correspond à un seul client actif. Laisser activée la confirmation des e-mails dans Supabase (*Authentication > Sign In / Providers > Email*) : sans elle, n'importe qui pourrait s'inscrire avec l'e-mail d'un client.

1. *Authentication > URL Configuration* : ajouter `coachos://**` aux adresses de redirection.
2. Activer chaque fournisseur dans *Authentication > Sign In / Providers* avec ses identifiants (Google Cloud, Microsoft Entra, Apple Developer). Adresse de retour à déclarer chez eux : `https://<ref>.supabase.co/auth/v1/callback`.
3. Pour l'inscription libre, brancher un service d'envoi d'e-mails (*Authentication > Emails > SMTP*), par exemple Resend.
4. Lister les moyens activés dans `EXPO_PUBLIC_CONNEXIONS` (ex. `google,azure,inscription`).

### Rédaction du compte rendu par l'IA (Claude)

La clé Claude ne va jamais dans l'appli : elle reste dans les secrets Supabase, lue par la fonction `supabase/functions/rediger-compte-rendu`.

1. Créer un compte sur [console.anthropic.com](https://console.anthropic.com), ajouter un moyen de paiement et créer une clé API.
2. Avec l'outil Supabase en ligne de commande : `npx supabase login`, `npx supabase link --project-ref <ref du projet>`, puis `npx supabase secrets set ANTHROPIC_API_KEY=<la clé>` et `npx supabase functions deploy rediger-compte-rendu`.
3. Dans l'appli, l'écran du compte rendu affiche alors « Rédiger avec l'IA ». Sans ça (et en démo), les textes viennent d'un modèle sans IA, modifiables à la main.

L'offre gratuite se met en pause après une semaine sans activité et ne fait pas de sauvegarde : n'y mettre que des données de test.

## Ce qui est déjà en place pour la suite

- **Plusieurs coachs** : chaque donnée est rattachée à un coach ; un coach ne voit jamais les clients d'un autre, un client ne voit que ses propres données. Ces règles sont dans la base elle-même et testées (`tests/acces.test.ts`).
- **Pas de doublon** : l'identifiant d'une séance réalisée est créé sur le téléphone ; un double appui ou un renvoi après coupure réseau ne crée rien de plus.
- **Hors connexion** : une séance terminée est d'abord gardée sur le téléphone, puis envoyée dès que le réseau revient.
- **Modèle / prescription / réalisation** séparés : une suggestion de charge n'est jamais enregistrée comme performance sans validation du client.
- **Migration** : `src/domain/cycles.ts` décode déjà les marqueurs `[COACHOS_CYCLES:…]` et `[COACHOS_BLOCS:…]` de l'app Zite.

La règle de suggestion de charge (`src/domain/suggestions.ts`) est provisoire : même charge, ou + 2,5 kg quand toutes les séries ont atteint le haut de la fourchette. À remplacer par la règle de Sylvain.

## Pour les développeurs

```bash
npm test           # règles métier + règles d'accès de la base (Postgres en mémoire)
npm run typecheck
npm run lint
```

| Dossier | Contenu |
| --- | --- |
| `src/app/` | Écrans (Expo Router) : `client/`, `coach/` |
| `src/domain/` | Logique métier pure, testée : CRM et relances, questionnaire, suggestions, minuteur, file d'envoi, décodage Zite |
| `src/data/` | Accès aux données : mode démo local ou Supabase |
| `src/ui/` | Thème Coach OS et composants |
| `supabase/` | Schéma, règles d'accès et données de démonstration |
| `tests/` | Tests automatiques |
