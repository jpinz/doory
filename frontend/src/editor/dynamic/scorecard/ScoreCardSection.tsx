import { SlidersHorizontal } from 'lucide-react'
import { useEditor, useSelection } from '../../context'
import { PopoverTool } from '../../toolbar/parts'
import { t } from '../../strings'
import { initialScoreboard } from '../../presenter/scoreboard'
import { readScoreCard, type ScoreCardSpec } from './model'
import { SCORE_CARD_BACKGROUND, SCORE_CARD_TEXT, type ScoreCardStyle } from './DoryScoreCard'
import { ColorButton } from '../../ui/ColorButton'
import { Switch } from '../../ui/Switch'
import ed from '../../chrome/ed.module.css'

/** Names the card's player or team; cards with the same name share one score, which is set in the Scoreboard tab. */
function ScoreCardEditor({ id, spec, style }: { id: string; spec: ScoreCardSpec; style: ScoreCardStyle }) {
  const editor = useEditor()
  const names = initialScoreboard(editor.state.doc).entries.map((entry) => entry.name).filter((name) => name !== spec.name)
  const listId = `score-names-${id}`
  return (
    <div className={ed.propGrid}>
      <label>
        <span className={ed.propLabel}>{t.scoreboard.name}</span>
        <input
          key={spec.name}
          className={ed.input}
          list={listId}
          maxLength={80}
          defaultValue={spec.name}
          onBlur={(event) => {
            if (!editor.scoreCards.rename(event.currentTarget.value)) event.currentTarget.value = spec.name
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') { event.preventDefault(); event.currentTarget.blur() }
          }}
        />
        <datalist id={listId}>{names.map((name) => <option key={name} value={name} />)}</datalist>
      </label>
      <Switch label={t.scoreboard.scoreOnly} checked={style.scoreOnly === true} onChange={(value) => editor.scoreCards.setStyle({ scoreOnly: value })} />
      <label>
        <span className={ed.propLabel}>{t.scoreboard.namePosition}</span>
        <select className={ed.input} value={style.scoreNamePosition ?? 'above'} disabled={style.scoreOnly === true}
          onChange={(event) => editor.scoreCards.setStyle({ scoreNamePosition: event.target.value === 'below' ? 'below' : 'above' })}>
          <option value="above">{t.scoreboard.nameAbove}</option>
          <option value="below">{t.scoreboard.nameBelow}</option>
        </select>
      </label>
      <div className={ed.propLabel}>
        <ColorButton label={t.scoreboard.background} value={{ type: 'solid', color: style.scoreBackground || SCORE_CARD_BACKGROUND }} solidOnly
          onChange={(fill) => fill.type === 'solid' && editor.scoreCards.setStyle({ scoreBackground: fill.color })} />
        <span>{t.scoreboard.background}</span>
      </div>
      <div className={ed.propLabel}>
        <ColorButton label={t.scoreboard.textColor} value={{ type: 'solid', color: style.scoreColor || SCORE_CARD_TEXT }} solidOnly
          onChange={(fill) => fill.type === 'solid' && editor.scoreCards.setStyle({ scoreColor: fill.color })} />
        <span>{t.scoreboard.textColor}</span>
      </div>
      <p className={ed.propLabel}>{t.scoreboard.nameHint}</p>
    </div>
  )
}

export function ScoreCardSection() {
  const selection = useSelection()
  const object = selection.objects[0]
  const spec = readScoreCard(object?.scoreCard)
  if (!spec) return null
  const text = (value: unknown): string | undefined => typeof value === 'string' && value ? value : undefined
  const style: ScoreCardStyle = {
    scoreOnly: object.scoreOnly === true,
    scoreNamePosition: object.scoreNamePosition === 'below' ? 'below' : 'above',
    scoreBackground: text(object.scoreBackground),
    scoreColor: text(object.scoreColor),
  }
  return (
    <PopoverTool label={t.scoreboard.editCard} trigger={<SlidersHorizontal size={18} aria-hidden="true" />}>
      {() => <ScoreCardEditor key={selection.ids[0]} id={selection.ids[0]} spec={spec} style={style} />}
    </PopoverTool>
  )
}
