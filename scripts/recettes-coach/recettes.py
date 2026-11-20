# Recettes écrites pour Coach OS (texte original, pas de copie d'une source) : petits-déjeuners et collations riches en protéines,
# cuisine française du quotidien, plats à préparer à l'avance.
# Une ligne d'ingrédient : « grammes pour la recette entière ; nom affiché ; recherche dans la base Ciqual [; quantité affichée] ».
# La quantité affichée (« 3 pièce », « 2 c. à soupe ») remplace les grammes à l'écran ; le calcul garde les grammes.

R = []
def recette(titre, portions, minutes, types, cuisine, methode, ingredients, etapes):
    R.append(dict(titre=titre, portions=portions, minutes=minutes, types=types, cuisine=cuisine, methode=methode,
                  ingredients=[l.strip() for l in ingredients.strip().split('\n')], etapes=[e.strip() for e in etapes.strip().split('\n')]))

# ——— Petits-déjeuners salés ———

recette('Omelette jambon, champignons et fromage frais', 1, 10, ['sale'], 'Française', 'Poêle', """
165 ; Oeufs ; 22000 ; 3 pièce
40 ; Jambon blanc découenné ; 28900
60 ; Champignons de Paris émincés ; Champignon de Paris ou champignon de couche, cru
20 ; Fromage frais nature ; 12069
3 ; Huile d'olive ; 17270 ; 1 c. à café
1 ; Ciboulette ciselée ; 11003
""", """
Faire revenir les champignons 3 minutes dans l'huile, à feu vif.
Battre les œufs avec une pincée de sel et de poivre, les verser sur les champignons.
Ajouter le jambon en lanières et le fromage frais en petites cuillerées, laisser prendre 2 à 3 minutes.
Plier l'omelette, parsemer de ciboulette et servir.
""")

recette('Tartines œuf mollet et avocat', 1, 12, ['sale'], 'Internationale', 'Casserole', """
110 ; Oeufs ; 22000 ; 2 pièce
60 ; Pain complet ; Pain complet ou intégral ; 2 tranche
70 ; Avocat ; Avocat, chair sans peau, sans noyau, cru ; 0.5 pièce
5 ; Jus de citron ; 2028 ; 1 c. à café
1 ; Piment d'Espelette ; Poivre de Cayenne ou piment de Cayenne
""", """
Plonger les œufs dans l'eau bouillante 6 minutes, puis dans l'eau froide. Les écaler.
Griller le pain. Écraser l'avocat avec le citron, sel et poivre.
Tartiner, poser les œufs coupés en deux et saupoudrer de piment.
""")

recette('Œufs brouillés au saumon fumé', 1, 8, ['sale'], 'Française', 'Poêle', """
110 ; Oeufs ; 22000 ; 2 pièce
40 ; Saumon fumé ; 26037
40 ; Pain de seigle ; Pain de seigle ; 1 tranche
5 ; Beurre ; 16400 ; 1 c. à café
2 ; Aneth ; Aneth, frais
""", """
Battre les œufs avec un peu de poivre (le saumon est déjà salé).
Faire fondre le beurre à feu doux, verser les œufs et remuer sans arrêt jusqu'à ce qu'ils soient crémeux.
Hors du feu, ajouter le saumon en lanières et l'aneth. Servir sur le pain grillé.
""")

recette('Bol salé skyr, concombre et graines', 1, 5, ['sale', 'collation'], 'Nordique', 'Sans cuisson', """
170 ; Skyr ou yaourt riche en protéines, nature ; 19724
100 ; Concombre ; 20019
10 ; Graines de courge ; 15064 ; 1 c. à soupe
5 ; Huile d'olive ; 17270 ; 1 c. à café
2 ; Menthe fraîche ; Menthe, fraîche
""", """
Couper le concombre en petits dés.
Verser le skyr dans un bol, ajouter le concombre, la menthe ciselée, sel et poivre.
Arroser d'huile et parsemer de graines de courge grillées à sec.
""")

recette('Galettes de sarrasin œuf et jambon', 2, 15, ['sale', 'plat'], 'Française', 'Poêle', """
120 ; Farine de sarrasin ; Farine de sarrasin
220 ; Eau ; 18066
110 ; Oeufs ; 22000 ; 2 pièce
60 ; Jambon blanc ; 28900 ; 2 tranche
30 ; Emmental râpé ; Emmental
5 ; Beurre ; 16400 ; 1 c. à café
""", """
Mélanger la farine, l'eau et une pincée de sel jusqu'à obtenir une pâte lisse. Laisser reposer 10 minutes si possible.
Beurrer légèrement une grande poêle chaude et y étaler une louche de pâte.
Quand le dessous est doré, casser un œuf au centre, ajouter le jambon et l'emmental.
Replier les bords et laisser cuire jusqu'à ce que le blanc soit pris. Recommencer pour la deuxième.
""")

