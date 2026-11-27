/**
 * The slideshow as a pure state machine: which page is up, whether the show advances by itself, and how long the
 * page has been up. No timers and no DOM here: the audience window feeds it `tick` actions from a clock
 * (`useSlideshow`), the tests feed it numbers. Everything the presenter view shows is derived from this state.
 *
 * Time model. `totalMs` is the wall time since the show started and runs until the end screen. `pageMs` is the time
 * the *countdown* of the current page has run: it only moves while the show is running (auto-advance on, not
 * paused, not blacked out, not at the end), so pausing or blacking out never costs a page its time.
 */

export interface SlideshowConfig {
  /** Number of pages (at least 1). */
  count: number
  /** Seconds each page stays up while auto-advance is on; `null` = waits for the presenter. One entry per page. */
  durations: readonly (number | null)[]
  /** Resolved flow destinations; absent means normal slide order. Null ends the show. */
  nextIndices?: readonly (number | null)[]
}

export interface SlideshowState {
  index: number
  /** The end screen after the last page. */
  ended: boolean
  autoAdvance: boolean
  /** Auto-advance is switched on but held. */
  paused: boolean
  loop: boolean
  /** The audience sees a black screen. */
  blackout: boolean
  /** Slide visits made by interactive links, most recent last. */
  history: number[]
  pageMs: number
  totalMs: number
}

export type SlideshowAction =
  | { type: 'next' }
  | { type: 'prev' }
  | { type: 'first' }
  | { type: 'last' }
  | { type: 'goto'; index: number }
  | { type: 'follow'; index: number }
  /** Pause / resume auto-advance; with auto-advance off it switches it on (the "play" of a player). */
  | { type: 'togglePause' }
  | { type: 'setAutoAdvance'; on: boolean }
  | { type: 'toggleLoop' }
  | { type: 'toggleBlackout' }
  | { type: 'setBlackout'; on: boolean }
  /** Back to the first page with the clocks at zero. Keeps the auto-advance and loop choices. */
  | { type: 'restart' }
  /** `dt` milliseconds went by. With `countdown: false` they only count on the total clock (time the countdown was not running for). */
  | { type: 'tick'; dt: number; countdown?: boolean }

/** The longest span one `tick` counts. A tab that was asleep for an hour must not skip a deck on waking up. */
export const MAX_TICK_MS = 2000

export function initialState(config: SlideshowConfig, options: { index?: number; autoAdvance?: boolean; loop?: boolean } = {}): SlideshowState {
  return {
    index: clampIndex(config, options.index ?? 0),
    ended: false,
    autoAdvance: options.autoAdvance ?? false,
    paused: false,
    loop: options.loop ?? false,
    blackout: false,
    history: [],
    pageMs: 0,
    totalMs: 0,
  }
}

function clampIndex(config: SlideshowConfig, index: number): number {
  if (!Number.isFinite(index)) return 0
  return Math.min(config.count - 1, Math.max(0, Math.trunc(index)))
}

/** Seconds the current page stays up under auto-advance, or `null` when it waits for the presenter. */
export function currentDuration(config: SlideshowConfig, state: SlideshowState): number | null {
  return config.durations[state.index] ?? null
}

/** True while the page countdown is moving. */
export function isRunning(config: SlideshowConfig, state: SlideshowState): boolean {
  return state.autoAdvance && !state.paused && !state.blackout && !state.ended && currentDuration(config, state) !== null
}

/** Milliseconds left on the current page, or `null` when it has no countdown. */
export function remainingMs(config: SlideshowConfig, state: SlideshowState): number | null {
  const sec = currentDuration(config, state)
  if (!state.autoAdvance || state.ended || sec === null) return null
  return Math.max(0, sec * 1000 - state.pageMs)
}

/** How far through its countdown the current page is, 0..1 (0 without a countdown). */
export function pageProgress(config: SlideshowConfig, state: SlideshowState): number {
  const sec = currentDuration(config, state)
  if (!state.autoAdvance || state.ended || sec === null) return 0
  return Math.min(1, state.pageMs / (sec * 1000))
}

