# Train Sim — Notes techniques

## Optimisation carte (gares / zoom)

- Les lignes du réseau restent affichées à tous les niveaux de zoom.
- Les marqueurs de gares sont masqués tant que la carte n'est pas assez zoomée pour éviter les ralentissements.
- Seuil configurable dans `/home/runner/work/train-sim/train-sim/script.js` :
  - `STATION_MARKER_MIN_ZOOM = 8`

## Itinéraire avec gares intermédiaires

- Le calcul de suggestions d’arrêts intermédiaires utilise désormais en priorité un graphe local construit à partir :
  - des gares (`gares-de-voyageurs.json`)
  - des lignes (`lignes_sncf.json`)
- Cela permet de proposer des trajets multi-segments (même ligne et correspondances), même si départ et arrivée ne sont pas des voisins directs.
- Protections ajoutées :
  - limitation du nombre de nœuds explorés (`ROUTE_GRAPH_MAX_VISITED`)
  - validation du tracé retourné par le routeur avant enregistrement.

## Validation manuelle recommandée

1. Ouvrir l’onglet **Carte & Itinéraires**.
2. Vérifier qu’en zoom faible (< 8), seules les lignes sont visibles (pas les points de gares).
3. Zoomer à 8+ puis vérifier l’apparition des gares.
4. Sélectionner deux gares éloignées/non voisines et vérifier que des arrêts intermédiaires sont proposés automatiquement.
5. Valider un itinéraire et vérifier :
   - affichage du tracé sur carte,
   - présence des arrêts dans la liste des circulations actives.
