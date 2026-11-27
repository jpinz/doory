import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { type DocObject, type DocPage, type DoryDocument, MAX_DIMENSION_PX } from '@/types/document'
import { getPageSize } from '../engine/pageSizes'
import { useLatest } from '../hooks/useLatest'
import { canvasToBlob } from '../engine/render'
import { type ChannelLike, canLink, type InteractivePreview, MAX_PAGE_INTERACTIVES, openLink, type PagePreview, type PresenterLink, type PreviewBox, type ViewCommand } from './channel'
import type { FrameCache } from './frames'
import { objectBoxes } from './objectBoxes'
import type { SlideshowAction, SlideshowState } from './machine'
import { pageNotes } from './pageProps'
import { NOTES_MAX_LENGTH } from './timing'
import { t } from '../strings'
import { dieDocuments } from '../dynamic/interactive/dice/model'
import { wheelDocuments } from '../dynamic/interactive/wheel/model'

/** How often the state is re-sent while a presenter view is connected, so its clocks stay true. */
const HEARTBEAT_MS = 1000

export interface ViewHostOptions {
  session: string
  title: string
  /** The pages of the presentation and their sizes (the snapshot the slideshow works on). */
  doc: DoryDocument
  /** Seconds per page under auto-advance (`null` = waits), as the slideshow uses them. */
  durations: readonly (number | null)[]
  state: SlideshowState
  dispatch: (action: SlideshowAction) => void
  onExit: () => void
  /** Each returns false when the page on the stage cannot take it yet. */
  onSpinWheel: (pageId: string, wheelId: string) => boolean
  onRollDice: (pageId: string, dieIds: readonly string[]) => boolean
  /** Renders the small pictures the view shows. Separate from the stage's cache: different sizes. */
  previews: FrameCache
  /** Tests stand in for BroadcastChannel. */
  createChannel?: (name: string) => ChannelLike | null
}

export interface ViewHost {
  /** The browser can link two windows at all. */
  supported: boolean
  /** A presenter view has said hello and has not left. */
  connected: boolean
  interactiveStatus: (pageId: string, text: string) => void
}

// Objects sharing a name (new dice are all called "Die") are numbered, so their buttons can be told apart.
const previewOf = (objects: DocObject[], label: string, boxes: (ids: Set<string>) => Map<string, PreviewBox>): InteractivePreview[] => {
  const kept = objects.filter((object) => object.id.length > 0 && object.id.length <= 64).slice(0, MAX_PAGE_INTERACTIVES)
  const placed = kept.length ? boxes(new Set(kept.map((object) => object.id))) : new Map<string, PreviewBox>()
  const names = kept.map((object) => (object.name || label).slice(0, 190))
  const seen = new Map<string, number>()
  return kept.map((object, index) => {
    const name = names[index]
    const nth = (seen.get(name) ?? 0) + 1
    seen.set(name, nth)
    const box = placed.get(object.id)
    return {
      id: object.id,
      label: names.indexOf(name) !== names.lastIndexOf(name) ? `${name} ${nth}` : name,
      ...(box ? { box } : {}),
    }
  })
}

export function previewsOf(doc: DoryDocument, durations: readonly (number | null)[]): PagePreview[] {
  return doc.pages.map((page: DocPage, index) => {
    const size = getPageSize(doc, page.id)
    const boxes = (ids: Set<string>) => objectBoxes(page.objects, ids, size.width, size.height)
    return {
      id: page.id,
      // The channel refuses oversized values, so what a hand-made document holds is cut to what it can carry.
      name: (page.name ?? '').trim().slice(0, 200),
      notes: pageNotes(page).slice(0, NOTES_MAX_LENGTH),
      durationSec: durations[index] ?? null,
      width: Math.min(MAX_DIMENSION_PX, size.width),
      height: Math.min(MAX_DIMENSION_PX, size.height),
      wheels: previewOf(wheelDocuments(page.objects), t.wheel.name, boxes),
      dice: previewOf(dieDocuments(page.objects), t.dice.name, boxes),
    }
  })
}