recette('Muffins aux œufs, épinards et feta', 6, 30, ['sale', 'collation'], 'Grecque', 'Four', """
440 ; Oeufs ; 22000 ; 8 pièce
100 ; Épinards frais ; 20059
80 ; Feta ; 12066
80 ; Poivron rouge ; 20087 ; 1 pièce
50 ; Lait demi-écrémé ; 19041
""", """
Préchauffer le four à 180 °C et huiler un moule à 12 muffins.
Battre les œufs avec le lait, sel et poivre.
Répartir dans les moules les épinards hachés, le poivron en dés et la feta émiettée, puis verser les œufs.
Cuire 20 minutes. Se garde 4 jours au frais et se réchauffe 30 secondes au micro-ondes.
""")

recette('Tofu brouillé au curcuma', 2, 12, ['sale'], 'Internationale', 'Poêle', """
300 ; Tofu ferme ; 20904
100 ; Tomates cerises ; 20172
80 ; Oignon ; 20034 ; 1 pièce
4 ; Curcuma ; Curcuma, poudre ; 1 c. à café
10 ; Huile d'olive ; 17270 ; 2 c. à café
20 ; Pousses d'épinard ; 20059
""", """
Faire revenir l'oignon émincé dans l'huile 3 minutes.
Émietter le tofu à la fourchette dans la poêle, ajouter le curcuma, sel et poivre.
Ajouter les tomates coupées en deux et les épinards, cuire 4 minutes en remuant.
""")

recette('Wrap petit-déjeuner œufs et haricots noirs', 2, 15, ['sale', 'plat'], 'Mexicaine', 'Poêle', """
165 ; Oeufs ; 22000 ; 3 pièce
120 ; Haricots noirs en boîte, égouttés ; 20524
90 ; Tortillas de blé ; 7815 ; 2 pièce
40 ; Cheddar râpé ; 12726
80 ; Tomate ; 20385 ; 1 pièce
2 ; Cumin ; Cumin, graine ; 0.5 c. à café
""", """
Réchauffer les haricots avec le cumin et les écraser grossièrement.
Brouiller les œufs dans une poêle antiadhésive.
Garnir les tortillas chaudes de haricots, d'œufs, de tomate en dés et de cheddar. Rouler et servir.
""")

recette('Fromage blanc aux herbes et tomates sur pain grillé', 1, 5, ['sale'], 'Internationale', 'Sans cuisson', """
150 ; Fromage blanc 3 % ; 19646
60 ; Pain complet ; Pain complet ou intégral ; 2 tranche
100 ; Tomates cerises ; 20172
3 ; Huile d'olive ; 17270 ; 1 c. à café
2 ; Basilic ; Basilic, frais
""", """
Griller le pain.
Étaler le fromage blanc, ajouter les tomates coupées, le basilic, un filet d'huile, sel et poivre.
""")

recette('Shakshuka express aux pois chiches', 2, 20, ['sale', 'plat'], 'Libanaise', 'Poêle', """
220 ; Oeufs ; 22000 ; 4 pièce
400 ; Tomates concassées en boîte ; Tomate, chair, appertisée
150 ; Pois chiches en boîte, égouttés ; 20532
80 ; Oignon ; 20034 ; 1 pièce
80 ; Poivron rouge ; 20087 ; 1 pièce
10 ; Huile d'olive ; 17270 ; 2 c. à café
2 ; Paprika fumé ; Paprika, poudre ; 1 c. à café
""", """
Faire revenir l'oignon et le poivron émincés dans l'huile 5 minutes.
Ajouter le paprika, les tomates et les pois chiches, saler et laisser mijoter 8 minutes.
Creuser 4 puits, y casser les œufs, couvrir et cuire 5 à 6 minutes, jusqu'à ce que les blancs soient pris.
""")

# ——— Petits-déjeuners sucrés ———

recette('Porridge protéiné banane et beurre de cacahuète', 1, 8, ['sucre'], 'Internationale', 'Casserole', """
50 ; Flocons d'avoine ; 32140
200 ; Lait demi-écrémé ; 19041
100 ; Skyr ou yaourt riche en protéines, nature ; 19724
60 ; Banane ; 13005 ; 0.5 pièce
15 ; Beurre de cacahuète ; 15202 ; 1 c. à soupe
""", """
Cuire les flocons dans le lait à feu doux 4 à 5 minutes, en remuant.
Hors du feu, incorporer le skyr pour une texture crémeuse.
Garnir de banane en rondelles et de beurre de cacahuète.
""")

recette('Overnight oats chocolat et framboises', 1, 5, ['sucre'], 'Internationale', 'Sans cuisson', """
45 ; Flocons d'avoine ; 32140
150 ; Fromage blanc 0 % ; 19644
100 ; Lait écrémé ; 19050
8 ; Cacao non sucré ; 18100 ; 1 c. à soupe
10 ; Graines de chia ; 15047 ; 1 c. à soupe
80 ; Framboises ; 13015
""", """
Mélanger les flocons, le fromage blanc, le lait, le cacao et le chia dans un bocal.
Fermer et laisser une nuit au frais.
Le matin, ajouter les framboises.
""")

recette('Pancakes à la banane et aux œufs', 2, 15, ['sucre'], 'Internationale', 'Poêle', """
120 ; Banane bien mûre ; 13005 ; 1 pièce
110 ; Oeufs ; 22000 ; 2 pièce
60 ; Flocons d'avoine mixés ; 32140
4 ; Levure chimique ; Levure chimique ou poudre à lever ; 1 c. à café
150 ; Fromage blanc 0 % ; 19644
100 ; Myrtilles ; 13028
""", """
Mixer la banane, les œufs, les flocons et la levure.
Cuire de petits pancakes dans une poêle antiadhésive à feu moyen, 2 minutes par face.
Servir avec le fromage blanc et les myrtilles.
""")

