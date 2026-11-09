# BlablaLib Editor

Éditeur web de dialogues pour [BlablaLib](https://github.com/GCJOJO/BlablaLib) (Minecraft 1.21.1), avec une preview qui rejoue le dialogue comme le mod.

```bash
npm install
npm run dev     # http://localhost:5183
npm test        # tests du moteur et de la validation
npm run build   # site statique dans dist/, hébergeable sur GitHub Pages
```

## Fonctionnement

- **Ouvrir un dossier** : un datapack, ou le dossier d'un mod. Le site repère `data/<ns>/dialogues/*.json`, `assets/<ns>/lang/*.json` et `assets/<ns>/textures/**.png` (les dossiers `build`, `run`, etc. sont ignorés). **Enregistrer** réécrit seulement les fichiers modifiés. Nécessite Chrome ou Edge.
- **Sans dossier** (ou sur Firefox) : import de fichiers JSON et bouton **Exporter** en `.zip` (datapack à la racine, langues et textures dans `resourcepack/`). Avec un dossier ouvert, le même export reste disponible à côté d'**Enregistrer**.
- Le travail en cours est gardé dans le navigateur (IndexedDB). Rien n'est envoyé sur un serveur.
- **Options** (roue dentée) : langue du site, français ou anglais. Par défaut, celle du navigateur.

## Extensions

Une extension décrit les actions custom d'un autre mod (`registerCustomAction`) dans un fichier JSON, sans code. L'onglet **Extensions** permet d'en créer, d'en importer et de les exporter. Leurs actions apparaissent ensuite dans la palette, avec un formulaire, un résumé et des vérifications tirés du schéma.

- Avec un dossier ouvert, elles sont lues et enregistrées dans `blablalib-extensions/*.json`, à la racine du dossier. Elles ne vont pas dans le zip du datapack : le jeu n'en a pas besoin.
- La preview ne connaît pas le code Java de l'action. Elle reproduit seulement son rythme (passe aussitôt, dure un nombre de ticks, ou attend un clic) et l'écrit dans le journal.
- Une action dont l'extension est absente redevient une action inconnue, sans perdre ses données.
- Les libellés, descriptions et aides sont de simples textes. Les traduire par langue du site est facultatif, et l'anglais sert de repli.
- Exemple : [`docs/extension-exemple.json`](docs/extension-exemple.json). Le format complet est dans [`docs/plan-extensions.md`](docs/plan-extensions.md).

## Organisation du code

- `src/engine/` : portage du comportement du mod, sans interface. `sim.ts` reprend `DialogueScreen`, `DialogueManager` et les actions ; `bbcode.ts`, `color.ts` et `easing.ts` reprennent LibLib ; `render.ts` dessine sur le canvas.
- `src/model/` : `schema.ts` décrit les actions et génère les formulaires, `extensions.ts` lit, vérifie et convertit les extensions, `validate.ts` contient les vérifications, `io.ts` la lecture et l'écriture.
- `src/ui/` : composants React.
- `src/i18n/` : langue de l'interface. Le texte français sert de clé (`t('Enregistrer')`) et `en.ts` contient sa traduction. Tout nouveau texte passe par `t()`, ou par `N_()` s'il est rangé dans une constante, et `npm test` échoue si sa traduction manque.

## Fidélité au mod

Le moteur est volontairement fidèle au code, **bugs compris** : la référence est le code Java de BlablaLib 2.0.2 et LibLib 0.2.2, pas la documentation, qui diffère sur plusieurs noms de champs. Si un comportement est corrigé dans le mod, il faut le corriger aussi dans `src/engine/sim.ts` et retirer l'alerte associée dans `src/model/validate.ts`.

Trois écarts volontaires avec ces versions, qui sont des erreurs dont l'intention est claire (recherche « Écart » dans le code) :

- `DialogueManager.playerDialogueAdvanced` part de `getLastCompletedIndex()` au lieu de `getLastCompletedIndex() + 1`. Tel quel, le premier paquet lève une exception sur `actions.get(-1)`.
- `Color.fromString` utilise `colorInt >> 24` au lieu de `>>> 24`. Tel quel, un rouge de 0x80 ou plus est lu comme 0 et `#FFFFFFFF` donne du cyan.
- `DialoguePressEnter` n'est pas enregistrée dans `registerDefaultActions`. Telle quelle, `blablalib:press_enter` est une action inconnue. Ce nom est supposé d'après l'identifiant de son `TYPE`.

Limites de la preview : les sons et les commandes sont seulement listés dans le journal, la durée des cinématiques est simulée, les effets BBCode personnalisés d'autres mods sont ignorés. La police et les boutons sont redessinés (aucune ressource Mojang) : les largeurs de lettres sont celles du jeu, mais pas le dessin exact. Le fond flouté est une approximation.
