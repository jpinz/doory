import { useMemo } from 'react'
import { useLocale } from '@/i18n/useLocale'
import { useDocument, useEditor, useEditorState } from '../../context'
import { initialScoreboard } from '../../presenter/scoreboard'
import { ScoreboardPanel } from '../../presenter/view/ScoreboardView'
import { t } from '../../strings'
import styles from './ScoreboardTab.module.css'

/** The editor's Scoreboard tab: the scores and score cards the next presentation starts with. */
export function ScoreboardTab() {
  useLocale()
  const editor = useEditor()
  const doc = useDocument()
  const readOnly = useEditorState((s) => s.readOnly)
  const board = useMemo(() => initialScoreboard(doc), [doc])
  return (
    <div className={styles.root}>
      <ScoreboardPanel board={board} pages={doc.pages} disabled={readOnly} hint={t.scoreboard.editorHint}
        testId="editor-scoreboard" send={(command) => editor.scoreCards.edit(command)} />
    </div>
  )
}
