import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Clapperboard,
  Crosshair,
  FastForward,
  Flag,
  GitBranch,
  ImagePlus,
  Maximize,
  Network,
  Pause,
  Play,
  RotateCcw,
  SkipForward,
  StepForward,
  Terminal,
  UserCog,
  ListChecks,
  Volume2,
  type LucideIcon,
} from 'lucide-react';
import { CanvasPainter, drawPlaceholderWorld } from '../engine/render';
import { PreviewRun, type RunEvent, type RunEventKind, type SimWorld } from '../engine/sim';
import { N_, t, useLang } from '../i18n';

export interface PlayStatus {
  dialogueId: string | null;
  current: number;
  active: number[];
}

const RESOLUTIONS = [
  { label: N_('1080p, interface 3'), w: 640, h: 360 },
  { label: N_('1080p, interface 2'), w: 960, h: 540 },
  { label: N_('1080p, interface 4'), w: 480, h: 270 },
  { label: N_('854 × 480, interface 2'), w: 427, h: 240 },
];

const SPEEDS = [0.25, 0.5, 1, 2, 4];

const EVENT_ICON: Record<RunEventKind, LucideIcon> = {
  sound: Volume2,
  command: Terminal,
  npc: UserCog,
  quest: ListChecks,
  cutscene: Clapperboard,
  choice: GitBranch,
  warn: AlertTriangle,
  end: Flag,
  open: Play,
};

interface Props {
  world: SimWorld;
  /** Change à chaque modification du projet : relance la preview à l'endroit courant. */
  revision: unknown;
  dialogueId: string | null;
  targetIndex: number;
  /** Incrémenté pour demander une relecture explicite depuis targetIndex. */
  playRequest: { id: string; index: number; nonce: number } | null;
  textures: Map<string, ImageBitmap>;
  onStatus: (s: PlayStatus) => void;
  onOpenDialogue: (id: string) => void;
}