function actionOf(command: Exclude<ViewCommand, { action: 'spin-wheel' | 'roll-dice' }>): SlideshowAction | 'exit' {
  switch (command.action) {
    case 'next':
    case 'prev':
    case 'first':
    case 'last':
    case 'restart':
      return { type: command.action }
    case 'toggle-pause':
      return { type: 'togglePause' }
    case 'toggle-loop':
      return { type: 'toggleLoop' }
    case 'toggle-blackout':
      return { type: 'toggleBlackout' }
    case 'goto':
      return { type: 'goto', index: command.index }
    case 'exit':
      return 'exit'
  }
}

function currentTheme(): 'light' | 'dark' | null {
  const theme = document.documentElement.dataset.theme
  return theme === 'light' || theme === 'dark' ? theme : null
}

/**
 * The audience window's side of the presenter view: answers its hello with everything it needs, sends the state when
 * it changes (and every second), renders the pictures it asks for and carries out its commands.
 */
export function useViewHost(options: ViewHostOptions): ViewHost {
  const { session, createChannel } = options
  const latest = useLatest(options)
  const previews = useMemo(() => previewsOf(options.doc, options.durations), [options.doc, options.durations])
  const previewsRef = useLatest(previews)
  const [connected, setConnected] = useState(false)
  const supported = createChannel !== undefined || canLink()
  const linkRef = useRef<PresenterLink | null>(null)

  useEffect(() => {
    const opened = openLink(session, 'show', createChannel)
    linkRef.current = opened
    if (!opened) return
    const off = opened.subscribe((message) => {
      const o = latest.current
      switch (message.kind) {
        case 'hello':
          setConnected(true)
          opened.send({ kind: 'init', title: o.title.slice(0, 300) || t.untitled, theme: currentTheme(), pages: previewsRef.current, state: o.state })
          break
        case 'command': {
          const command = message.command
          if (command.action === 'spin-wheel' || command.action === 'roll-dice') {
            const { pageId } = command
            if (o.state.ended || o.state.blackout || o.doc.pages[o.state.index]?.id !== pageId) break
            const started = command.action === 'spin-wheel' ? o.onSpinWheel(pageId, command.wheelId) : o.onRollDice(pageId, command.dieIds)
            if (!started) opened.send({ kind: 'interactive-status', pageId, text: t.presenter.preparing })
            break
          }
          const action = actionOf(command)
          if (action === 'exit') o.onExit()
          else o.dispatch(action)
          break
        }
        case 'need-frame':
          void sendFrame(opened, o.previews, o.doc.pages.find((p) => p.id === message.pageId), message.width)
          break
        case 'bye':
          setConnected(false)
          break
        default:
          break
      }
    })
    // A closed tab never unmounts: tell the view then too.
    const leave = (): void => opened.send({ kind: 'bye' })
    window.addEventListener('pagehide', leave)
    return () => {
      window.removeEventListener('pagehide', leave)
      leave()
      off()
      opened.close()
      linkRef.current = null
    }
  }, [session, createChannel, latest, previewsRef])

  // The state goes out when something other than a clock changed, and again every second while a view is listening.
  const { index, ended, autoAdvance, paused, loop, blackout } = options.state
  useEffect(() => {
    if (connected) linkRef.current?.send({ kind: 'state', state: latest.current.state })
  }, [connected, index, ended, autoAdvance, paused, loop, blackout, latest])
  useEffect(() => {
    if (!connected) return
    const timer = window.setInterval(() => linkRef.current?.send({ kind: 'state', state: latest.current.state }), HEARTBEAT_MS)
    return () => window.clearInterval(timer)
  }, [connected, latest])

  const interactiveStatus = useCallback((pageId: string, text: string) => {
    linkRef.current?.send({ kind: 'interactive-status', pageId, text })
  }, [])

  return { supported, connected, interactiveStatus }
}

async function sendFrame(link: PresenterLink, cache: FrameCache, page: DocPage | undefined, width: number): Promise<void> {
  if (!page) return
  try {
    const canvas = await cache.get(page, width)
    const image = await canvasToBlob(canvas, 'image/png')
    link.send({ kind: 'frame', pageId: page.id, width, image })
  } catch {
    /* the view keeps showing "Loading…" for this page and asks again when it needs it */
  }
}
