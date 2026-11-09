// Description de chaque action, d'après les constructeurs Java (pas la doc, qui a plusieurs noms
// de champs périmés). Sert à générer les formulaires et les résumés de la liste.

import type { RawAction } from '../engine/sim';

export type FieldType =
  | 'text'
  | 'multiline'
  | 'number'
  | 'bool'
  | 'select'
  | 'color'
  | 'dialogue'
  | 'speaker'
  | 'texture'
  | 'actionClass'
  | 'json';

export interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
  hint?: string;
  placeholder?: string;
  options?: string[];
  step?: number;
  min?: number;
  max?: number;
  /** Curseur en plus du champ numérique. */
  slider?: boolean;
  /** Le texte peut être une clé de traduction. */
  translatable?: boolean;
  half?: boolean;
}

export type ActionGroup = 'dialogue' | 'visuel' | 'rythme' | 'jeu';

export interface ActionDef {
  id: string;
  shortId: string;
  label: string;
  group: ActionGroup;
  blocking: boolean;
  skippable: boolean;
  description: string;
  fields: FieldDef[];
  defaults: RawAction;
  /** Formulaire spécifique (choix, animations, PNJ). */
  custom?: 'choice' | 'image_move' | 'npc';
}

const percent = (key: 'x' | 'y', label: string): FieldDef => ({
  key,
  label,
  type: 'number',
  step: 1,
  half: true,
  slider: true,
  min: 0,
  max: 100,
  hint: "En % de l'écran (0 à 100). La doc indique 0 à 1, mais le code multiplie par 0,01.",
});

