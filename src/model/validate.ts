// Vérifications tirées du code du mod (BlablaLib 2.0.2, LibLib 0.2.2). Chaque message décrit ce qui se
// passera réellement en jeu. Quand un comportement change dans le mod, l'alerte doit suivre.

import { flattenBBCode, layoutChars } from '../engine/bbcode';
import { colorFromString } from '../engine/color';
import { EASINGS } from '../engine/easing';
import { textWidth } from '../engine/font';
import { ACTION_CLASSES, MESSAGE_TEXT_WIDTH, parseResourceLocation, type RawAction } from '../engine/sim';
import { t } from '../i18n';
import { DOC_NAMES } from './schema';
import {
  allDialogueIds,
  allSpeakers,
  dialogueId,
  findDialogue,
  sortedFiles,
  translate,
  type ActionEntry,
  type DialogueEntry,
  type DialogueFile,
  type Project,
} from './project';

export type Severity = 'error' | 'warning' | 'info';

export interface Problem {
  severity: Severity;
  fileUid: string;
  dialogueUid?: string;
  actionUid?: string;
  message: string;
  fix?: { label: string; apply: (raw: RawAction) => RawAction };
}

/** Largeur disponible entre le début du texte (box + 10) et le bord droit de la boîte. */
export const MESSAGE_MAX_WIDTH = 290;
export const MESSAGE_MAX_LINES = 6;

/** Largeur de chaque ligne une fois le texte coupé comme en jeu. */
export const messageLines = (text: string) => layoutChars(flattenBBCode(text), MESSAGE_TEXT_WIDTH).lines;

const isSet = (v: unknown) => v !== undefined && v !== null && v !== '';
const looksLikeFraction = (x: unknown, y: unknown) =>
  typeof x === 'number' && typeof y === 'number' && x <= 1 && y <= 1 && (x > 0 || y > 0);

const BLOCKING_ACTIONS = [
  'blablalib:message',
  'blablalib:wait',
  'blablalib:choice',
  'blablalib:clear',
  'blablalib:command',
  'blablalib:timings',
  'blablalib:next_dialogue',
  'blablalib:change_set',
  'blablalib:npc',
  'blablalib:quest_state',
  'blablalib:press_enter',
];

function isBlocking(raw: RawAction): boolean {
  const id = parseResourceLocation(String(raw.action));
  if (id === 'blablalib:play_cutscene') return raw.wait_for_end === true;
  return !!id && BLOCKING_ACTIONS.includes(id);
}

/** Message d'erreur si la couleur n'est pas reconnue par Color.fromString. */
function colorProblem(value: unknown, field: string): string | null {
  if (typeof value !== 'string' || colorFromString(value)) return null;
  return /^[0-9a-fA-F]{6,8}$/.test(value)
    ? t("{field} : « {value} » sans # n'est pas reconnu, le mod le remplace par sa couleur par défaut.", { field, value })
    : t('{field} : couleur « {value} » invalide. Formats acceptés : #RRGGBBAA, #RRGGBB, white, black, transparent, red, green, blue.', { field, value });
}

interface Ctx {
  project: Project;
  file: DialogueFile;
  dialogue: DialogueEntry;
  locale: string;
  speakerIds: Set<string>;
  textures: Set<string>;
  add: (severity: Severity, entry: ActionEntry | null, message: string, fix?: Problem['fix']) => void;
}