recette('Bowl fromage blanc, pomme et noix', 1, 5, ['sucre', 'collation'], 'Française', 'Sans cuisson', """
200 ; Fromage blanc 0 % ; 19644
150 ; Pomme ; 13039 ; 1 pièce
15 ; Cerneaux de noix ; 15005
2 ; Cannelle ; Cannelle, poudre
10 ; Miel ; 31008 ; 1 c. à café
""", """
Couper la pomme en dés.
Verser le fromage blanc dans un bol, ajouter la pomme, les noix concassées, la cannelle et le miel.
""")

recette('Crêpes protéinées au fromage blanc', 2, 20, ['sucre'], 'Française', 'Poêle', """
80 ; Farine de blé ; 9436
110 ; Oeufs ; 22000 ; 2 pièce
200 ; Lait demi-écrémé ; 19041
150 ; Fromage blanc 0 % ; 19644
150 ; Fraises ; 13014
""", """
Fouetter la farine, les œufs et le lait jusqu'à obtenir une pâte lisse.
Cuire 4 à 6 crêpes fines dans une poêle légèrement huilée.
Garnir de fromage blanc et de fraises coupées.
""")

recette('Pain perdu protéiné aux fruits rouges', 2, 15, ['sucre'], 'Française', 'Poêle', """
120 ; Pain complet ; Pain complet ou intégral ; 4 tranche
110 ; Oeufs ; 22000 ; 2 pièce
100 ; Lait demi-écrémé ; 19041
150 ; Skyr ou yaourt riche en protéines, nature ; 19724
120 ; Fruits rouges ; 13015
2 ; Cannelle ; Cannelle, poudre
""", """
Battre les œufs avec le lait et la cannelle.
Tremper les tranches de pain des deux côtés.
Les dorer 2 à 3 minutes par face dans une poêle antiadhésive.
Servir avec le skyr et les fruits rouges.
""")

recette('Smoothie bowl mangue et coco', 1, 5, ['sucre', 'collation'], 'Internationale', 'Mixeur', """
150 ; Mangue surgelée ; 13025
150 ; Skyr ou yaourt riche en protéines, nature ; 19724
100 ; Lait demi-écrémé ; 19041
8 ; Noix de coco râpée ; 15007 ; 1 c. à soupe
20 ; Muesli ; 32004
""", """
Mixer la mangue, le skyr et le lait jusqu'à obtenir une crème épaisse.
Verser dans un bol, parsemer de coco et de muesli.
""")

recette('Riz au lait express à la cannelle', 2, 25, ['sucre', 'collation'], 'Française', 'Casserole', """
80 ; Riz rond ; 9100
500 ; Lait demi-écrémé ; 19041
20 ; Sucre ; 31016
2 ; Cannelle ; Cannelle, poudre
200 ; Fromage blanc 0 % ; 19644
""", """
Porter le lait à frémissement avec la cannelle, ajouter le riz.
Cuire à feu très doux 20 minutes en remuant souvent, jusqu'à ce que le riz soit tendre.
Sucrer, laisser tiédir puis incorporer le fromage blanc.
""")

recette('Tartines fromage frais, figues et miel', 1, 5, ['sucre'], 'Italienne', 'Sans cuisson', """
60 ; Pain au levain ; 7002 ; 2 tranche
60 ; Fromage frais ; 12069
80 ; Figues fraîches ; Figue, crue ; 2 pièce
5 ; Miel ; 31008 ; 1 c. à café
""", """
Griller le pain, étaler le fromage frais.
Ajouter les figues en quartiers et un filet de miel.
""")

recette('Granola maison aux amandes', 10, 35, ['sucre', 'collation'], 'Internationale', 'Four', """
300 ; Flocons d'avoine ; 32140
80 ; Amandes ; 15000
40 ; Graines de courge ; 15064
60 ; Miel ; 31008 ; 3 c. à soupe
30 ; Huile de colza ; Huile de colza ; 2 c. à soupe
2 ; Cannelle ; Cannelle, poudre
""", """
Préchauffer le four à 160 °C.
Mélanger les flocons, les amandes concassées, les graines et la cannelle.
Ajouter le miel et l'huile tièdes, bien enrober.
Étaler sur une plaque et cuire 25 minutes en remuant à mi-cuisson. Laisser refroidir avant de mettre en bocal.
Une portion fait environ 50 g.
""")

# ——— Collations ———

recette('Houmous de haricots blancs et crudités', 4, 10, ['collation'], 'Internationale', 'Mixeur', """
240 ; Haricots blancs en boîte, égouttés ; 20511
30 ; Tahin ; 15203 ; 2 c. à soupe
20 ; Jus de citron ; 2028
5 ; Ail ; Ail, cru ; 1 pièce
15 ; Huile d'olive ; 17270 ; 1 c. à soupe
300 ; Carottes ; 20009
200 ; Concombre ; 20019
""", """
Mixer les haricots, le tahin, le citron, l'ail, l'huile et 3 cuillères d'eau froide jusqu'à obtenir une crème lisse. Saler.
Servir avec les carottes et le concombre en bâtonnets.
""")