export const ACTIONS: ActionDef[] = [
  {
    id: 'blablalib:message',
    shortId: 'message',
    label: 'Message',
    group: 'dialogue',
    blocking: true,
    skippable: true,
    description: 'Affiche une réplique dans la boîte de dialogue, lettre par lettre.',
    defaults: { action: 'blablalib:message', text: '' },
    fields: [
      { key: 'speaker', label: 'Personnage', type: 'speaker' },
      {
        key: 'text',
        label: 'Texte',
        type: 'multiline',
        translatable: true,
        placeholder: 'Texte brut ou clé de traduction',
        hint: "BBCode accepté. Retour à la ligne automatique à 270 px, aux espaces. La boîte contient 6 lignes.",
      },
    ],
  },
  {
    id: 'blablalib:choice',
    shortId: 'choice',
    label: 'Choix',
    group: 'dialogue',
    blocking: true,
    skippable: false,
    description: 'Propose des boutons. Le choix termine ce dialogue : ce qui suit ne sera jamais joué.',
    defaults: { action: 'blablalib:choice', choices: [{ name: 'Option 1', next: '', save: '' }] },
    fields: [],
    custom: 'choice',
  },
  {
    id: 'blablalib:next_dialogue',
    shortId: 'next_dialogue',
    label: 'Dialogue suivant',
    group: 'dialogue',
    blocking: true,
    skippable: false,
    description: 'Enchaîne sur un autre dialogue dès que le lecteur arrive ici.',
    defaults: { action: 'blablalib:next_dialogue', dialogue: '' },
    fields: [
      {
        key: 'dialogue',
        label: 'Dialogue',
        type: 'dialogue',
        hint: "Le champ s'appelle « dialogue » dans le code, pas « next » comme dans la doc.",
      },
    ],
  },
  {
    id: 'blablalib:text',
    shortId: 'text',
    label: 'Texte libre',
    group: 'visuel',
    blocking: false,
    skippable: true,
    description: "Affiche un texte n'importe où à l'écran, sans bloquer le dialogue.",
    defaults: { action: 'blablalib:text', text: '', x: 50, y: 50, hold_time: 40, alignment: 'center' },
    fields: [
      { key: 'text', label: 'Texte', type: 'text', translatable: true, hint: 'Texte brut ou clé. Pas de BBCode ici.' },
      percent('x', 'Position X'),
      percent('y', 'Position Y'),
      { key: 'alignment', label: 'Alignement', type: 'select', options: ['center', 'left', 'right'], half: true },
      { key: 'scale', label: 'Échelle', type: 'number', step: 0.1, half: true, placeholder: '1' },
      { key: 'color', label: 'Couleur', type: 'color', hint: 'Format #RRGGBBAA ou #RRGGBB.' },
      { key: 'fade_in_time', label: 'Fondu d’entrée', type: 'number', half: true, placeholder: '0', hint: 'En ticks.' },
      { key: 'hold_time', label: 'Durée', type: 'number', half: true, placeholder: '5', hint: 'En ticks.' },
      { key: 'fade_out_time', label: 'Fondu de sortie', type: 'number', half: true, placeholder: '0', hint: 'En ticks.' },
      { key: 'rotation', label: 'Rotation', type: 'number', half: true, placeholder: '0', hint: 'En degrés, autour du début du texte.' },
    ],
  },
  {
    id: 'blablalib:image',
    shortId: 'image',
    label: 'Image',
    group: 'visuel',
    blocking: false,
    skippable: true,
    description: "Affiche une image centrée sur (x, y). Elle reste jusqu'à un clear.",
    defaults: { action: 'blablalib:image', id: 0, image: '', width: 256, height: 256, x: 50, y: 40 },
    fields: [
      { key: 'id', label: 'Identifiant', type: 'number', step: 1, half: true, placeholder: '0', hint: 'Référencé par les animations.' },
      { key: 'alpha', label: 'Opacité', type: 'number', step: 1, half: true, min: 0, max: 255, placeholder: '255', hint: '0 à 255. Masquée à 8 ou moins.' },
      { key: 'image', label: 'Texture', type: 'texture', placeholder: 'mon_pack:textures/gui/image.png' },
      { key: 'width', label: 'Largeur source', type: 'number', step: 1, half: true, hint: 'Taille du fichier. Seul le rapport largeur / hauteur compte pour l’affichage.' },
      { key: 'height', label: 'Hauteur source', type: 'number', step: 1, half: true, hint: "À l'écran : la hauteur vaut la moitié de l'écran × échelle, la largeur suit." },
      percent('x', 'Position X'),
      percent('y', 'Position Y'),
      { key: 'scale', label: 'Échelle', type: 'number', step: 0.1, half: true, placeholder: '1' },
      { key: 'rotation', label: 'Rotation', type: 'number', half: true, placeholder: '0', hint: 'En degrés.' },
    ],
  },
  {
    id: 'blablalib:image_move',
    shortId: 'image_move',
    label: 'Animer une image',
    group: 'visuel',
    blocking: false,
    skippable: true,
    description: 'Anime la position, la rotation, l’échelle ou la couleur d’une image affichée.',
    defaults: { action: 'blablalib:image_move', id: 0 },
    fields: [{ key: 'id', label: 'Image', type: 'number', step: 1, half: true, placeholder: '0', hint: "L'identifiant de l'image à animer." }],
    custom: 'image_move',
  },
  {
    id: 'blablalib:fade',
    shortId: 'fade',
    label: 'Fondu',
    group: 'visuel',
    blocking: false,
    skippable: true,
    description: 'Recouvre tout l’écran avec une couleur animée. Reste affiché jusqu’à un clear.',
    defaults: { action: 'blablalib:fade', from: '#00000000', to: '#000000FF', time: 20 },
    fields: [
      { key: 'from', label: 'De', type: 'color', hint: 'Format #RRGGBBAA, #RRGGBB ou un nom (black, white...).' },
      { key: 'to', label: 'À', type: 'color' },
      { key: 'time', label: 'Durée', type: 'number', half: true, placeholder: '0', hint: 'En ticks (20 ticks = 1 seconde).' },
    ],
  },
  {
    id: 'blablalib:clear',
    shortId: 'clear',
    label: 'Effacer',
    group: 'visuel',
    blocking: true,
    skippable: true,
    description: 'Retire les éléments à l’écran : tous, ou un seul type.',
    defaults: { action: 'blablalib:clear' },
    fields: [{ key: 'cleared_actions', label: 'Type à effacer', type: 'actionClass', hint: 'Vide = tout effacer. Le champ s’appelle « cleared_actions », avec un s.' }],
  },
  {
    id: 'blablalib:wait',
    shortId: 'wait',
    label: 'Attendre',
    group: 'rythme',
    blocking: true,
    skippable: true,
    description: 'Met le dialogue en pause.',
    defaults: { action: 'blablalib:wait', time: 20 },
    fields: [{ key: 'time', label: 'Durée', type: 'number', half: true, placeholder: '0', hint: 'En ticks (20 ticks = 1 seconde).' }],
  },
  {
    id: 'blablalib:timings',
    shortId: 'timings',
    label: 'Vitesse du texte',
    group: 'rythme',
    blocking: true,
    skippable: false,
    description: 'Change la vitesse de frappe des messages suivants.',
    defaults: { action: 'blablalib:timings', speed: 2 },
    fields: [
      { key: 'speed', label: 'Ticks par lettre', type: 'number', step: 1, half: true, min: 1, placeholder: '1' },
      { key: 'wait', label: 'Pause ponctuation', type: 'number', step: 1, half: true, placeholder: '8', hint: 'Après . ! ou ? : pause de (ticks par lettre × cette valeur) ticks.' },
    ],
  },
  {
    id: 'blablalib:press_enter',
    shortId: 'press_enter',
    label: 'Attendre Entrée',
    group: 'rythme',
    blocking: true,
    skippable: false,
    description: 'Met le dialogue en pause jusqu’à la touche Entrée. Ni le clic, ni Espace, ni Échap ne la passent, et rien ne l’indique à l’écran.',
    defaults: { action: 'blablalib:press_enter' },
    fields: [],
  },
  {
    id: 'blablalib:sound',
    shortId: 'sound',
    label: 'Son',
    group: 'jeu',
    blocking: false,
    skippable: true,
    description: 'Joue un son. La preview l’indique dans le journal sans le jouer.',
    defaults: { action: 'blablalib:sound', sound: 'minecraft:ui.button.click' },
    fields: [
      { key: 'sound', label: 'Son', type: 'text', placeholder: 'minecraft:entity.wolf.whine' },
      { key: 'pitch', label: 'Hauteur', type: 'number', step: 0.1, half: true, placeholder: '1' },
      { key: 'volume', label: 'Volume', type: 'number', step: 0.1, half: true, placeholder: '1' },
    ],
  },
  {
    id: 'blablalib:command',
    shortId: 'command',
    label: 'Commande',
    group: 'jeu',
    blocking: true,
    skippable: false,
    description: 'Exécute une commande sur le serveur, à la position du joueur.',
    defaults: { action: 'blablalib:command', command: '' },
    fields: [{ key: 'command', label: 'Commande', type: 'text', placeholder: 'say Bonjour <PLAYER>', hint: 'Sans / initial. <PLAYER> est remplacé par le nom du joueur.' }],
  },
  {
    id: 'blablalib:npc',
    shortId: 'npc',
    label: 'Variable de PNJ',
    group: 'jeu',
    blocking: true,
    skippable: false,
    description: "Modifie une variable de l'état courant d'un PNJ.",
    defaults: { action: 'blablalib:npc', npc: 0, variable: '', type: 'bool', value: true },
    fields: [],
    custom: 'npc',
  },
  {
    id: 'blablalib:quest_state',
    shortId: 'quest_state',
    label: 'État de quête',
    group: 'jeu',
    blocking: true,
    skippable: false,
    description: "Change l'état d'une quête, ou d'une de ses tâches.",
    defaults: { action: 'blablalib:quest_state', quest: '', state: '' },
    fields: [
      { key: 'quest', label: 'Quête', type: 'text', placeholder: 'mon_pack:ma_quete' },
      { key: 'task', label: 'Tâche', type: 'text', placeholder: 'Optionnel', hint: 'Si renseignée, cible la tâche et non la quête.' },
      { key: 'state', label: 'Nouvel état', type: 'text' },
    ],
  },
  {
    id: 'blablalib:play_cutscene',
    shortId: 'play_cutscene',
    label: 'Cinématique',
    group: 'jeu',
    blocking: false,
    skippable: false,
    description: 'Lance une cinématique CutsceneLib. Si elle attend la fin, l’action devient bloquante. La preview simule sa durée.',
    defaults: { action: 'blablalib:play_cutscene', cutscene: '' },
    fields: [
      { key: 'cutscene', label: 'Cinématique', type: 'text', placeholder: 'mon_pack:intro' },
      { key: 'wait_for_end', label: 'Attendre la fin', type: 'bool' },
    ],
  },
];

