import { GitBranch } from 'lucide-react'
import { Badge } from '@/ui'
import styles from './DebugBranchBadge.module.css'

declare const __DEBUG_BRANCH__: string

export function DebugBranchBadge({ branch = __DEBUG_BRANCH__ }: { branch?: string }) {
  if (!branch) return null
  return (
    <Badge className={styles.badge} title={branch} data-debug-branch>
      <GitBranch size={13} aria-hidden="true" />
      <span className={styles.name}>{branch}</span>
    </Badge>
  )
}