recette('Œufs durs et radis', 1, 12, ['collation'], 'Française', 'Casserole', """
110 ; Oeufs ; 22000 ; 2 pièce
80 ; Radis ; Radis rouge, cru
""", """
Cuire les œufs 10 minutes dans l'eau bouillante, puis les refroidir.
Servir écalés avec les radis et une pincée de fleur de sel.
""")

recette('Pois chiches grillés au paprika', 4, 35, ['collation'], 'Internationale', 'Four', """
480 ; Pois chiches en boîte, égouttés ; 20532
15 ; Huile d'olive ; 17270 ; 1 c. à soupe
4 ; Paprika fumé ; Paprika, poudre ; 2 c. à café
2 ; Cumin ; Cumin, graine ; 1 c. à café
""", """
Préchauffer le four à 200 °C. Bien sécher les pois chiches dans un torchon.
Les mélanger avec l'huile, les épices et une pincée de sel.
Étaler sur une plaque et cuire 25 à 30 minutes, jusqu'à ce qu'ils soient croustillants. Se garde 3 jours dans une boîte.
""")

recette('Barres protéinées dattes et cacahuètes', 8, 15, ['collation'], 'Internationale', 'Sans cuisson', """
150 ; Dattes dénoyautées ; 13011
100 ; Flocons d'avoine ; 32140
60 ; Beurre de cacahuète ; 15202
60 ; Whey vanille ; etiquette:whey
40 ; Cacahuètes ; 15001
""", """
Mixer les dattes avec 2 cuillères d'eau chaude jusqu'à obtenir une pâte.
Ajouter les flocons, le beurre de cacahuète et la whey, mixer encore.
Incorporer les cacahuètes concassées, tasser dans un plat tapissé de papier cuisson.
Laisser 1 heure au frais puis couper 8 barres. Se gardent 1 semaine au frais.
""")

recette('Skyr, myrtilles et amandes', 1, 3, ['collation'], 'Nordique', 'Sans cuisson', """
150 ; Skyr ou yaourt riche en protéines, nature ; 19724
80 ; Myrtilles ; 13028
15 ; Amandes ; 15000
""", """
Verser le skyr dans un bol, ajouter les myrtilles et les amandes concassées.
""")

recette('Roulés de dinde au fromage frais', 1, 5, ['collation'], 'Internationale', 'Sans cuisson', """
60 ; Blanc de dinde en tranches ; Blanc de dinde ; 3 tranche
30 ; Fromage frais ; 12069
60 ; Concombre ; 20019
""", """
Tartiner les tranches de dinde de fromage frais.
Poser un bâtonnet de concombre sur chacune et rouler.
""")

recette('Mug cake protéiné au chocolat', 1, 5, ['collation'], 'Internationale', 'Micro-ondes', """
55 ; Oeuf ; 22000 ; 1 pièce
20 ; Whey vanille ; etiquette:whey
10 ; Cacao non sucré ; 18100 ; 1 c. à soupe
15 ; Flocons d'avoine mixés ; 32140
30 ; Lait demi-écrémé ; 19041
2 ; Levure chimique ; Levure chimique ou poudre à lever
""", """
Mélanger tous les ingrédients dans une grande tasse.
Cuire 60 à 80 secondes au micro-ondes, à pleine puissance. Laisser tiédir une minute.
""")

recette('Tartine thon et fromage frais', 1, 5, ['collation', 'sale'], 'Française', 'Sans cuisson', """
70 ; Thon au naturel, égoutté ; 26039 ; 0.5 boîte
20 ; Fromage frais ; 12069
40 ; Pain de seigle ; Pain de seigle ; 1 tranche
5 ; Jus de citron ; 2028
1 ; Ciboulette ; 11003
""", """
Écraser le thon avec le fromage frais, le citron, la ciboulette et du poivre.
Tartiner sur le pain de seigle.
""")

recette('Compote de pomme et fromage blanc', 1, 3, ['collation'], 'Française', 'Sans cuisson', """
100 ; Compote sans sucres ajoutés ; Compote de pomme
150 ; Fromage blanc 0 % ; 19644
5 ; Graines de lin ; 15034 ; 1 c. à café
""", """
Verser le fromage blanc dans un bol, ajouter la compote et les graines de lin.
""")

# ——— Cuisine française du quotidien ———

recette('Hachis parmentier allégé', 4, 60, ['plat'], 'Française', 'Four', """
800 ; Pommes de terre ; 4008
500 ; Bœuf haché 5 % ; 6250
150 ; Oignon ; 20034 ; 2 pièce
200 ; Carottes ; 20009 ; 2 pièce
200 ; Lait demi-écrémé ; 19041
40 ; Emmental râpé ; Emmental
30 ; Concentré de tomate ; 20068 ; 2 c. à soupe
""", """
Cuire les pommes de terre épluchées 20 minutes dans l'eau salée, puis les écraser avec le lait chaud.
Faire revenir l'oignon et les carottes râpées 5 minutes, ajouter le bœuf et le concentré, cuire 8 minutes. Saler, poivrer.
Étaler la viande dans un plat, recouvrir de purée et d'emmental.
Gratiner 20 minutes à 200 °C.
""")

