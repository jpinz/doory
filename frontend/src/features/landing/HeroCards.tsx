import { msg } from '@/i18n/catalog'
import { Link } from 'react-router-dom'
import styles from './HeroCards.module.css'

const CARDS = [
  { id: 'board', caption: "Game board", label: "Create a game board", place: styles.left },
  { id: 'question', caption: "Question slide", label: "Create a question slide", place: styles.middle },
  { id: 'answer', caption: "Answer slide", label: "Create an answer slide", place: styles.right },
]

/** Three slide roles in a presentation game, all opening a blank deck. */
export function HeroCards() {
  return (
    <div className={styles.fan}>
      <ul className={styles.art}>
        {CARDS.map((card) => (
          <li key={card.id} className={card.place}>
            <Link to="/create?preset=presentation" className={styles.link} aria-label={msg(card.label)}>
              <span className={`${styles.card} ${styles.scene}`}>
                {card.id === 'board' ? <>
                  <strong>{msg("Round 1")}</strong>
                  <span className={styles.board}>{[100, 200, 300, 100, 200, 300].map((value, index) => <span key={index}>{value}</span>)}</span>
                </> : card.id === 'question' ? <>
                  <small>{msg("Question")}</small><strong>{msg("What is 6 × 7?")}</strong>
                </> : <><small>{msg("Answer")}</small><strong className={styles.answer}>42</strong></>}
              </span>
              <span className={styles.caption} aria-hidden="true">
                {msg(card.caption)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