/** Moves to `index` (clamped), clearing the end screen, the black-out and the page clock. */
function moveTo(config: SlideshowConfig, state: SlideshowState, index: number): SlideshowState {
  return { ...state, index: clampIndex(config, index), ended: false, blackout: false, pageMs: 0 }
}

function forward(config: SlideshowConfig, state: SlideshowState, carryMs = 0): SlideshowState {
  if (state.ended) return state
  const target = config.nextIndices ? config.nextIndices[state.index] : state.index + 1 < config.count ? state.index + 1 : null
  if (typeof target === 'number' && Number.isInteger(target) && target >= 0 && target < config.count) {
    const returning = state.history.lastIndexOf(target)
    return {
      ...moveTo(config, state, target),
      history: returning >= 0 ? state.history.slice(0, returning) : state.history,
      pageMs: carryMs,
    }
  }
  if (state.loop) return { ...moveTo(config, state, 0), history: [], pageMs: carryMs }
  return { ...state, ended: true, blackout: false, pageMs: 0 }
}

function tick(config: SlideshowConfig, state: SlideshowState, dtRaw: number, countdown: boolean): SlideshowState {
  if (state.ended || !Number.isFinite(dtRaw) || dtRaw <= 0) return state
  const dt = Math.min(dtRaw, MAX_TICK_MS)
  let next: SlideshowState = { ...state, totalMs: state.totalMs + dt }
  if (!countdown || !isRunning(config, next)) return next
  next = { ...next, pageMs: next.pageMs + dt }
  // A tick may span the end of several pages when the times are short; the guard keeps a loop of 1 s pages finite.
  for (let guard = 0; guard <= config.count; guard++) {
    const sec = currentDuration(config, next)
    if (sec === null || next.pageMs < sec * 1000) break
    next = forward(config, next, next.pageMs - sec * 1000)
    if (next.ended) break
  }
  return next
}

export function reduce(config: SlideshowConfig, state: SlideshowState, action: SlideshowAction): SlideshowState {
  switch (action.type) {
    case 'next':
      return forward(config, state)
    case 'prev':
      if (state.ended) return { ...state, ended: false, blackout: false, pageMs: 0 }
      if (state.history.length > 0) {
        const history = state.history.slice(0, -1)
        const index = state.history[state.history.length - 1]
        return { ...moveTo(config, state, index), history }
      }
      return state.index === 0 ? { ...state, blackout: false, pageMs: 0 } : moveTo(config, state, state.index - 1)
    case 'first':
      return { ...moveTo(config, state, 0), history: [] }
    case 'last':
      return { ...moveTo(config, state, config.count - 1), history: [] }
    case 'goto':
      return { ...moveTo(config, state, action.index), history: [] }
    case 'follow': {
      const index = clampIndex(config, action.index)
      if (index === state.index) return state
      const returning = state.history.lastIndexOf(index)
      return {
        ...moveTo(config, state, index),
        history: returning >= 0 ? state.history.slice(0, returning) : [...state.history.slice(-99), state.index],
      }
    }
    case 'togglePause':
      if (!state.autoAdvance) return { ...state, autoAdvance: true, paused: false, pageMs: 0 }
      return { ...state, paused: !state.paused }
    case 'setAutoAdvance':
      return state.autoAdvance === action.on ? state : { ...state, autoAdvance: action.on, paused: false, pageMs: 0 }
    case 'toggleLoop':
      return { ...state, loop: !state.loop }
    case 'toggleBlackout':
      return state.ended ? state : { ...state, blackout: !state.blackout }
    case 'setBlackout':
      return state.ended || state.blackout === action.on ? state : { ...state, blackout: action.on }
    case 'restart':
      return { ...state, index: 0, ended: false, paused: false, blackout: false, history: [], pageMs: 0, totalMs: 0 }
    case 'tick':
      return tick(config, state, action.dt, action.countdown !== false)
  }
}
