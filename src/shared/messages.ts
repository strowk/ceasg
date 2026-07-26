export type PaneMode = 'wysiwyg' | 'preview';

export interface InitMessage { type: 'init'; mode: PaneMode; source: string; version: number; }
export interface ExternalUpdateMessage { type: 'externalUpdate'; source: string; version: number; }
export interface BlockRemovedMessage { type: 'blockRemoved'; }
export interface UpdateMessage { type: 'update'; source: string; version: number; }
export interface ReadyMessage { type: 'ready'; }

export type HostToWebview = InitMessage | ExternalUpdateMessage | BlockRemovedMessage;
export type WebviewToHost = UpdateMessage | ReadyMessage;

export function isUpdateMessage(m: unknown): m is UpdateMessage {
  if (!m || typeof m !== 'object') { return false; }
  const o = m as Record<string, unknown>;
  return o.type === 'update' && typeof o.source === 'string' && typeof o.version === 'number';
}
export function isReadyMessage(m: unknown): m is ReadyMessage {
  return !!m && typeof m === 'object' && (m as Record<string, unknown>).type === 'ready';
}
