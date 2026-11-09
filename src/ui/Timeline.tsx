import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowUpDown,
  CornerDownLeft,
  Ban,
  Braces,
  Clapperboard,
  Clock,
  Copy,
  Droplets,
  Eraser,
  EyeOff,
  Eye,
  GitBranch,
  GripVertical,
  Image as ImageIcon,
  Info,
  ListChecks,
  MessageSquare,
  Move,
  Play,
  Plus,
  ScrollText,
  Terminal,
  Trash2,
  Type,
  UserCog,
  Volume2,
  Wand2,
  XCircle,
  type LucideIcon,
} from 'lucide-react';
import { parseResourceLocation, type RawAction } from '../engine/sim';
import { getLang, t } from '../i18n';
import { translate, uid, type ActionEntry, type DialogueEntry, type DialogueFile } from '../model/project';
import { ACTIONS, actionDef, GROUP_LABELS, RAW_ACTIONS, type ActionGroup } from '../model/schema';
import type { Problem, Severity } from '../model/validate';
import { ActionForm } from './ActionForms';
import { useEditor } from './context';

const ICONS: Record<string, LucideIcon> = {
  message: MessageSquare,
  choice: GitBranch,
  next_dialogue: ArrowUpDown,
  text: Type,
  image: ImageIcon,
  image_move: Move,
  fade: Droplets,
  clear: Eraser,
  wait: Clock,
  timings: Wand2,
  sound: Volume2,
  command: Terminal,
  npc: UserCog,
  quest_state: ListChecks,
  play_cutscene: Clapperboard,
  press_enter: CornerDownLeft,
  hide_ui: EyeOff,
  show_ui: Eye,
};

const SEVERITY_ICON: Record<Severity, LucideIcon> = { error: XCircle, warning: AlertTriangle, info: Info };

const seconds = (ticks: unknown) => (typeof ticks === 'number' ? `${ticks} ticks (${(ticks / 20).toLocaleString(getLang(), { maximumFractionDigits: 2 })} s)` : '0 tick');
const clip = (s: string, n = 90) => (s.length > n ? `${s.slice(0, n)}…` : s);

function useSummary() {
  const { project, locale, speakers } = useEditor();
  return (o: RawAction): { speaker?: { name: string; color: string }; text: string } => {
    const def = actionDef(o);
    switch (def?.shortId) {
      case 'message': {
        const sp = speakers.find((s) => parseResourceLocation(String(s.id)) === parseResourceLocation(String(o.speaker ?? '')));
        const text = translate(project, locale, String(o.text ?? '')).replace(/\[\/?\w+(?:\s+\w+=\S+)*]/g, '').replace(/\n/g, ' ⏎ ');
        return {
          speaker: sp ? { name: translate(project, locale, sp.name), color: speakerCss(sp.color) } : undefined,
          text: clip(text) || t('(vide)'),
        };
      }
      case 'choice': {
        const list = (Array.isArray(o.choices) ? o.choices : []) as RawAction[];
        const names = list.length ? list.map((c) => String(c.name)) : [o.option1, o.option2].filter(Boolean).map(String);
        return { text: clip(names.map((n) => translate(project, locale, n)).join(' · ')) || t('(aucune option)') };
      }
      case 'next_dialogue':
        return { text: `→ ${o.dialogue ?? o.set ?? '?'}` };
      case 'text':
        return { text: clip(translate(project, locale, String(o.text ?? ''))) || t('(vide)') };
      case 'image':
        return { text: `#${o.id ?? 0} · ${o.image ?? t('(aucune)')}` };
      case 'image_move': {
        const tracks = [['position', t('position')], ['rotation', t('rotation')], ['scale', t('échelle')], ['color', t('couleur')]].filter(([k]) => o[k]).map(([, l]) => l);
        return { text: `#${o.id ?? 0} · ${tracks.join(', ') || t('aucune piste')}` };
      }
      case 'fade':
        return { text: `${o.from ?? '?'} → ${o.to ?? '?'} · ${seconds(o.time)}` };
      case 'clear':
        return { text: o.cleared_actions ? String(o.cleared_actions) : t('tout') };
      case 'wait':
        return { text: seconds(o.time) };
      case 'timings':
        return { text: t('{n} tick(s) par lettre', { n: String(o.speed ?? 1) }) };
      case 'press_enter':
        return { text: t('Touche Entrée uniquement') };
      case 'sound':
        return { text: String(o.sound ?? t('(aucun)')) };
      case 'command':
        return { text: `/${o.command ?? ''}` };
      case 'npc':
        return { text: `#${o.npc ?? -1} · ${o.variable ?? '?'} = ${JSON.stringify(o.value)}` };
      case 'quest_state':
        return { text: `${o.quest ?? '?'}${o.task ? ` / ${o.task}` : ''} → ${o.state ?? '?'}` };
      case 'play_cutscene':
        return { text: `${o.cutscene ?? '?'}${o.wait_for_end ? ` · ${t('attend la fin')}` : ''}` };
    }
    const rawDef = RAW_ACTIONS.find((r) => r.id === String(o.action).replace('blablalib:', ''));
    return { text: rawDef ? t(rawDef.description) : t('Action inconnue, ignorée par BlablaLib') };
  };
}