/** Actions reconnues par nom brut dans refreshActions, avec ou sans namespace. */
export const RAW_ACTIONS: { id: string; label: string; description: string }[] = [
  { id: 'hide_ui', label: 'Masquer le voile', description: 'Retire le dégradé sombre de l’écran de dialogue.' },
  { id: 'show_ui', label: 'Afficher le voile', description: 'Remet le dégradé sombre.' },
];

/** Anciens noms encore acceptés par le mod. */
export const ALIASES: Record<string, string> = {
  'blablalib:change_set': 'blablalib:next_dialogue',
  'blablalib:credit': 'blablalib:text',
};

/** Noms de la documentation que le code n'enregistre pas. */
export const DOC_NAMES: Record<string, string> = {
  'blablalib:move_image': 'blablalib:image_move',
  'blablalib:next': 'blablalib:next_dialogue',
  'blablalib:execute_command': 'blablalib:command',
};

export const GROUP_LABELS: Record<ActionGroup, string> = {
  dialogue: 'Dialogue',
  visuel: 'Visuel',
  rythme: 'Rythme',
  jeu: 'Jeu',
};

export function actionDef(raw: RawAction): ActionDef | undefined {
  const name = String(raw.action ?? '');
  const normalized = ALIASES[name] ?? name;
  return ACTIONS.find((a) => a.id === normalized);
}

export const CLEARABLE = ACTIONS.filter((a) => !a.blocking || a.id === 'blablalib:message').map((a) => a.id);
