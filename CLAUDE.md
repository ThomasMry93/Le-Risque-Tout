# Le Risque Tout — notes pour Claude

- Tout le jeu tient dans `index.html` : styles, script et questions (constante `THEMES`). Pas de build.
- Interface et contenus en français. Le joueur ne touche pas le téléphone : un maître du jeu arbitre.
- Questions : chaque série a exactement 7 entrées `[question, réponse]` dans l'ordre x1, x2, x3, x4, x5, Risque Tout, Mega Risque Tout (Hardcore seulement), de la plus facile à la plus difficile. Les séries d'une même famille sont numérotées automatiquement (`Sport 1`, `Sport 2`…). Ajouter les nouvelles séries **à la fin** de `THEMES` : l'historique « déjà joué » repose sur ces noms.
- Questions cadeau : constante `EASY`, tirées pour environ un thème sur cinq (`EASY_RATE`).
- À chaque mise à jour publiée, incrémenter `VERSION` dans `sw.js` pour que les téléphones récupèrent la nouvelle version.
- Façon de travailler : préparer et tester les changements dans Claude, et n'envoyer sur GitHub qu'après l'accord de l'utilisateur.
- Ne jamais toucher au dépôt Vingt-Indices depuis ce projet.