export function PreviewPanel({ world, revision, dialogueId, targetIndex, playRequest, textures, onStatus, onOpenDialogue }: Props) {
  const lang = useLang();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const runRef = useRef<PreviewRun | null>(null);
  const mouse = useRef({ x: -1, y: -1 });
  const texturesRef = useRef(textures);
  texturesRef.current = textures;
  const worldRef = useRef(world);
  worldRef.current = world;

  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false);
  pausedRef.current = paused;
  const [speed, setSpeed] = useState(1);
  const speedRef = useRef(1);
  speedRef.current = speed;
  const [resIndex, setResIndex] = useState(0);
  const res = RESOLUTIONS[resIndex];
  const [network, setNetwork] = useState(false);
  const [follow, setFollow] = useState(true);
  const [background, setBackground] = useState<ImageBitmap | null>(null);
  const backgroundRef = useRef<HTMLCanvasElement | null>(null);

  const [log, setLog] = useState<RunEvent[]>([]);
  const [runState, setRunState] = useState<{ done: boolean; crash: string | null; stuck: boolean; waitingEnter: boolean; dialogue: string | null; ticks: number; unreachable: boolean }>({
    done: false,
    crash: null,
    stuck: false,
    waitingEnter: false,
    dialogue: null,
    ticks: 0,
    unreachable: false,
  });
  const unreachable = useRef(false);
  const lastStatus = useRef('');
  const logEnd = useRef<HTMLDivElement>(null);

  const start = useCallback(
    (id: string, index: number, reveal: boolean) => {
      const run = new PreviewRun(worldRef.current, id, { width: res.w, height: res.h, network });
      unreachable.current = false;
      if (index > 0) unreachable.current = !run.fastForwardTo(index) && !run.crash;
      if (reveal) run.revealMessage();
      runRef.current = run;
      setLog(run.events.slice());
    },
    [res.w, res.h, network],
  );

  // Sélection d'une autre action : la preview se place dessus.
  const followedIndex = follow ? targetIndex : -1;
  useEffect(() => {
    if (!dialogueId) {
      runRef.current = null;
      return;
    }
    start(dialogueId, Math.max(0, followedIndex), false);
    if (followedIndex >= 0) setPaused(false);
  }, [dialogueId, followedIndex, start]);

  // Modification du projet ou de la langue (le journal est écrit dans la langue du moment) : on
  // rejoue jusqu'au même endroit et on montre le résultat tout de suite.
  const firstRevision = useRef(true);
  useEffect(() => {
    if (firstRevision.current) {
      firstRevision.current = false;
      return;
    }
    if (!dialogueId) return;
    const run = runRef.current;
    const sameDialogue = run?.screen?.dialogueId === dialogueId;
    const index = followedIndex >= 0 ? followedIndex : sameDialogue ? run!.screen!.actionIndex : 0;
    start(dialogueId, index, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revision, lang]);

  useEffect(() => {
    if (playRequest) {
      start(playRequest.id, playRequest.index, false);
      setPaused(false);
    }
  }, [playRequest, start]);

  // Fond flouté et assombri, comme Screen.renderBackground.
  useEffect(() => {
    const cv = document.createElement('canvas');
    cv.width = res.w * 2;
    cv.height = res.h * 2;
    const g = cv.getContext('2d')!;
    g.filter = 'blur(4px)';
    if (background) {
      const scale = Math.max(cv.width / background.width, cv.height / background.height);
      const w = background.width * scale;
      const h = background.height * scale;
      g.drawImage(background, (cv.width - w) / 2, (cv.height - h) / 2, w, h);
    } else {
      drawPlaceholderWorld(g, cv.width, cv.height);
    }
    g.filter = 'none';
    g.fillStyle = 'rgba(0,0,0,0.3)';
    g.fillRect(0, 0, cv.width, cv.height);
    backgroundRef.current = cv;
  }, [background, res.w, res.h]);

  // Taille du canvas : un multiple entier de la résolution GUI, pour garder des pixels nets.
  useEffect(() => {
    const canvas = canvasRef.current!;
    const stage = stageRef.current!;
    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const ratio = (stage.clientWidth * dpr) / res.w;
      // Proche d'un multiple entier : pixels nets. Sinon, on dessine plus grand et le navigateur lisse,
      // ce qui reste lisible alors qu'un agrandissement non entier déforme les lettres.
      const nearInteger = ratio >= 1 && Math.abs(ratio - Math.round(ratio)) < 0.08;
      const k = nearInteger ? Math.round(ratio) : Math.max(2, Math.ceil(ratio));
      canvas.style.imageRendering = nearInteger ? 'pixelated' : 'auto';
      canvas.width = res.w * k;
      canvas.height = res.h * k;
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(stage);
    return () => ro.disconnect();
  }, [res.w, res.h]);

  // Boucle principale : 20 ticks par seconde, dessin à chaque image, comme le client.
  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;
    let raf = 0;
    let last = performance.now();
    let acc = 0;
    let lastUi = 0;
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = pausedRef.current ? 0 : (Math.min(now - last, 100) / 50) * speedRef.current;
      last = now;
      const run = runRef.current;

      const k = canvas.width / res.w;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.imageSmoothingEnabled = true;
      if (backgroundRef.current) ctx.drawImage(backgroundRef.current, 0, 0, canvas.width, canvas.height);
      else ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.setTransform(k, 0, 0, k, 0, 0);

      if (run) {
        acc += dt;
        while (acc >= 1) {
          run.tick();
          acc -= 1;
        }
        const painter = new CanvasPainter(ctx, k, (rl) => texturesRef.current.get(rl) ?? null);
        run.render(painter, mouse.current.x, mouse.current.y, dt);
      }

      if (now - lastUi > 100) {
        lastUi = now;
        const s = run?.screen ?? null;
        const status: PlayStatus = {
          dialogueId: s && !s.closed ? s.dialogueId : null,
          current: s ? (s.dialogueActions[s.actionIndex]?.index ?? -1) : -1,
          active: s ? s.currentActions.map((a) => a.index) : [],
        };
        const key = JSON.stringify(status);
        if (key !== lastStatus.current) {
          lastStatus.current = key;
          onStatus(status);
        }
        if (run) {
          setRunState({
            done: run.done,
            crash: run.crash,
            stuck: run.stuck,
            waitingEnter: run.waitingForEnter,
            dialogue: s?.dialogueId ?? null,
            ticks: run.tickCount,
            unreachable: unreachable.current,
          });
          setLog((old) => (old.length === run.events.length && old.at(-1)?.id === run.events.at(-1)?.id ? old : run.events.slice()));
        }
      }
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [res.w, onStatus]);

  useEffect(() => {
    logEnd.current?.parentElement?.scrollTo({ top: 1e6 });
  }, [log]);

  const toGui = (e: React.MouseEvent) => {
    const box = canvasRef.current!.getBoundingClientRect();
    return { x: ((e.clientX - box.left) / box.width) * res.w, y: ((e.clientY - box.top) / box.height) * res.h };
  };

  const restart = () => dialogueId && (start(dialogueId, 0, false), setPaused(false));
  const running = runState.dialogue;
  const elsewhere = running && dialogueId && running !== dialogueId;

  return (
    <section className="preview" aria-label={t('Preview')}>
      <div className="stage" ref={stageRef}>
        <canvas
          ref={canvasRef}
          tabIndex={0}
          aria-label={t('Écran de dialogue. Clic, Espace ou Entrée pour avancer un message, Entrée pour une attente de touche, Échap pour passer.')}
          style={{ aspectRatio: `${res.w} / ${res.h}` }}
          onMouseMove={(e) => (mouse.current = toGui(e))}
          onMouseLeave={() => (mouse.current = { x: -1, y: -1 })}
          onMouseDown={(e) => {
            const p = toGui(e);
            runRef.current?.click(p.x, p.y, e.button);
          }}
          onContextMenu={(e) => e.preventDefault()}
          onKeyDown={(e) => {
            const code = e.code === 'Space' ? 32 : e.code === 'Enter' ? 257 : e.code === 'Escape' ? 256 : 0;
            if (code) {
              e.preventDefault();
              runRef.current?.key(code);
            }
          }}
        />
        {!dialogueId && <div className="stage-overlay">{t('Choisissez un dialogue pour le prévisualiser.')}</div>}
        {dialogueId && runState.crash && (
          <div className="stage-overlay crash">
            <AlertTriangle size={18} />
            <strong>{t('Le jeu planterait ici')}</strong>
            <span className="mono">{runState.crash}</span>
            <button className="btn small" onClick={restart}>
              {t('Rejouer')}
            </button>
          </div>
        )}
        {dialogueId && !runState.crash && runState.done && (
          <div className="stage-overlay">
            <span>{t('Dialogue terminé')}</span>
            <button className="btn small primary" onClick={restart}>
              <RotateCcw size={14} /> {t('Rejouer')}
            </button>
          </div>
        )}
        {dialogueId && !runState.crash && !runState.done && runState.stuck && (
          <div className="stage-banner warn">
            <AlertTriangle size={14} /> {t('Écran bloqué : le joueur ne peut plus sortir de ce dialogue, même avec Échap.')}
          </div>
        )}
        {dialogueId && runState.waitingEnter && !runState.crash && (
          <div className="stage-banner">{t("En attente de la touche Entrée. Ce message n'existe que dans la preview : en jeu, rien ne l'indique.")}</div>
        )}
        {dialogueId && runState.unreachable && !runState.done && !runState.stuck && !runState.crash && (
          <div className="stage-banner">{t("L'action sélectionnée n'est jamais atteinte : la preview s'est arrêtée juste avant.")}</div>
        )}
      </div>

      <div className="transport">
        <button className="btn icon primary" title={t('Rejouer depuis le début')} onClick={restart} disabled={!dialogueId}>
          <RotateCcw size={15} />
        </button>
        <button className="btn icon" title={paused ? t('Reprendre') : t('Pause')} onClick={() => setPaused(!paused)}>
          {paused ? <Play size={15} /> : <Pause size={15} />}
        </button>
        <button
          className="btn icon"
          title={t("Avancer d'un tick")}
          disabled={!paused}
          onClick={() => {
            const run = runRef.current;
            if (!run) return;
            run.tick();
            const painter = new CanvasPainter(canvasRef.current!.getContext('2d')!, canvasRef.current!.width / res.w, (rl) => texturesRef.current.get(rl) ?? null);
            run.render(painter, mouse.current.x, mouse.current.y, 1);
          }}
        >
          <StepForward size={15} />
        </button>
        <button className="btn icon" title={t('Avancer (Entrée)')} onClick={() => runRef.current?.key(257)}>
          <FastForward size={15} />
        </button>
        <button className="btn icon" title={t('Passer (Échap)')} onClick={() => runRef.current?.key(256)}>
          <SkipForward size={15} />
        </button>
        <select aria-label={t('Vitesse')} value={speed} onChange={(e) => setSpeed(Number(e.target.value))}>
          {SPEEDS.map((s) => (
            <option key={s} value={s}>
              ×{s}
            </option>
          ))}
        </select>
        <span className="spacer" />
        <button className={follow ? 'btn icon toggled' : 'btn icon'} title={t("Suivre l'action sélectionnée")} aria-pressed={follow} onClick={() => setFollow(!follow)}>
          <Crosshair size={15} />
        </button>
        <button
          className={network ? 'btn icon toggled' : 'btn icon'}
          title={t('Simuler le réseau du mod : envoi par lots de 3 et un tick de latence.')}
          aria-pressed={network}
          onClick={() => setNetwork(!network)}
        >
          <Network size={15} />
        </button>
        <label className="btn icon" title={t('Fond : importer une capture de votre monde')}>
          <ImagePlus size={15} />
          <input
            type="file"
            accept="image/*"
            hidden
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (f) setBackground(await createImageBitmap(f));
              e.target.value = '';
            }}
          />
        </label>
        <select aria-label={t('Résolution')} value={resIndex} onChange={(e) => setResIndex(Number(e.target.value))}>
          {RESOLUTIONS.map((r, i) => (
            <option key={r.label} value={i}>
              {t(r.label)}
            </option>
          ))}
        </select>
        <button className="btn icon" title={t('Plein écran')} onClick={() => canvasRef.current?.requestFullscreen()}>
          <Maximize size={15} />
        </button>
      </div>

      <div className="preview-status">
        {elsewhere ? (
          <>
            <span>{t('En lecture :')}</span>
            <button className="link mono" onClick={() => onOpenDialogue(running)}>
              {running}
            </button>
          </>
        ) : (
          <span className="mono">{running ?? dialogueId ?? ''}</span>
        )}
        <span className="spacer" />
        <span className="muted mono">
          {runState.ticks} ticks · {(runState.ticks / 20).toFixed(1)} s
        </span>
      </div>

      <div className="event-log" aria-label={t('Journal de lecture')}>
        {log.filter((e) => e.kind !== 'open' || !e.fastForward).map((e) => {
          const Icon = EVENT_ICON[e.kind];
          return (
            <div key={e.id} className={`event ${e.kind} ${e.fastForward ? 'ff' : ''}`}>
              <Icon size={13} />
              <span className="event-tick mono">{e.tick}</span>
              <span className="event-text">{e.text}</span>
            </div>
          );
        })}
        <div ref={logEnd} />
      </div>
    </section>
  );
}
