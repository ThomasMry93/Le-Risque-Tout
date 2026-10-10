# Le Risque Tout

Quiz de soirée pour smartphone, animé par un **maître du jeu** qui tient le téléphone, lit les questions et arbitre.

**Jouer :** https://thomasmry93.github.io/Le-Risque-Tout/

## Principe

Chaque thème propose des questions de difficulté croissante : **x1** à **x5**, puis **Risque Tout** et, en mode Hardcore, **Mega Risque Tout**. À son tour, un joueur choisit une case ; le maître du jeu lit la question et valide la réponse.

| Mode | Bonne réponse | Mauvaise réponse |
|---|---|---|
| Classique, x1 à x5 | + points de la case | − points de la case |
| Classique, Risque Tout | score doublé | score remis à 0 |
| Hardcore, x1 à x5 | on distribue les gorgées | on les boit |
| Hardcore, Risque Tout | on fait boire un cul sec | cul sec pour soi |
| Hardcore, Mega Risque Tout | reste à boire effacé | reste à boire doublé |

Environ un thème sur cinq cache, derrière un Risque Tout ou un Mega Risque Tout, une question d'une facilité absurde.

Le mode Hardcore est réservé aux majeurs. L'abus d'alcool est dangereux pour la santé, à consommer avec modération.

## Fonctionnalités

- 114 séries de 7 questions réparties en 46 thèmes, ajoutées au hasard ou au choix, même en cours de partie
- Valeurs des cases réglables (points, gorgées, culs secs du Risque Tout)
- Scores et « reste à boire » ajustables à la main
- Thèmes déjà joués signalés (indicateur masquable, historique effaçable)
- Mascotte animateur de jeu télé : en grand sur l'accueil (elle réagit quand on la touche), puis surgit à chaque écran à un endroit différent ; éméchée en mode Hardcore
- Web app installable (« Ajouter à l'écran d'accueil ») qui fonctionne hors connexion

## Fichiers

- `index.html` : tout le jeu (HTML, CSS, JavaScript et questions)
- `manifest.webmanifest`, `sw.js`, `icons/` : installation sur téléphone et mode hors connexion