function checkMessage(ctx: Ctx, e: ActionEntry) {
  const o = e.raw;
  if (isSet(o.speaker)) {
    const id = parseResourceLocation(String(o.speaker));
    if (!id || !ctx.speakerIds.has(id)) {
      ctx.add('warning', e, t('Personnage « {speaker} » introuvable : le nom restera vide et le texte sans son.', { speaker: String(o.speaker) }));
    }
  } else {
    ctx.add('warning', e, t('Sans personnage, le message plante sur serveur dédié : le StreamCodec encode speakerId, qui est null.'));
  }
  if (!isSet(o.text)) {
    ctx.add('info', e, t('Message sans texte : le mod le passe automatiquement.'));
    return;
  }
  const text = translate(ctx.project, ctx.locale, String(o.text));
  if (flattenBBCode(text).length === 0) {
    ctx.add('info', e, t('Le texte ne contient que des balises : la boîte reste vide et attend un clic.'));
    return;
  }
  const lines = messageLines(text);
  const widest = Math.max(...lines);
  if (widest > MESSAGE_MAX_WIDTH) {
    ctx.add('warning', e, t("Une ligne fait {n} px et la boîte s'arrête à {max} px. Le retour automatique ne coupe qu'aux espaces : un mot trop long déborde.", { n: widest, max: MESSAGE_MAX_WIDTH }));
  }
  if (lines.length > MESSAGE_MAX_LINES) ctx.add('warning', e, t('{n} lignes : le texte sort de la boîte au-delà de {max}.', { n: lines.length, max: MESSAGE_MAX_LINES }));
  if (/\[(?:color|gradient|shake|wave|tornado|rainbow)=/i.test(text)) {
    ctx.add('warning', e, t('Syntaxe [balise=valeur] non reconnue : elle s’affichera en clair. Écrivez [color value=#FF0000] ou [gradient from=… to=…].'));
  }
}

function checkChoice(ctx: Ctx, e: ActionEntry, index: number) {
  const o = e.raw;
  const hasLegacyKey = Object.keys(o).some((k) => /^(option|next|save|action)[12]$/.test(k));
  const legacyComplete = ['option1', 'next1', 'save1', 'action1', 'option2', 'next2', 'save2', 'action2'].every((k) => k in o);
  const choices = Array.isArray(o.choices) ? (o.choices as RawAction[]) : [];
  const valid = choices.filter((c) => c && typeof c === 'object' && 'name' in c);

  if (hasLegacyKey && !legacyComplete) ctx.add('error', e, t('Ancien format incomplet : il faut option, next, save et action pour les options 1 et 2.'));
  if (valid.length === 0 && !legacyComplete) {
    ctx.add('error', e, t('Aucune option valide : aucun bouton et le choix ne se passe pas avec Échap. Le joueur reste bloqué.'));
  }
  valid.forEach((c, i) => {
    const label = t('Option {n}', { n: i + 1 });
    if (!isSet(c.next) || !isSet(c.save)) {
      ctx.add('warning', e, t('{label} : il faut « next » ET « save », sinon le clic ferme simplement le dialogue. La doc présente « save » comme optionnel, mais handleButtonClick exige les deux.', { label }));
    }
    if (isSet(c.next) && !findDialogue(ctx.project, String(c.next))) {
      ctx.add('warning', e, t("{label} : le dialogue « {id} » n'existe pas dans ce projet.", { label, id: String(c.next) }));
    }
    if (textWidth(translate(ctx.project, ctx.locale, String(c.name))) + 10 > 142) {
      ctx.add('warning', e, t('{label} : libellé trop long, il sera coupé à droite (le conteneur fait 142 px).', { label }));
    }
  });
  if (index < ctx.dialogue.actions.length - 1) {
    ctx.add('warning', e, t('Le choix termine le dialogue : les actions suivantes ne seront jamais jouées.'));
  }
}

function checkImageMove(ctx: Ctx, e: ActionEntry, index: number) {
  const o = e.raw;
  const previous = ctx.dialogue.actions.slice(0, index);
  const shown = previous.some((p) => p.raw.action === 'blablalib:image' && (p.raw.id ?? 0) === (o.id ?? 0));
  if (!shown) ctx.add('warning', e, t("Aucune image d'identifiant {id} avant cette action : l'animation ne fera rien.", { id: String(o.id ?? 0) }));

  const tracks: [string, string, string, string][] = [
    ['position', 'x_start', 'x_end', 'Position X'],
    ['position', 'y_start', 'y_end', 'Position Y'],
    ['rotation', 'from', 'to', 'Rotation'],
    ['scale', 'from', 'to', 'Échelle'],
    ['color', 'from', 'to', 'Couleur'],
  ];
  for (const [group, a, b, key] of tracks) {
    const g = o[group] as RawAction | undefined;
    if (!g) continue;
    const label = t(key);
    if ((a in g) !== (b in g)) ctx.add('warning', e, t('{label} : il faut les deux valeurs (début et fin), sinon cette animation est ignorée.', { label }));
    if (a in g && b in g && !g.time) ctx.add('warning', e, t('{label} : durée à 0, le calcul divise par zéro et le résultat est imprévisible.', { label }));
    if (typeof g.easing === 'string' && !(g.easing in EASINGS)) {
      ctx.add('warning', e, t('{label} : easing « {easing} » inconnu, le mod utilise linear à la place.', { label, easing: g.easing }));
    }
  }
  const color = o.color as RawAction | undefined;
  for (const k of ['from', 'to'] as const) {
    const message = color ? colorProblem(color[k], t('Couleur {k}', { k })) : null;
    if (message) ctx.add('warning', e, `${message} ${t('Cette animation est ignorée.')}`);
  }
}

function checkAction(ctx: Ctx, e: ActionEntry, index: number) {
  const o = e.raw;
  const last = index === ctx.dialogue.actions.length - 1;

  if (!('action' in o)) {
    ctx.add('warning', e, t('Objet sans champ « action » : le mod l’ignore.'));
    return;
  }
  const name = String(o.action);
  const id = parseResourceLocation(name);

  if (DOC_NAMES[name]) {
    const target = DOC_NAMES[name];
    ctx.add('error', e, t("« {name} » vient de la doc mais n'existe pas dans le code : l'action ne fera rien. Le vrai nom est « {target} ».", { name, target }), {
      label: t('Renommer en {name}', { name: target.split(':')[1] }),
      apply: (r) => {
        const out: RawAction = { ...r, action: target };
        if (name === 'blablalib:next' && 'next' in out) {
          out.dialogue = out.next;
          delete out.next;
        }
        return out;
      },
    });
    return;
  }
  if (['hide_ui', 'show_ui', 'blablalib:hide_ui', 'blablalib:show_ui'].includes(name)) return;
  if (!id || !ACTION_CLASSES[id]) {
    ctx.add('info', e, t("Action « {name} » inconnue de BlablaLib : ignorée, sauf si un autre mod l'enregistre (registerCustomAction). La preview la passe.", { name }));
    return;
  }

  const nextBlocking = () => ctx.dialogue.actions.slice(index + 1).find((a) => isBlocking(a.raw));

  if (last && !isBlocking(o)) {
    ctx.add('info', e, t('Dernière action non bloquante : le dialogue se ferme au tick suivant. Terminez par « Attendre » ou « Attendre Entrée » pour la laisser visible.'));
  }

  switch (id) {
    case 'blablalib:message':
      checkMessage(ctx, e);
      break;
    case 'blablalib:choice':
      checkChoice(ctx, e, index);
      break;
    case 'blablalib:next_dialogue':
    case 'blablalib:change_set': {
      const target = o.dialogue ?? o.set;
      if ('next' in o && !isSet(target)) {
        ctx.add('error', e, t('Le champ s’appelle « dialogue », pas « next » : le joueur reste bloqué.'), {
          label: t('Renommer le champ'),
          apply: (r) => {
            const out: RawAction = { ...r, dialogue: r.next };
            delete out.next;
            return out;
          },
        });
      } else if (!isSet(target)) {
        ctx.add('error', e, t('Aucun dialogue cible : le joueur reste bloqué, même Échap ne passe pas cette action.'));
      } else if (!findDialogue(ctx.project, String(target))) {
        ctx.add('warning', e, t("Le dialogue « {id} » n'est pas dans ce projet. S'il n'existe pas non plus en jeu, le joueur reste bloqué.", { id: String(target) }));
      }
      if (!last) ctx.add('warning', e, t('Les actions après cet enchaînement ne seront jamais jouées.'));
      break;
    }
    case 'blablalib:text':
    case 'blablalib:credit': {
      if (looksLikeFraction(o.x, o.y)) {
        ctx.add('warning', e, t('x et y sont en %, pas entre 0 et 1 comme dans la doc : le texte sera collé en haut à gauche.'), {
          label: t('Convertir en %'),
          apply: (r) => ({ ...r, x: Number(r.x) * 100, y: Number(r.y) * 100 }),
        });
      }
      if (typeof o.color === 'string' && !colorFromString(o.color)) {
        ctx.add('error', e, t('Couleur « {color} » invalide : le jeu plante au dessin (color est null).', { color: o.color }));
      }
      if (o.alignment === 'left' || o.alignment === 'right') {
        ctx.add('warning', e, t('Sur serveur dédié, l’alignement n’est pas transmis (StreamCodec) : le texte sera centré.'));
      }
      break;
    }
    case 'blablalib:image': {
      if (!isSet(o.image)) ctx.add('error', e, t('Aucune texture : le jeu plante au dessin.'));
      else if (!parseResourceLocation(String(o.image))) ctx.add('error', e, t('Texture « {image} » : identifiant invalide (minuscules uniquement).', { image: String(o.image) }));
      else if (!ctx.textures.has(parseResourceLocation(String(o.image))!)) ctx.add('info', e, t('Texture « {image} » absente du projet : la preview affiche le damier de texture manquante.', { image: String(o.image) }));
      if (!o.width || !o.height) ctx.add('warning', e, t('Largeur et hauteur sont nécessaires : à 0, rien ne s’affiche correctement.'));
      if (looksLikeFraction(o.x, o.y)) {
        ctx.add('warning', e, t('x et y sont en %, pas entre 0 et 1 comme dans la doc.'), {
          label: t('Convertir en %'),
          apply: (r) => ({ ...r, x: Number(r.x) * 100, y: Number(r.y) * 100 }),
        });
      }
      if ('fade_in_time' in o) {
        ctx.add('info', e, t('« fade_in_time » n’existe pas pour les images : ignoré. Utilisez une animation de couleur.'), {
          label: t('Retirer le champ'),
          apply: (r) => {
            const out = { ...r };
            delete out.fade_in_time;
            return out;
          },
        });
      }
      break;
    }
    case 'blablalib:image_move':
      checkImageMove(ctx, e, index);
      break;
    case 'blablalib:fade': {
      if (!('from' in o) || !('to' in o)) ctx.add('error', e, t('Il faut « from » et « to » : sinon le jeu plante au dessin (couleur null).'));
      for (const k of ['from', 'to'] as const) {
        const message = colorProblem(o[k], t('Fondu {k}', { k }));
        if (message) ctx.add('warning', e, message);
      }
      break;
    }
    case 'blablalib:clear': {
      if ('cleared_action' in o && !('cleared_actions' in o)) {
        ctx.add('error', e, t('Le champ s’appelle « cleared_actions » (avec un s). Avec ce nom, tout est effacé.'), {
          label: t('Renommer le champ'),
          apply: (r) => {
            const out: RawAction = { ...r, cleared_actions: r.cleared_action };
            delete out.cleared_action;
            return out;
          },
        });
      }
      if (isSet(o.cleared_actions)) {
        const cls = parseResourceLocation(String(o.cleared_actions));
        if (!cls || !ACTION_CLASSES[cls]) ctx.add('warning', e, t('Type « {type} » inconnu : rien ne sera effacé.', { type: String(o.cleared_actions) }));
      }
      break;
    }
    case 'blablalib:press_enter':
      ctx.add('warning', e, t('DialoguePressEnter n’est pas enregistrée dans registerDefaultActions (BlablaLib 2.0.2) : en jeu, cette action reste inconnue et ne bloque rien. La preview la joue comme si elle l’était.'));
      break;
    case 'blablalib:sound':
      if (!isSet(o.sound)) ctx.add('error', e, t('Aucun son : le jeu plante (ResourceLocation.tryParse(null)).'));
      break;
    case 'blablalib:command':
      if (!isSet(o.command)) ctx.add('warning', e, t('Commande vide.'));
      if (typeof o.command === 'string' && o.command.startsWith('/')) {
        ctx.add('warning', e, t('Retirez le / initial : la commande est insérée après « execute … run ».'), {
          label: t('Retirer le /'),
          apply: (r) => ({ ...r, command: String(r.command).replace(/^\/+/, '') }),
        });
      }
      break;
    case 'blablalib:npc': {
      const missing = ['variable', 'type', 'value'].filter((k) => !(k in o));
      if (missing.length) ctx.add('error', e, t("Champs manquants ({fields}) : l'action est ignorée sans message visible.", { fields: missing.join(', ') }));
      break;
    }
    case 'blablalib:quest_state':
      if (!isSet(o.state)) ctx.add('error', e, t('Sans « state », le serveur plante (newState.isEmpty() sur null).'));
      if (!isSet(o.quest)) ctx.add('warning', e, t('Sans quête, cette action ne fait rien.'));
      break;
    case 'blablalib:play_cutscene': {
      if (!isSet(o.cutscene)) ctx.add('error', e, t('Aucune cinématique : le jeu plante.'));
      if (o.wait_for_end !== true && nextBlocking()?.raw.action === 'blablalib:message') {
        ctx.add('warning', e, t('Sans « attendre la fin », le dialogue avance au tick suivant et saute le message qui suit (queueAdvanceDialogue dans setup).'));
      }
      break;
    }
  }
}

export function validateProject(project: Project, textures: Set<string>, locale: string): Problem[] {
  const problems: Problem[] = [];
  const speakerIds = new Set(allSpeakers(project).map((s) => parseResourceLocation(String(s.id)) ?? ''));
  const ids = allDialogueIds(project);
  const dupes = new Set(ids.filter((id, i) => ids.indexOf(id) !== i));

  for (const file of sortedFiles(project)) {
    const seenSpeakers = new Set<string>();
    file.speakers.forEach((s) => {
      const add = (severity: Severity, message: string) => problems.push({ severity, fileUid: file.uid, message: t('Personnage {id} : {message}', { id: String(s.id ?? '?'), message }) });
      const missing = ['id', 'name', 'color', 'sounds'].filter((k) => !(k in s));
      if (missing.length) add('error', t('champs manquants ({fields}). Tout le fichier {path} ne se chargera pas.', { fields: missing.join(', '), path: file.path }));
      else if (!parseResourceLocation(String(s.id))) add('warning', t('identifiant invalide, personnage ignoré.'));
      const message = colorProblem(s.color, t('couleur'));
      if (message) add('warning', message);
      if (seenSpeakers.has(String(s.id))) add('warning', t('identifiant en double dans le fichier.'));
      seenSpeakers.add(String(s.id));
    });
    for (const key of Object.keys(file.extras)) {
      problems.push({ severity: 'info', fileUid: file.uid, message: t("Clé « {key} » : ce n'est pas un tableau, le mod l'ignore. Conservée telle quelle.", { key }) });
    }
    for (const dialogue of file.dialogues) {
      const id = dialogueId(file, dialogue);
      const add: Ctx['add'] = (severity, entry, message, fix) =>
        problems.push({ severity, fileUid: file.uid, dialogueUid: dialogue.uid, actionUid: entry?.uid, message, fix });

      if (!/^[a-z0-9/._-]+$/.test(dialogue.key)) add('error', null, t('Nom « {key} » invalide : minuscules, chiffres et / . _ - uniquement. Ce dialogue ne sera pas chargé.', { key: dialogue.key }));
      if (dupes.has(id)) add('warning', null, t("« {id} » existe dans plusieurs fichiers : le dernier fichier (ordre alphabétique) l'emporte.", { id }));
      if (dialogue.actions.length === 0) add('info', null, t('Dialogue vide : l’écran se ferme aussitôt.'));

      const ctx: Ctx = { project, file, dialogue, locale, speakerIds, textures, add };
      dialogue.actions.forEach((entry, i) => checkAction(ctx, entry, i));
    }
  }
  const rank: Record<Severity, number> = { error: 0, warning: 1, info: 2 };
  return problems.sort((a, b) => rank[a.severity] - rank[b.severity]);
}
