import { msg } from '@/i18n/catalog'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { createUrl } from '@/features/presets'
import { presentationCatalogue, type SizePreset, useSizePresets } from '@/lib/sizePresets'
import { noteUsedSize } from '@/lib/sizePresets/choices'
import { presetSizeText } from '@/lib/sizePresets/picker'
import { PresetShape } from '@/lib/sizePresets/PresetShape'
import { Button, Dialog } from '@/ui'
import { CustomSizeForm } from './CustomSizeForm'
import styles from './CreateDesignDialog.module.css'

export interface CreateDesignDialogProps {
  open: boolean
  onClose(): void
  /** Open on the custom size instead of the popular sizes. */
  initialTab?: 'sizes' | 'custom'
}

/** Choose a presentation format or a custom slide size. */
export function CreateDesignDialog({ open, onClose, initialTab = 'sizes' }: CreateDesignDialogProps) {
  const navigate = useNavigate()
  const catalogue = presentationCatalogue(useSizePresets())
  const [chosen, setChosen] = useState<SizePreset | null>(null)
  // The custom size form has its own Create button.
  const [custom, setCustom] = useState(initialTab === 'custom')

  // The pages keep the dialog mounted while it is closed: it opens again with nothing chosen.
  function close() {
    setChosen(null)
    onClose()
  }
  function go(url: string) {
    close()
    navigate(url)
  }
  const create = (preset: SizePreset): void => {
    noteUsedSize(preset.id)
    go(createUrl({ presetId: preset.id }))
  }

  return (
    <Dialog
      open={open}
      onClose={close}
      title={msg("Create a presentation")}
      description={msg("Choose a slide format. Every new document is a presentation.")}
      size="xl"
      footer={
        <>
          <div className={styles.chosen} aria-live="polite">
            {chosen ? (
              <>
                <PresetShape preset={chosen} size={28} />
                <span>
                  <strong>{chosen.label}</strong>
                  <small>
                    {chosen.path.at(-1)?.label} · {presetSizeText(chosen)}
                  </small>
                </span>
              </>
            ) : custom ? null : (
              <small>{msg("Pick a size, then create. A double click creates it at once.")}</small>
            )}
          </div>
          <Button variant="ghost" onClick={close}>
            {msg("Cancel")}</Button>
          {custom ? null : (
            <Button disabled={!chosen} onClick={() => chosen && create(chosen)}>
              {msg("Create presentation")}</Button>
          )}
        </>
      }
    >
      <div className={styles.tabs} role="group" aria-label={msg("Slide size")}>
        <button type="button" aria-pressed={!custom} onClick={() => setCustom(false)}>{msg("Slide formats")}</button>
        <button type="button" aria-pressed={custom} onClick={() => setCustom(true)}>{msg("Custom slide size")}</button>
      </div>
      {custom ? <CustomSizeForm initialSize={{ width: 1920, height: 1080 }} submitLabel="Create presentation" onSubmit={(size) => go(createUrl(size))} /> : (
        <ul className={styles.presets}>
          {catalogue.presets.map((preset) => <li key={preset.id}>
            <button type="button" aria-pressed={chosen?.id === preset.id} onClick={() => setChosen(preset)} onDoubleClick={() => create(preset)}>
              <PresetShape preset={preset} size={64} />
              <strong>{preset.label}</strong>
              <small>{presetSizeText(preset)}</small>
            </button>
          </li>)}
        </ul>
      )}
    </Dialog>
  )
}