recette('Poulet basquaise', 4, 45, ['plat'], 'Française', 'Cocotte', """
600 ; Blancs de poulet ; 36017 ; 4 pièce
300 ; Poivrons rouges et verts ; 20087 ; 2 pièce
400 ; Tomates concassées en boîte ; Tomate, chair, appertisée
150 ; Oignon ; 20034 ; 2 pièce
10 ; Ail ; Ail, cru ; 2 pièce
15 ; Huile d'olive ; 17270 ; 1 c. à soupe
2 ; Piment d'Espelette ; Poivre de Cayenne ou piment de Cayenne
240 ; Riz basmati ; Riz thaï ou basmati, cru
""", """
Dorer le poulet en morceaux dans l'huile, le réserver.
Faire revenir l'oignon, l'ail et les poivrons en lanières 8 minutes.
Ajouter les tomates, le piment et le poulet, couvrir et mijoter 25 minutes.
Pendant ce temps, cuire le riz. Servir ensemble.
""")

recette('Blanquette de dinde légère', 4, 50, ['plat'], 'Française', 'Cocotte', """
600 ; Escalopes de dinde ; 36304
300 ; Carottes ; 20009 ; 3 pièce
250 ; Champignons de Paris ; Champignon de Paris ou champignon de couche, cru
150 ; Oignon ; 20034 ; 2 pièce
800 ; Bouillon de volaille ; 25947
100 ; Crème légère 15 % ; 19431
20 ; Farine ; 9436 ; 2 c. à soupe
20 ; Jus de citron ; 2028
240 ; Riz basmati ; Riz thaï ou basmati, cru
""", """
Couper la dinde en cubes et les carottes en rondelles.
Mettre la dinde, les carottes et l'oignon dans le bouillon, laisser frémir 25 minutes. Ajouter les champignons 10 minutes avant la fin.
Délayer la farine dans la crème avec une louche de bouillon, verser dans la cocotte et laisser épaissir 3 minutes.
Ajouter le citron, rectifier l'assaisonnement et servir avec le riz.
""")

recette('Lentilles vertes, saucisse de volaille et carottes', 4, 40, ['plat'], 'Française', 'Cocotte', """
300 ; Lentilles vertes du Puy ; Lentille verte, sèche
400 ; Saucisses de volaille ; Saucisse de volaille
300 ; Carottes ; 20009 ; 3 pièce
150 ; Oignon ; 20034 ; 1 pièce
2 ; Laurier et thym ; 11053
""", """
Rincer les lentilles et les mettre dans une cocotte avec 3 fois leur volume d'eau froide, l'oignon, les carottes en rondelles et le laurier.
Cuire 25 minutes à frémissement, saler en fin de cuisson.
Pendant ce temps, dorer les saucisses à la poêle puis les ajouter aux lentilles 5 minutes avant de servir.
""")

recette('Filet de cabillaud, purée de brocoli', 2, 25, ['plat'], 'Française', 'Four', """
300 ; Filets de cabillaud ; 26043 ; 2 pièce
400 ; Brocoli ; 20057
200 ; Pommes de terre ; 4008
50 ; Lait demi-écrémé ; 19041
10 ; Beurre ; 16400 ; 2 c. à café
10 ; Jus de citron ; 2028
""", """
Cuire le brocoli et les pommes de terre 15 minutes à la vapeur, puis les écraser avec le lait et le beurre. Saler.
Cuire le cabillaud 12 minutes au four à 200 °C, avec sel, poivre et citron.
Servir le poisson sur la purée.
""")

recette('Ratatouille et œufs cocotte', 2, 45, ['plat'], 'Française', 'Cocotte', """
250 ; Courgette ; 20020 ; 1 pièce
250 ; Aubergine ; 20053 ; 1 pièce
150 ; Poivron rouge ; 20087 ; 1 pièce
300 ; Tomates ; 20385 ; 3 pièce
100 ; Oignon ; 20034 ; 1 pièce
15 ; Huile d'olive ; 17270 ; 1 c. à soupe
220 ; Oeufs ; 22000 ; 4 pièce
""", """
Couper tous les légumes en dés.
Faire revenir l'oignon dans l'huile, ajouter aubergine, poivron et courgette, cuire 10 minutes.
Ajouter les tomates, saler, poivrer et laisser mijoter 20 minutes à couvert.
Creuser 4 puits, y casser les œufs et cuire encore 6 minutes à couvert.
""")

recette('Salade niçoise au thon', 2, 20, ['plat'], 'Française', 'Casserole', """
140 ; Thon au naturel, égoutté ; 26039 ; 1 boîte
110 ; Oeufs ; 22000 ; 2 pièce
200 ; Haricots verts ; 20061
200 ; Pommes de terre ; 4008
200 ; Tomates ; 20385 ; 2 pièce
30 ; Olives noires ; 13186
150 ; Laitue ; 20031
15 ; Huile d'olive ; 17270 ; 1 c. à soupe
10 ; Vinaigre ; 11018 ; 2 c. à café
""", """
Cuire les pommes de terre 15 minutes et les haricots 8 minutes dans l'eau salée. Cuire les œufs 10 minutes.
Mélanger l'huile, le vinaigre, sel et poivre.
Disposer la salade, les légumes, le thon, les œufs en quartiers et les olives. Arroser de vinaigrette.
""")

