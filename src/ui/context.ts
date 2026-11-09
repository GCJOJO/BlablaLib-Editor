import { createContext, useContext } from 'react';
import type { SimSpeaker } from '../engine/sim';
import type { Project } from '../model/project';
import type { ActionDef } from '../model/schema';

export interface EditorContext {
  project: Project;
  locale: string;
  dialogueIds: string[];
  speakers: SimSpeaker[];
  textureIds: string[];
  /** Actions déclarées par les extensions du projet, dans la langue du site. */
  customActions: ActionDef[];
  textureBitmaps: Map<string, ImageBitmap>;
  defaultNamespace: string;
  openDialogueById: (id: string) => void;
  setTranslation: (key: string, locale: string, value: string) => void;
  addTexture: (rl: string, blob: Blob) => Promise<{ width: number; height: number }>;
}

export const EditorCtx = createContext<EditorContext | null>(null);

export function useEditor(): EditorContext {
  const v = useContext(EditorCtx);
  if (!v) throw new Error('EditorCtx manquant');
  return v;
}
