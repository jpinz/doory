import { Eye, EyeOff, Minus, Plus, RotateCcw } from 'lucide-react'
import { useState } from 'react'
import { SCORE_LIMIT } from '../../dynamic/scorecard/model'
import type { DocPage } from '@/types/document'
import type { Scoreboard, ScoreCommand, ScoreEntry } from '../scoreboard'
import { t } from '../../strings'
import type { Show } from './useShow'
import styles from './ScoreboardView.module.css'

/** How much one −/+ click changes a score. */
const SCORE_STEPS = [1, 5, 10, 25, 50, 100] as const

function ScoreRow({ entry, step, send }: { entry: ScoreEntry; step: number; send: (command: ScoreCommand) => void }) {
  const adjust = (direction: 1 | -1): void => {
    const value = direction > 0 ? Math.min(step, SCORE_LIMIT - entry.score) : -Math.min(step, SCORE_LIMIT + entry.score)
    if (value) send({ action: 'score-adjust', entryId: entry.id, value })
  }
  const save = (input: HTMLInputElement): void => {
    const value = Number(input.value)
    if (input.value.trim() && Number.isInteger(value) && Math.abs(value) <= SCORE_LIMIT) {
      if (value !== entry.score) send({ action: 'score-set', entryId: entry.id, value })
    } else input.value = String(entry.score)
  }
  return (
    <div className={styles.row}>
      <strong className={styles.name}>{entry.name}</strong>
      <button type="button" aria-label={`${t.scoreboard.decrease}: ${entry.name}`} disabled={entry.score <= -SCORE_LIMIT} onClick={() => adjust(-1)}><Minus size={16} /></button>
      <input
        key={entry.score}
        className={styles.score}
        type="number"
        step={1}
        min={-SCORE_LIMIT}
        max={SCORE_LIMIT}
        aria-label={`${t.scoreboard.score}: ${entry.name}`}
        defaultValue={entry.score}
        onBlur={(event) => save(event.currentTarget)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') { event.preventDefault(); event.currentTarget.blur() }
        }}
      />
      <button type="button" aria-label={`${t.scoreboard.increase}: ${entry.name}`} disabled={entry.score >= SCORE_LIMIT} onClick={() => adjust(1)}><Plus size={16} /></button>
      <button type="button" aria-label={`${t.scoreboard.reset}: ${entry.name}`} title={t.scoreboard.resetHint} disabled={entry.score === 0} onDoubleClick={() => send({ action: 'score-set', entryId: entry.id, value: 0 })}><RotateCcw size={16} /></button>
    </div>
  )
}

interface PanelProps {
  board: Scoreboard
  pages: readonly Pick<DocPage, 'id' | 'name'>[]
  send: (command: ScoreCommand) => void
  disabled?: boolean
  embedded?: boolean
  hint?: string
  testId?: string
}

/** The scores of the players named on score cards, and each card's show/hide state. Players are named on the cards. */
export function ScoreboardPanel({ board, pages, send, disabled = false, embedded = false, hint = t.scoreboard.sessionHint, testId }: PanelProps) {
  const names = new Map(board.entries.map((entry) => [entry.id, entry.name]))
  const [step, setStep] = useState<number>(1)
  return (
    <section className={embedded ? `${styles.root} ${styles.embedded}` : styles.root} aria-label={t.scoreboard.title} data-testid={testId}>
      {embedded ? null : <h2>{t.scoreboard.title}</h2>}
      <p>{hint}</p>
      <fieldset disabled={disabled} className={styles.controls}>
        {board.entries.length ? (
          <div className={styles.steps} role="group" aria-label={t.scoreboard.step}>
            {SCORE_STEPS.map((value) => (
              <button key={value} type="button" aria-pressed={step === value} onClick={() => setStep(value)}>{`${value}×`}</button>
            ))}
          </div>
        ) : null}
        {board.entries.length ? board.entries.map((entry) => <ScoreRow key={entry.id} entry={entry} step={step} send={send} />) : <p>{t.scoreboard.empty}</p>}
        {board.cards.length ? <h3>{t.scoreboard.cards}</h3> : null}
        {board.cards.map((card) => {
          const page = pages.find((item) => item.id === card.pageId)
          const label = `${page?.name || t.scoreboard.card}: ${names.get(card.entryId) ?? card.label}`
          return (
            <div key={`${card.pageId}:${card.id}`} className={styles.row}>
              <span className={styles.name}>{label}</span>
              <button type="button" aria-label={`${card.visible ? t.scoreboard.hide : t.scoreboard.show}: ${label}`} aria-pressed={card.visible} onClick={() => send({ action: 'score-card', pageId: card.pageId, cardId: card.id, visible: !card.visible })}>
                {card.visible ? <Eye size={18} /> : <EyeOff size={18} />}
              </button>
            </div>
          )
        })}
      </fieldset>
    </section>
  )
}

/** The presenter's scoreboard: shown full screen from the toolbar, or `embedded` as a dashboard panel. */
export function ScoreboardView({ link, embedded = false }: { link: Show; embedded?: boolean }) {
  const board = link.show?.scoreboard
  if (!board || !link.show) return null
  return (
    <ScoreboardPanel board={board} pages={link.show.pages} send={link.send} embedded={embedded}
      disabled={link.phase !== 'live' || link.lost || link.show.state.ended} testId={embedded ? 'view-scoreboard-embedded' : undefined} />
  )
}