recette('Soupe de légumes et pois cassés', 4, 50, ['plat'], 'Française', 'Cocotte', """
250 ; Pois cassés ; Pois cassé, sec
300 ; Carottes ; 20009 ; 3 pièce
200 ; Poireau ; 20039 ; 1 pièce
150 ; Oignon ; 20034 ; 1 pièce
1500 ; Bouillon de légumes ; 25948
80 ; Dés de jambon de dinde ; Jambon de dinde
""", """
Rincer les pois cassés. Les mettre dans le bouillon avec les légumes coupés.
Cuire 40 minutes à frémissement, puis mixer.
Dorer les dés de jambon à sec et les parsemer sur la soupe.
""")

recette('Quiche sans pâte poireaux et saumon', 4, 45, ['plat'], 'Française', 'Four', """
300 ; Poireaux ; 20039 ; 2 pièce
200 ; Saumon cru ; 26036
330 ; Oeufs ; 22000 ; 6 pièce
200 ; Lait demi-écrémé ; 19041
50 ; Fromage râpé ; Emmental
""", """
Préchauffer le four à 180 °C.
Faire fondre les poireaux émincés 10 minutes à la poêle avec un fond d'eau.
Battre les œufs avec le lait, sel, poivre et muscade.
Répartir les poireaux et le saumon en cubes dans un plat, verser les œufs, parsemer de fromage.
Cuire 30 minutes.
""")

recette('Gratin de courgettes et poulet', 4, 40, ['plat'], 'Française', 'Four', """
800 ; Courgettes ; 20020 ; 4 pièce
500 ; Blancs de poulet ; 36017
200 ; Fromage blanc 3 % ; 19646
50 ; Parmesan ; 12120
165 ; Oeufs ; 22000 ; 3 pièce
""", """
Couper les courgettes en rondelles et les faire revenir 8 minutes à la poêle pour qu'elles rendent leur eau.
Couper le poulet en dés et le dorer 5 minutes.
Battre les œufs avec le fromage blanc, la moitié du parmesan, sel et poivre.
Mélanger avec les courgettes et le poulet dans un plat, couvrir du reste de parmesan et cuire 25 minutes à 190 °C.
""")

recette('Bœuf aux carottes', 6, 150, ['plat'], 'Française', 'Cocotte', """
900 ; Bœuf à braiser ; 6102
600 ; Carottes ; 20009 ; 6 pièce
150 ; Oignon ; 20034 ; 2 pièce
500 ; Bouillon de bœuf ; 25930
200 ; Vin rouge ; 5214
15 ; Huile d'olive ; 17270 ; 1 c. à soupe
2 ; Laurier et thym ; 11053
""", """
Dorer la viande en cubes dans l'huile, en plusieurs fois.
Ajouter l'oignon, puis le vin et le bouillon, le laurier et le thym.
Couvrir et cuire 1 heure 30 à feu doux. Ajouter les carottes en rondelles et cuire encore 45 minutes.
Meilleur réchauffé le lendemain. Se congèle très bien.
""")

recette('Papillotes de saumon, fenouil et citron', 2, 30, ['plat'], 'Française', 'Four', """
250 ; Pavés de saumon ; 26036 ; 2 pièce
300 ; Fenouil ; 20028 ; 1 pièce
120 ; Quinoa ; Quinoa, cru
20 ; Jus de citron ; 2028
5 ; Huile d'olive ; 17270 ; 1 c. à café
2 ; Aneth ; Aneth, frais
""", """
Préchauffer le four à 200 °C. Cuire le quinoa 12 minutes dans l'eau salée.
Émincer finement le fenouil et le répartir sur deux feuilles de papier cuisson.
Poser le saumon, arroser de citron et d'huile, saler, poivrer, ajouter l'aneth.
Fermer les papillotes et cuire 18 minutes. Servir avec le quinoa.
""")

# ——— Plats protéinés à préparer à l'avance ———

recette('Bowl poulet, riz et brocoli', 4, 30, ['plat'], 'Internationale', 'Poêle', """
600 ; Blancs de poulet ; 36017
240 ; Riz basmati ; Riz thaï ou basmati, cru
500 ; Brocoli ; 20057
30 ; Sauce soja ; 11104 ; 2 c. à soupe
15 ; Huile de sésame ; 17400 ; 1 c. à soupe
10 ; Gingembre ; Gingembre, racine fraîche
10 ; Graines de sésame ; 15010 ; 1 c. à soupe
""", """
Cuire le riz. Cuire le brocoli 5 minutes à la vapeur.
Dorer le poulet en lanières dans l'huile de sésame 6 minutes, ajouter le gingembre râpé et la sauce soja.
Répartir dans 4 boîtes : riz, brocoli, poulet, sésame. Se garde 4 jours au frais.
""")