function speakerCss(color: string): string {
  const m = /^#([0-9a-fA-F]{2})?([0-9a-fA-F]{6})$/.exec(color ?? '');
  return m ? `#${m[2]}` : 'inherit';
}

interface Props {
  file: DialogueFile;
  dialogue: DialogueEntry;
  selectedUid: string | null;
  onSelect: (uid: string | null) => void;
  problems: Problem[];
  playing: { active: Set<number>; current: number } | null;
  onPlayFrom: (index: number) => void;
  mutateDialogue: (fn: (d: DialogueEntry) => void, coalesce?: string) => void;
}

export function Timeline({ dialogue, selectedUid, onSelect, problems, playing, onPlayFrom, mutateDialogue }: Props) {
  const [paletteAt, setPaletteAt] = useState<number | null>(null);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dropAt, setDropAt] = useState<number | null>(null);
  const [mode, setMode] = useState<'form' | 'json'>('form');
  const listRef = useRef<HTMLDivElement>(null);
  const summary = useSummary();

  const problemsByAction = useMemo(() => {
    const map = new Map<string, Problem[]>();
    for (const p of problems) if (p.actionUid) map.set(p.actionUid, [...(map.get(p.actionUid) ?? []), p]);
    return map;
  }, [problems]);
  const dialogueProblems = problems.filter((p) => !p.actionUid);

  useEffect(() => {
    if (!selectedUid) return;
    listRef.current?.querySelector(`[data-uid="${selectedUid}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [selectedUid]);

  const insert = (at: number, raw: RawAction) => {
    const entry: ActionEntry = { uid: uid(), raw: structuredClone(raw) };
    mutateDialogue((d) => void d.actions.splice(at, 0, entry));
    onSelect(entry.uid);
    setPaletteAt(null);
  };
  const remove = (i: number) => {
    mutateDialogue((d) => void d.actions.splice(i, 1));
    if (dialogue.actions[i].uid === selectedUid) onSelect(null);
  };
  const duplicate = (i: number) => {
    const entry: ActionEntry = { uid: uid(), raw: structuredClone(dialogue.actions[i].raw) };
    mutateDialogue((d) => void d.actions.splice(i + 1, 0, entry));
    onSelect(entry.uid);
  };
  const move = (from: number, to: number) => {
    if (from === to || to < 0 || to > dialogue.actions.length) return;
    mutateDialogue((d) => {
      const [a] = d.actions.splice(from, 1);
      d.actions.splice(to > from ? to - 1 : to, 0, a);
    });
  };
  const selectedIndex = dialogue.actions.findIndex((a) => a.uid === selectedUid);

  return (
    <div className="timeline">
      <div className="timeline-head">
        <h2 className="mono">{dialogue.key}</h2>
        <span className="muted">{dialogue.actions.length > 1 ? t('{n} actions', { n: dialogue.actions.length }) : t('{n} action', { n: dialogue.actions.length })}</span>
        <span className="spacer" />
        <div className="segmented" role="tablist">
          <button role="tab" aria-selected={mode === 'form'} className={mode === 'form' ? 'on' : ''} onClick={() => setMode('form')}>
            <ScrollText size={14} /> {t('Formulaire')}
          </button>
          <button role="tab" aria-selected={mode === 'json'} className={mode === 'json' ? 'on' : ''} onClick={() => setMode('json')}>
            <Braces size={14} /> JSON
          </button>
        </div>
      </div>

      {dialogueProblems.map((p, i) => (
        <ProblemRow key={i} problem={p} />
      ))}

      {mode === 'json' ? (
        <RawJson dialogue={dialogue} mutateDialogue={mutateDialogue} />
      ) : (
        <div className="action-list" ref={listRef}>
          {dialogue.actions.map((entry, i) => {
            const o = entry.raw;
            const def = actionDef(o);
            const short = def?.shortId ?? (typeof o.action === 'string' ? o.action : '');
            const Icon = ICONS[short.replace('blablalib:', '')] ?? Ban;
            const blocking = def?.id === 'blablalib:play_cutscene' ? o.wait_for_end === true : def?.blocking;
            const selected = entry.uid === selectedUid;
            const s = summary(o);
            const ps = problemsByAction.get(entry.uid) ?? [];
            const worst = ps[0]?.severity;
            const isActive = playing?.active.has(i);
            const isCurrent = playing?.current === i;
            return (
              <div
                key={entry.uid}
                data-uid={entry.uid}
                className={[
                  'action',
                  `group-${def?.group ?? 'none'}`,
                  selected ? 'selected' : '',
                  isCurrent ? 'current' : isActive ? 'active' : '',
                  dropAt === i ? 'drop-before' : '',
                  dragFrom === i ? 'dragging' : '',
                ].join(' ')}
                onDragOver={(e) => {
                  if (dragFrom === null) return;
                  e.preventDefault();
                  const box = e.currentTarget.getBoundingClientRect();
                  setDropAt(e.clientY < box.top + box.height / 2 ? i : i + 1);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  if (dragFrom !== null && dropAt !== null) move(dragFrom, dropAt);
                  setDragFrom(null);
                  setDropAt(null);
                }}
              >
                <div className="action-row" onClick={() => onSelect(selected ? null : entry.uid)}>
                  <span
                    className="grip"
                    draggable
                    title={t('Glisser pour déplacer')}
                    onClick={(e) => e.stopPropagation()}
                    onDragStart={(e) => {
                      setDragFrom(i);
                      e.dataTransfer.effectAllowed = 'move';
                      const card = e.currentTarget.closest('.action');
                      if (card) e.dataTransfer.setDragImage(card, 12, 12);
                    }}
                    onDragEnd={() => {
                      setDragFrom(null);
                      setDropAt(null);
                    }}
                  >
                    <GripVertical size={14} />
                  </span>
                  <span className="index">{i + 1}</span>
                  <span className="action-icon">
                    <Icon size={14} />
                  </span>
                  <span className="action-main">
                    <span className="action-label">
                      {t(def?.label ?? RAW_ACTIONS.find((r) => r.id === short.replace('blablalib:', ''))?.label ?? '') || String(o.action ?? t('Sans action'))}
                      {s.speaker && (
                        <span className="speaker-name" style={{ color: s.speaker.color }}>
                          {s.speaker.name}
                        </span>
                      )}
                    </span>
                    <span className="action-summary">{s.text}</span>
                  </span>
                  {worst && <SeverityDot severity={worst} count={ps.length} />}
                  <span className="row-tools" onClick={(e) => e.stopPropagation()}>
                    <button className="icon-btn" title={t('Jouer depuis cette action')} onClick={() => onPlayFrom(i)}>
                      <Play size={14} />
                    </button>
                    <button className="icon-btn" title={t('Dupliquer')} onClick={() => duplicate(i)}>
                      <Copy size={14} />
                    </button>
                    <button className="icon-btn danger" title={t('Supprimer')} onClick={() => remove(i)}>
                      <Trash2 size={14} />
                    </button>
                  </span>
                </div>
                {selected && (
                  <div className="action-body">
                    {def && (
                      <div className="action-meta">
                        <span>{t(def.description)}</span>
                        <span className={blocking ? 'tag on' : 'tag'}>{blocking ? t('Bloquante') : t('Non bloquante')}</span>
                        <span className={def.skippable ? 'tag' : 'tag warn'}>{def.skippable ? t('Passable (Échap)') : t('Non passable')}</span>
                      </div>
                    )}
                    {ps.map((p, k) => (
                      <ProblemRow key={k} problem={p} onFix={p.fix ? () => mutateDialogue((d) => { const a = d.actions[i]; a.raw = p.fix!.apply(a.raw); }) : undefined} />
                    ))}
                    <ActionForm
                      key={entry.uid}
                      raw={o}
                      patch={(fn, coalesce) =>
                        mutateDialogue((d) => {
                          fn(d.actions[i].raw);
                        }, coalesce ? `${entry.uid}:${coalesce}` : undefined)
                      }
                    />
                  </div>
                )}
              </div>
            );
          })}
          {dropAt === dialogue.actions.length && <div className="drop-end" />}

          {dialogue.actions.length === 0 && (
            <div className="empty">
              <p>{t('Ce dialogue est vide. Commencez par un message ou une image.')}</p>
            </div>
          )}

          <button
            className="btn add-action"
            onClick={() => setPaletteAt(paletteAt === null ? (selectedIndex >= 0 ? selectedIndex + 1 : dialogue.actions.length) : null)}
            aria-expanded={paletteAt !== null}
          >
            <Plus size={15} /> {t('Ajouter une action')}
            {selectedIndex >= 0 && <span className="muted">{t('après la n° {n}', { n: selectedIndex + 1 })}</span>}
          </button>
          {paletteAt !== null && <Palette onPick={(raw) => insert(paletteAt, raw)} />}
        </div>
      )}
    </div>
  );
}

function Palette({ onPick }: { onPick: (raw: RawAction) => void }) {
  const groups = Object.keys(GROUP_LABELS) as ActionGroup[];
  return (
    <div className="palette">
      {groups.map((g) => (
        <div key={g} className={`palette-group group-${g}`}>
          <h4>{t(GROUP_LABELS[g])}</h4>
          <div className="palette-items">
            {ACTIONS.filter((a) => a.group === g).map((a) => {
              const Icon = ICONS[a.shortId] ?? Ban;
              return (
                <button key={a.id} title={t(a.description)} onClick={() => onPick(a.defaults)}>
                  <span className="action-icon">
                    <Icon size={14} />
                  </span>
                  {t(a.label)}
                </button>
              );
            })}
            {g === 'visuel' &&
              RAW_ACTIONS.map((a) => {
                const Icon = ICONS[a.id];
                return (
                  <button key={a.id} title={t(a.description)} onClick={() => onPick({ action: a.id })}>
                    <span className="action-icon">
                      <Icon size={14} />
                    </span>
                    {t(a.label)}
                  </button>
                );
              })}
          </div>
        </div>
      ))}
    </div>
  );
}

function SeverityDot({ severity, count }: { severity: Severity; count: number }) {
  const Icon = SEVERITY_ICON[severity];
  return (
    <span className={`sev ${severity}`} title={count > 1 ? t('{n} remarques', { n: count }) : t('{n} remarque', { n: count })}>
      <Icon size={14} />
    </span>
  );
}

export function ProblemRow({ problem, onFix, onGo, where }: { problem: Problem; onFix?: () => void; onGo?: () => void; where?: string }) {
  const Icon = SEVERITY_ICON[problem.severity];
  return (
    <div className={`problem ${problem.severity}`}>
      <Icon size={14} />
      <div className="problem-text">
        {where && (
          <button className="link mono" onClick={onGo}>
            {where}
          </button>
        )}
        <span>{problem.message}</span>
      </div>
      {onFix && (
        <button type="button" className="btn small" onClick={onFix}>
          {problem.fix?.label}
        </button>
      )}
    </div>
  );
}

function RawJson({ dialogue, mutateDialogue }: { dialogue: DialogueEntry; mutateDialogue: Props['mutateDialogue'] }) {
  const serialized = useMemo(() => JSON.stringify(dialogue.actions.map((a) => a.raw), null, 2), [dialogue.actions]);
  const [text, setText] = useState(serialized);
  const [error, setError] = useState('');
  const editing = useRef(false);
  useEffect(() => {
    if (!editing.current) setText(serialized);
  }, [serialized]);
  return (
    <div className="raw-json">
      <textarea
        className="mono"
        spellCheck={false}
        value={text}
        onFocus={() => (editing.current = true)}
        onBlur={() => {
          editing.current = false;
          if (!error) setText(serialized);
        }}
        onChange={(e) => {
          setText(e.target.value);
          try {
            const parsed = JSON.parse(e.target.value);
            if (!Array.isArray(parsed)) throw new Error(t('Un dialogue est un tableau d’actions.'));
            setError('');
            mutateDialogue((d) => {
              d.actions = parsed.map((raw: RawAction, i: number) => ({ uid: d.actions[i]?.uid ?? uid(), raw }));
            }, `json:${dialogue.uid}`);
          } catch (err) {
            setError(err instanceof Error ? err.message : t('JSON invalide'));
          }
        }}
      />
      {error && <p className="field-error">{error}</p>}
    </div>
  );
}
