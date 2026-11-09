# Plan : système d'extensions

Permettre aux utilisateurs de décrire le schéma de leurs actions custom, avec un éditeur dédié et un chargement / une sauvegarde en JSON.

> **Statut :** implémenté, avec les choix recommandés ci-dessous (extensions par projet, `registerOverload` laissé pour plus tard, preview limitée au rythme et au journal). Exemple : `docs/extension-exemple.json`.

## Principe

Une extension est un fichier JSON qui **décrit** des actions custom, sans contenir de code. On peut donc la partager sans risque, et l'éditeur en génère les mêmes formulaires que pour les actions de base.

**La limite à accepter :** le site ne peut pas exécuter le Java d'une action custom. La preview simule donc son rythme d'après ce que l'extension déclare, mais ne reproduit pas ce que l'action dessine (son `draw`) ni ce qu'elle fait en jeu. Elle l'indique dans le journal.

## Ce que permet le mod

- `DialogueManager.registerCustomAction(ResourceLocation, Class)` ajoute une action. Un nom déjà pris est refusé.
- `DialogueManager.registerOverload(namespace, action, Class)` remplace une action existante pour les dialogues d'un namespace.
- `DialogueLoader` instancie l'action par réflexion, avec le constructeur `(JsonObject)` ou sans argument.
- Une action définit elle-même `isBlocking()` et `isSkippable()`, ce que l'extension doit donc déclarer.

## Format du fichier

```json
{
  "format": 1,
  "id": "mon_mod",
  "name": "Mon mod",
  "version": "1.0.0",
  "actions": [
    {
      "id": "mon_mod:camera_shake",
      "label": "Camera shake",
      "description": "Shakes the camera.",
      "icon": "wand",
      "blocking": true,
      "skippable": true,
      "preview": { "mode": "ticks", "ticksField": "time", "log": "Secousse {intensity}" },
      "fields": [
        { "key": "time", "label": "Duration", "type": "number", "required": true, "default": 20, "min": 0, "step": 1 },
        { "key": "intensity", "label": "Intensity", "type": "number", "default": 1, "step": 0.1, "slider": true, "min": 0, "max": 5 }
      ]
    }
  ]
}
```

- **Textes :** `label`, `description` et `hint` sont des textes simples, affichés quelle que soit la langue du site. Les traductions sont facultatives : `{ "en": "…", "fr": "…" }`, avec l'anglais en repli.
- **Types de champs :** ceux qui existent déjà (`text`, `multiline`, `number`, `bool`, `select`, `color`, `dialogue`, `speaker`, `texture`, `json`). `json` sert de solution de repli pour les structures imbriquées.
- **Clés de champ :** uniques dans une action. `action` est réservée.
- **Modes de preview :**
  - `instant` : l'action passe tout de suite.
  - `ticks` : elle bloque pendant une durée fixe ou lue dans un champ.
  - `input` : elle attend un clic ou une touche.

## Chargement et sauvegarde

- **Import et export :** bouton d'import d'un `.json`, avec une validation stricte et des erreurs précises, et export d'une extension en `.json`.
- **Dossier ouvert :** les fichiers de `blablalib-extensions/*.json` sont chargés automatiquement, et **Enregistrer** les réécrit. Ils peuvent ainsi vivre dans le dépôt du mod.
- **Stockage :** les extensions sont rangées dans `Project`, ce qui leur donne l'annulation (Ctrl+Z), la sauvegarde automatique et le compteur de fichiers non enregistrés. Une ancienne sauvegarde sans extensions démarre avec une liste vide.
- **Zip du datapack :** il ne les inclut pas, car le jeu n'en a pas besoin.

### Cas limites

- **Identifiant déjà pris par une action de base :** l'import est refusé, car `registerCustomAction` refuserait aussi ce nom en jeu.
- **Conflit entre deux extensions :** l'éditeur demande laquelle garder.
- **Extension absente ou supprimée :** l'action retombe sur le formulaire « action inconnue » avec son JSON brut, sans perte de données. L'éditeur prévient avant la suppression et indique combien d'actions l'utilisent.

## Éditeur d'actions custom

Un nouvel onglet **Extensions** dans la barre latérale, avec :

- **La liste :** les extensions et leurs actions, plus les boutons nouveau, dupliquer, importer, exporter et supprimer.
- **Le formulaire d'action :** identifiant, libellés, icône, bloquante ou non, passable ou non, comportement en preview.
- **Le constructeur de champs :** ajout, réorganisation et réglages selon le type.
- **L'aperçu en direct :** le vrai formulaire généré et le JSON qu'il produira.
- **Le mode JSON :** édition directe du fichier, comme pour les dialogues.

Renommer un identifiant d'action ou une clé de champ proposera de mettre à jour les dialogues qui l'utilisent, comme le renommage de dialogues actuel.

## Lots de travail

| Lot | Contenu | Fichiers principaux |
|---|---|---|
| **1. Socle** | Format, validation et registre qui fusionne actions de base et extensions | nouveau `src/model/extensions.ts`, `schema.ts`, `project.ts` |
| **2. Utilisation** | Palette, liste et formulaires pour les actions custom, sans éditeur (import JSON seulement) | `Timeline.tsx`, `ActionForms.tsx`, `Fields.tsx` |
| **3. Moteur** | `CustomAction` dans le simulateur et validation selon le schéma (champs requis, types, références) | `sim.ts`, `validate.ts` |
| **4. Fichiers** | Lecture et écriture dans le dossier, export, gestion des conflits | `io.ts`, `App.tsx` |
| **5. Éditeur** | Onglet Extensions complet | nouveau `src/ui/ExtensionsView.tsx` |
| **6. Finitions** | Traductions, README, exemple d'extension | `en.ts`, `README.md`, `public/sample/` |

**Le gros changement technique :** `ACTIONS` et `ACTION_CLASSES` sont aujourd'hui des constantes globales. `actionDef`, `CLEARABLE` et la liste des actions bloquantes de `validate.ts` devront passer par ce registre, sans quoi une action custom bloquante déclencherait de fausses alertes.

## Tests prévus

- Validation du format et refus des conflits.
- Aller-retour import puis export à l'identique.
- Les trois modes de preview.
- Conservation des données quand une extension manque.
- Alertes correctes dans `validate.ts`.

## Choix à confirmer

1. **Portée des extensions :** recommandé **par projet**, pour qu'elles suivent le mod et le dépôt. Il faudra les réimporter dans un autre projet. Une bibliothèque commune au navigateur pourrait venir plus tard.
2. **`registerOverload` :** recommandé de **le laisser pour une version 2**, tout en réservant la place dans le format. Le simulateur l'ignore pour l'instant.
3. **Dessin en preview :** recommandé de **s'en tenir au journal** en version 1. Déclarer des éléments visuels simples (texte, image) serait possible ensuite, mais on se rapprocherait d'un langage de script.

## Hors périmètre

- Génération d'un squelette de classe Java à partir du schéma.
- Effets BBCode custom.

## À corriger dans le mod

Constats faits en préparant ce plan, à traiter côté BlablaLib :

- **`registerCustomAction` renvoie toujours `false`** (`DialogueManager.java:139`). Le nom n'existe pas encore à ce stade, donc `put` renvoie `null` et `put != null` est faux, même en cas de succès.
- **`press_enter` n'est pas enregistrée** dans `registerDefaultActions`.
- **`DialogueStartQuestAction` existe mais n'est pas enregistrée non plus**, et elle ne fait rien pour l'instant. Elle n'est pas prévue dans l'éditeur tant qu'elle n'est pas terminée.