recette('Chili de dinde aux haricots rouges', 6, 45, ['plat'], 'Mexicaine', 'Cocotte', """
600 ; Escalopes de dinde hachées ; 36304
480 ; Haricots rouges en boîte, égouttés ; 20524
800 ; Tomates concassées en boîte ; Tomate, chair, appertisée
150 ; Oignon ; 20034 ; 2 pièce
150 ; Poivron rouge ; 20087 ; 1 pièce
150 ; Maïs doux, égoutté ; 20066
6 ; Cumin et paprika ; Cumin, graine ; 2 c. à café
15 ; Huile d'olive ; 17270 ; 1 c. à soupe
""", """
Faire revenir l'oignon et le poivron dans l'huile 5 minutes, ajouter la dinde hachée et les épices, cuire 5 minutes.
Ajouter les tomates, les haricots et le maïs. Laisser mijoter 25 minutes.
Se garde 4 jours au frais et se congèle en portions.
""")

recette('Curry de pois chiches et épinards', 4, 30, ['plat'], 'Indienne', 'Cocotte', """
480 ; Pois chiches en boîte, égouttés ; 20532
400 ; Tomates concassées en boîte ; Tomate, chair, appertisée
200 ; Épinards frais ; 20059
200 ; Lait de coco ; 18041
150 ; Oignon ; 20034 ; 1 pièce
10 ; Gingembre et ail ; Gingembre, racine fraîche
8 ; Curry en poudre ; 11005 ; 1 c. à soupe
10 ; Huile de colza ; Huile de colza ; 2 c. à café
240 ; Riz basmati ; Riz thaï ou basmati, cru
""", """
Faire revenir l'oignon, le gingembre et l'ail dans l'huile, ajouter le curry 1 minute.
Ajouter les tomates, les pois chiches et le lait de coco, mijoter 15 minutes.
Ajouter les épinards jusqu'à ce qu'ils tombent. Servir avec le riz.
""")

recette('Salade de quinoa, feta et légumes croquants', 4, 20, ['plat'], 'Grecque', 'Casserole', """
240 ; Quinoa ; Quinoa, cru
240 ; Pois chiches en boîte, égouttés ; 20532
150 ; Feta ; 12066
250 ; Concombre ; 20019
250 ; Tomates cerises ; 20172
80 ; Oignon rouge ; Oignon rouge, cru ; 1 pièce
30 ; Huile d'olive ; 17270 ; 2 c. à soupe
30 ; Jus de citron ; 2028
""", """
Cuire le quinoa 12 minutes, l'égoutter et le laisser refroidir.
Couper les légumes en dés, émietter la feta.
Mélanger le tout avec l'huile, le citron, sel et poivre. Se garde 3 jours au frais.
""")

recette('Saumon teriyaki, riz et haricots verts', 2, 25, ['plat'], 'Japonaise', 'Poêle', """
250 ; Pavés de saumon ; 26036 ; 2 pièce
120 ; Riz ; Riz thaï ou basmati, cru
200 ; Haricots verts ; 20061
30 ; Sauce soja ; 11104 ; 2 c. à soupe
10 ; Miel ; 31008 ; 2 c. à café
5 ; Gingembre ; Gingembre, racine fraîche
""", """
Cuire le riz. Cuire les haricots verts 7 minutes à la vapeur.
Mélanger la sauce soja, le miel et le gingembre râpé.
Saisir le saumon 3 minutes côté peau, retourner, verser la sauce et laisser caraméliser 3 minutes.
""")

recette('Wok de bœuf, poivrons et nouilles', 3, 20, ['plat'], 'Chinoise', 'Wok', """
400 ; Bœuf en lanières ; 6201
180 ; Nouilles de blé ; 9863
300 ; Poivrons ; 20087 ; 2 pièce
150 ; Oignon ; 20034 ; 1 pièce
30 ; Sauce soja ; 11104 ; 2 c. à soupe
15 ; Sauce d'huître ; 11223 ; 1 c. à soupe
10 ; Huile de colza ; Huile de colza ; 2 c. à café
""", """
Cuire les nouilles selon le paquet et les égoutter.
Saisir le bœuf 2 minutes à feu très vif dans l'huile, le réserver.
Faire sauter l'oignon et les poivrons 4 minutes, remettre le bœuf, ajouter les sauces et les nouilles. Mélanger 1 minute.
""")

recette('Dahl de lentilles corail', 4, 30, ['plat'], 'Indienne', 'Cocotte', """
250 ; Lentilles corail ; 20535
400 ; Tomates concassées en boîte ; Tomate, chair, appertisée
200 ; Lait de coco ; 18041
150 ; Oignon ; 20034 ; 1 pièce
10 ; Gingembre ; Gingembre, racine fraîche
8 ; Curry et curcuma ; 11005 ; 1 c. à soupe
10 ; Huile de colza ; Huile de colza ; 2 c. à café
600 ; Eau ; 18066
""", """
Faire revenir l'oignon et le gingembre dans l'huile, ajouter les épices.
Ajouter les lentilles rincées, les tomates, le lait de coco et l'eau.
Cuire 20 minutes en remuant, jusqu'à ce que les lentilles soient fondantes. Saler.
""")

recette('Boulettes de poulet sauce tomate', 4, 35, ['plat'], 'Italienne', 'Poêle', """
600 ; Blancs de poulet hachés ; 36017
55 ; Oeuf ; 22000 ; 1 pièce
40 ; Parmesan ; 12120
30 ; Chapelure ; 7500
700 ; Coulis de tomate ; 20260
10 ; Huile d'olive ; 17270 ; 2 c. à café
320 ; Spaghetti complets ; Pâtes sèches, au blé complet, crues
""", """
Mixer le poulet, puis le mélanger avec l'œuf, le parmesan, la chapelure, sel et poivre. Former une vingtaine de boulettes.
Les dorer dans l'huile 5 minutes, ajouter le coulis et mijoter 15 minutes.
Servir avec les spaghetti cuits al dente.
""")

recette('Poke bowl thon, riz et avocat', 2, 20, ['plat'], 'Japonaise', 'Sans cuisson', """
140 ; Thon au naturel, égoutté ; 26039 ; 1 boîte
120 ; Riz ; Riz thaï ou basmati, cru
140 ; Avocat ; Avocat, chair sans peau, sans noyau, cru ; 1 pièce
150 ; Concombre ; 20019
100 ; Carotte ; 20009 ; 1 pièce
20 ; Sauce soja ; 11104 ; 1 c. à soupe
10 ; Graines de sésame ; 15010 ; 1 c. à soupe
""", """
Cuire le riz et le laisser tiédir.
Répartir dans deux bols le riz, le thon, l'avocat en tranches, le concombre et la carotte râpée.
Arroser de sauce soja et parsemer de sésame.
""")

recette('Omelette au four pommes de terre et oignons', 4, 40, ['plat', 'sale'], 'Espagnole', 'Four', """
500 ; Pommes de terre ; 4008
150 ; Oignon ; 20034 ; 2 pièce
440 ; Oeufs ; 22000 ; 8 pièce
15 ; Huile d'olive ; 17270 ; 1 c. à soupe
""", """
Couper les pommes de terre en fines rondelles et l'oignon en lamelles, les faire revenir 15 minutes dans l'huile à feu moyen.
Battre les œufs avec sel et poivre, ajouter les pommes de terre.
Verser dans un plat huilé et cuire 20 minutes à 180 °C. Se mange chaud ou froid.
""")

recette('Tofu sauté, légumes et riz complet', 3, 30, ['plat'], 'Chinoise', 'Wok', """
400 ; Tofu ferme ; 20904
180 ; Riz complet ; Riz complet, cru
300 ; Brocoli ; 20057
150 ; Carottes ; 20009
30 ; Sauce soja ; 11104 ; 2 c. à soupe
15 ; Huile de sésame ; 17400 ; 1 c. à soupe
20 ; Cacahuètes ; 15001
""", """
Cuire le riz complet. Couper le tofu en cubes et bien le sécher.
Dorer le tofu 8 minutes dans l'huile de sésame, le réserver.
Faire sauter les légumes 5 minutes, remettre le tofu, ajouter la sauce soja.
Servir sur le riz avec les cacahuètes concassées.
""")

recette('Escalopes de poulet panées au four, haricots verts', 4, 30, ['plat'], 'Française', 'Four', """
600 ; Blancs de poulet ; 36017 ; 4 pièce
55 ; Oeuf ; 22000 ; 1 pièce
60 ; Chapelure ; 7500
30 ; Parmesan ; 12120
600 ; Haricots verts ; 20061
10 ; Huile d'olive ; 17270 ; 2 c. à café
""", """
Préchauffer le four à 200 °C. Aplatir les blancs de poulet.
Les passer dans l'œuf battu puis dans la chapelure mélangée au parmesan.
Les poser sur une plaque, arroser d'un filet d'huile et cuire 18 minutes en les retournant à mi-cuisson.
Servir avec les haricots verts cuits à la vapeur.
""")

recette('Pâtes complètes au thon, tomates et olives', 3, 20, ['plat'], 'Italienne', 'Casserole', """
240 ; Pâtes complètes ; Pâtes sèches, au blé complet, crues
280 ; Thon au naturel, égoutté ; 26039 ; 2 boîte
400 ; Tomates concassées en boîte ; Tomate, chair, appertisée
30 ; Olives noires ; 13186
10 ; Huile d'olive ; 17270 ; 2 c. à café
5 ; Ail ; Ail, cru ; 1 pièce
""", """
Cuire les pâtes al dente.
Faire revenir l'ail dans l'huile, ajouter les tomates et laisser réduire 10 minutes.
Ajouter le thon émietté et les olives, mélanger avec les pâtes.
""")

recette('Soupe de poulet aux nouilles et gingembre', 4, 30, ['plat'], 'Vietnamienne', 'Cocotte', """
500 ; Blancs de poulet ; 36017
1500 ; Bouillon de volaille ; 25947
160 ; Nouilles de riz ; 9100
200 ; Carottes ; 20009
150 ; Pak choï ; 20340
15 ; Gingembre ; Gingembre, racine fraîche
20 ; Sauce nuoc-mâm ; 11194 ; 1 c. à soupe
10 ; Coriandre ; Coriandre, fraiche
""", """
Porter le bouillon à frémissement avec le gingembre en lamelles, y pocher le poulet 15 minutes. Le sortir et l'effilocher.
Ajouter les carottes en julienne et le pak choï 4 minutes, puis les nouilles 3 minutes.
Remettre le poulet, assaisonner avec le nuoc-mâm et servir avec la coriandre.
""")
