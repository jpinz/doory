/**
 * [layout] The presenter view: the second window of "Present with notes", kept in step with the audience window over
 * a BroadcastChannel. Two real windows of one browser context; the clocks run on a fake clock where time matters.
 */
import { expect, test, type BrowserContext, type Page } from '@playwright/test'
import { getDoc, moreMenu, openEditor } from './helpers'

// Hidden scrollbars mask sizing feedback that happens in normal browser windows.
test.use({ launchOptions: { executablePath: process.env.PW_CHROMIUM ?? '/opt/pw-browsers/chromium', ignoreDefaultArgs: ['--hide-scrollbars'] } })

const overlay = (page: Page) => page.getByTestId('present-overlay')
const counter = (page: Page) => page.getByTestId('present-counter')

async function openDeck(page: Page): Promise<void> {
  await openEditor(page, 'doc=deck')
}

async function startWithView(page: Page): Promise<Page> {
  const [popup] = await Promise.all([page.waitForEvent('popup'), moreMenu(page, 'Present with notes')])
  await expect(overlay(page)).toBeVisible()
  await expect(popup.getByTestId('view-root')).toBeVisible({ timeout: 15_000 })
  return popup
}

async function setAllTimes(page: Page, seconds: number): Promise<void> {
  await page.locator('section[data-page-id]').first().getByTestId('ed-time-chip').click()
  await page.getByTestId('ed-time-input').fill(String(seconds))
  await page.getByTestId('ed-time-input').press('Enter')
  await page.getByTestId('ed-time-all').click()
  await page.keyboard.press('Escape')
  await expect.poll(async () => (await getDoc(page)).pages.map((p) => (p as { durationSec?: number }).durationSec)).toEqual([seconds, seconds, seconds])
}

const pictureLoaded = (view: Page, which: 'view-current' | 'view-next') =>
  expect
    .poll(() => view.getByTestId(`${which}-picture`).locator('img').evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0), { timeout: 15_000 })
    .toBe(true)

async function closeAll(context: BrowserContext): Promise<void> {
  await context.close()
}

test.describe('[layout] presenter preview stability', () => {
  test('keeps both previews stable at default zoom and after resizing and zooming with visible scrollbars', async ({ page }) => {
    await openDeck(page)
    await page.getByTestId('ed-share').click()
    const [view] = await Promise.all([
      page.waitForEvent('popup'),
      page.getByRole('menuitem', { name: 'Present with notes' }).click(),
    ])
    await expect(view.getByTestId('view-root')).toBeVisible({ timeout: 15_000 })
    const expectStable = async (which: 'current' | 'next'): Promise<void> => {
      await pictureLoaded(view, `view-${which}`)
      const sizes = await view.getByTestId(`view-${which}`).evaluate(async (el) => {
        await new Promise((resolve) => setTimeout(resolve, 100))
        const samples = new Set<string>()
        const until = performance.now() + 500
        while (performance.now() < until) {
          await new Promise(requestAnimationFrame)
          const picture = el.querySelector('[data-testid$="-picture"]')?.getBoundingClientRect()
          if (!picture) throw new Error('no preview picture')
          samples.add([el.clientWidth, el.clientHeight, picture.x, picture.y, picture.width, picture.height].join('x'))
        }
        return [...samples]
      })
      expect(sizes, `${which} preview must not oscillate while idle`).toHaveLength(1)
    }
    await expectStable('current')
    await expectStable('next')
    await page.getByTestId('present-timeline').getByRole('button', { name: 'Go to page 2' }).click()
    await expect(view.getByTestId('view-counter')).toHaveText('Page 2 of 3')
    for (const [which, aspect] of [['current', 1], ['next', 1080 / 1920]] as const) {
      const panel = view.getByTestId(`view-panel-${which}`)
      for (const shape of [{ width: 320, height: 400 / aspect }, { width: 480.5, height: 270.5 }]) {
        await panel.getByRole('button', { name: 'Zoom level', exact: true }).click()
        await panel.evaluate((el, { which, width, height }) => {
          const box = el.querySelector(`[data-testid="view-${which}"]`)
          if (!box) throw new Error('no preview viewport')
          const outer = el.getBoundingClientRect()
          const inner = box.getBoundingClientRect()
          el.style.width = `${width + outer.width - inner.width}px`
          el.style.height = `${height + outer.height - inner.height}px`
        }, { which, ...shape })
        await expectStable(which)
        const holder = await view.getByTestId(`view-${which}`).boundingBox()
        const fitted = await view.getByTestId(`view-${which}-picture`).boundingBox()
        if (!holder || !fitted) throw new Error('no fitted preview')
        expect(fitted.width / fitted.height).toBeCloseTo(aspect, 2)
        expect(fitted.width).toBeLessThanOrEqual(holder.width + 1)
        expect(fitted.height).toBeLessThanOrEqual(holder.height + 1)
        await panel.getByRole('button', { name: 'Zoom in', exact: true }).click()
        await expectStable(which)
        const scroller = view.getByTestId(`view-${which}-scroll`)
        const scrollable = await scroller.evaluate((el) => {
          el.scrollLeft = el.scrollWidth
          el.scrollTop = el.scrollHeight
          return el.scrollLeft > 0 || el.scrollTop > 0
        })
        expect(scrollable).toBe(true)
      }
    }
  })
})

test.describe('[layout] presenter view', () => {
  test('configures dashboard panels and restores them after toggling the flow map or reloading', async ({ page, context }) => {
    await openDeck(page)
    await page.getByTestId('ed-share').click()
    const [view] = await Promise.all([
      page.waitForEvent('popup'),
      page.getByRole('menuitem', { name: 'Present with notes' }).click(),
    ])
    await expect(overlay(page)).toBeVisible()
    await expect(view.getByTestId('view-root')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByTestId('present-timeline')).toBeVisible()
    await page.getByTestId('present-progress-toggle').click()
    await expect(page.getByTestId('present-timeline')).toHaveCount(0)
    await expect(view.getByTestId('view-dashboard')).toBeVisible()
    await page.getByTestId('present-progress-toggle').click()
    await page.getByTestId('present-timeline').getByRole('button', { name: 'Go to page 2' }).click()
    await expect(view.getByTestId('view-counter')).toHaveText('Page 2 of 3')
    await page.getByTestId('present-timeline').getByRole('button', { name: 'Go to page 1' }).click()
    await expect(view.getByTestId('view-counter')).toHaveText('Page 1 of 3')
    const expectResizeClearance = async (): Promise<void> => {
      for (const section of await view.locator('section[data-testid^="view-panel-"]').all()) {
        const content = await section.locator(':scope > div').boundingBox()
        if (!content) throw new Error('no panel content')
        for (const zone of await section.locator('[data-edge]').all()) {
          const handle = await zone.boundingBox()
          if (!handle) throw new Error('no resize handle')
          const overlaps = Math.min(content.x + content.width, handle.x + handle.width) > Math.max(content.x, handle.x)
            && Math.min(content.y + content.height, handle.y + handle.height) > Math.max(content.y, handle.y)
          expect(overlaps).toBe(false)
        }
      }
    }
    await expectResizeClearance()
    const panel = view.getByTestId('view-panel-next')
    const move = panel.getByRole('button', { name: 'Move panel (drag or use arrow keys)' })
    const start = await panel.boundingBox()
    const grip = await move.boundingBox()
    if (!start || !grip) throw new Error('no panel box')
    await view.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2)
    await view.mouse.down()
    await view.mouse.move(grip.x + grip.width / 2 - 120, grip.y + grip.height / 2 + 80, { steps: 8 })
    await view.mouse.up()
    const moved = await panel.boundingBox()
    if (!moved) throw new Error('no moved panel box')
    expect(moved.x).toBeCloseTo(start.x - 120, 0)
    expect(moved.y).toBeCloseTo(start.y + 80, 0)
    await expect(counter(page)).toHaveText('1 / 3')

    const resize = await panel.getByTestId('view-resize-se').boundingBox()
    if (!resize) throw new Error('no resize handle')
    await view.mouse.move(resize.x + resize.width / 2, resize.y + resize.height / 2)
    await view.mouse.down()
    await expect(panel.getByTestId('view-resize-se')).toHaveCSS('box-shadow', 'none')
    await expect(panel.getByTestId('view-resize-se')).toHaveCSS('outline-style', 'none')
    await view.mouse.move(resize.x + resize.width / 2 - 80, resize.y + resize.height / 2 + 60, { steps: 8 })
    await view.mouse.up()
    const resized = await panel.boundingBox()
    if (!resized) throw new Error('no resized panel box')
    expect(resized.width).toBeCloseTo(moved.width - 80, 0)
    expect(resized.height).toBeCloseTo(moved.height + 60, 0)
    const corner = await panel.getByTestId('view-resize-nw').boundingBox()
    if (!corner) throw new Error('no top-left resize corner')
    await view.mouse.move(corner.x + corner.width / 2, corner.y + corner.height / 2)
    await view.mouse.down()
    await view.mouse.move(corner.x + corner.width / 2 + 40, corner.y + corner.height / 2 + 30, { steps: 8 })
    await view.mouse.up()
    const fromCorner = await panel.boundingBox()
    if (!fromCorner) throw new Error('no corner-resized panel box')
    expect(fromCorner.x).toBeCloseTo(resized.x + 40, 0)
    expect(fromCorner.y).toBeCloseTo(resized.y + 30, 0)
    expect(fromCorner.width).toBeCloseTo(resized.width - 40, 0)
    expect(fromCorner.height).toBeCloseTo(resized.height - 30, 0)
    const side = await panel.getByTestId('view-resize-e').boundingBox()
    if (!side) throw new Error('no right resize edge')
    await view.mouse.move(side.x + side.width / 2, side.y + side.height / 2)
    await view.mouse.down()
    await view.mouse.move(side.x + side.width / 2 + 20, side.y + side.height / 2, { steps: 8 })
    await view.mouse.up()
    const fromSide = await panel.boundingBox()
    if (!fromSide) throw new Error('no edge-resized panel box')
    expect(fromSide.x).toBeCloseTo(fromCorner.x, 0)
    expect(fromSide.width).toBeCloseTo(fromCorner.width + 20, 0)
    expect(fromSide.height).toBeCloseTo(fromCorner.height, 0)
    const geometry = await panel.getAttribute('style')

    await panel.getByRole('combobox', { name: 'Panel component' }).selectOption('flow')
    await expect(panel.getByTestId('map-root')).toBeVisible()
    await expectResizeClearance()
    await expect(view.getByTestId('view-notes')).toBeVisible()
    await panel.getByRole('button', { name: 'Zoom in' }).click()
    await expect(panel.getByTestId('map-zoom')).toHaveText('125%')
    await view.getByTestId('view-flow-map').click()
    await expect(view.getByTestId('view-map')).toBeVisible()
    await expect(view.getByTestId('view-dashboard')).toHaveCount(0)
    await view.getByTestId('view-flow-map').click()
    await expect(panel).toHaveAttribute('style', geometry ?? '')
    await expect(panel.getByTestId('map-zoom')).toHaveText('125%')

    await view.reload()
    await expect(panel.getByTestId('map-root')).toBeVisible({ timeout: 15_000 })
    await expect(panel).toHaveAttribute('style', geometry ?? '')
    await expect(panel.getByTestId('map-zoom')).toHaveText('125%')
    await panel.getByTestId('map-card-1').click()
    await expect(counter(page)).toHaveText('2 / 3')
    await panel.getByTestId('view-resize-se').focus()
    await view.keyboard.press('Tab')
    const keyboardEdge = panel.getByTestId('view-resize-s')
    await expect(keyboardEdge).toBeFocused()
    await expect(keyboardEdge).toHaveCSS('box-shadow', 'none')
    await expect(keyboardEdge).toHaveCSS('outline-style', 'none')
    await expect(keyboardEdge).toHaveCSS('border-bottom-style', 'solid')
    await closeAll(context)
  })

  test('shows the current page, the next page and the notes, in step with the audience window', async ({ page, context }) => {
    await openDeck(page)
    const view = await startWithView(page)
    await expect(view.getByTestId('view-counter')).toHaveText('Page 1 of 3')
    await expect(view.getByTestId('view-notes')).toHaveText('Welcome everyone.\nSay who you are and why this matters.')
    await pictureLoaded(view, 'view-current')
    await pictureLoaded(view, 'view-next')
    await expect(view.getByTestId('view-current-picture').locator('img')).toHaveAttribute('alt', 'Now: page 1, Intro')
    await expect(view.getByTestId('view-next-picture').locator('img')).toHaveAttribute('alt', 'Next: page 2, Square')
    await expect(view).toHaveTitle('Presenter view: Untitled design')

    // Audience window moves: the view follows.
    await page.bringToFront()
    await page.keyboard.press('ArrowRight')
    await expect(view.getByTestId('view-counter')).toHaveText('Page 2 of 3')
    await expect(view.getByTestId('view-notes')).toHaveText('Walk through the square layout.')
    await pictureLoaded(view, 'view-current')
    await expect(view.getByTestId('view-current-picture').locator('img')).toHaveAttribute('alt', 'Now: page 2, Square')
    await page.keyboard.press('ArrowRight')
    await expect(view.getByTestId('view-counter')).toHaveText('Page 3 of 3')
    await expect(view.getByTestId('view-notes')).toHaveText('No notes for this page.')
    await expect(view.getByText('Last page')).toBeVisible()
    await expect(view.getByTestId('view-next-picture')).toHaveCount(0)
    await closeAll(context)
  })

  test('its buttons and keys drive the audience window', async ({ page, context }) => {
    await openDeck(page)
    const view = await startWithView(page)
    await view.getByTestId('view-next-button').click()
    await expect(counter(page)).toHaveText('2 / 3')
    await expect(view.getByTestId('view-counter')).toHaveText('Page 2 of 3')
    await view.getByTestId('view-prev').click()
    await expect(counter(page)).toHaveText('1 / 3')
    await view.keyboard.press('End')
    await expect(counter(page)).toHaveText('3 / 3')
    await view.keyboard.press('ArrowLeft')
    await expect(counter(page)).toHaveText('2 / 3')
    await view.keyboard.press('Home')
    await expect(counter(page)).toHaveText('1 / 3')
    await view.keyboard.press('Space')
    await expect(counter(page)).toHaveText('2 / 3')
    await view.getByTestId('view-restart').click()
    await expect(counter(page)).toHaveText('1 / 3')
    await view.getByTestId('view-loop').click()
    await expect(page.getByTestId('present-loop')).toHaveAttribute('aria-pressed', 'true')
    await expect(view.getByTestId('view-loop')).toHaveAttribute('aria-pressed', 'true')
    await view.getByTestId('view-blackout').click()
    await expect(page.getByTestId('present-black')).toBeVisible()
    await view.keyboard.press('b')
    await expect(page.getByTestId('present-black')).toHaveCount(0)
    await closeAll(context)
  })

  test('boxes every page by its own size', async ({ page, context }) => {
    await openDeck(page)
    const doc = await getDoc(page)
    const sizes = doc.pages.map((p) => ({ width: (p as { width?: number }).width ?? doc.width, height: (p as { height?: number }).height ?? doc.height }))
    const view = await startWithView(page)
    for (let i = 0; i < 3; i++) {
      await expect(view.getByTestId('view-counter')).toHaveText(`Page ${i + 1} of 3`)
      await pictureLoaded(view, 'view-current')
      const picture = await view.getByTestId('view-current-picture').boundingBox()
      const holder = await view.getByTestId('view-current').boundingBox()
      if (!picture || !holder) throw new Error('no box')
      expect(picture.width / picture.height).toBeCloseTo(sizes[i].width / sizes[i].height, 1)
      expect(picture.width).toBeLessThanOrEqual(holder.width + 1)
      expect(picture.height).toBeLessThanOrEqual(holder.height + 1)
      if (i < 2) await page.keyboard.press('ArrowRight')
    }
    await closeAll(context)
  })

  test('the notes text can be made larger or smaller, and the size is remembered', async ({ page, context }) => {
    await openDeck(page)
    const view = await startWithView(page)
    const size = () => view.getByTestId('view-notes').evaluate((el) => Number.parseFloat(getComputedStyle(el).fontSize))
    expect(await size()).toBe(28)
    await view.getByTestId('view-larger').click()
    expect(await size()).toBe(36)
    await view.getByTestId('view-larger').click()
    await view.keyboard.press('+')
    expect(await size()).toBe(64)
    await expect(view.getByTestId('view-larger')).toBeDisabled()
    for (let i = 0; i < 8; i++) await view.getByTestId('view-smaller').click({ force: true })
    expect(await size()).toBe(14)
    await expect(view.getByTestId('view-smaller')).toBeDisabled()
    await view.keyboard.press('=')
    expect(await size()).toBe(18)
    await view.reload()
    await expect(view.getByTestId('view-notes')).toBeVisible({ timeout: 15_000 })
    expect(await size()).toBe(18)
    await closeAll(context)
  })

  test('shows the notes as text, never as markup', async ({ page, context }) => {
    await openDeck(page)
    await page.getByTestId('ed-notes-toggle').click()
    await page.getByTestId('ed-notes-text').fill('<img src=x onerror="window.__pwned=1"><b>bold?</b>')
    await expect.poll(async () => ((await getDoc(page)).pages[0] as { notes?: string }).notes).toContain('<img')
    const view = await startWithView(page)
    await expect(view.getByTestId('view-notes')).toHaveText('<img src=x onerror="window.__pwned=1"><b>bold?</b>')
    expect(await view.evaluate(() => (window as unknown as { __pwned?: number }).__pwned)).toBeUndefined()
    expect(await view.locator('[data-testid="view-notes"] b, [data-testid="view-notes"] img').count()).toBe(0)
    await closeAll(context)
  })

  test('closing the presenter view leaves the slideshow running, and it can be opened again', async ({ page, context }) => {
    await openDeck(page)
    const view = await startWithView(page)
    await expect(page.getByTestId('present-view')).toHaveAttribute('aria-pressed', 'true')
    await view.close()
    await expect(page.getByTestId('present-view')).toHaveAttribute('aria-pressed', 'false')
    await expect(overlay(page)).toBeVisible()
    await page.keyboard.press('ArrowRight')
    await expect(counter(page)).toHaveText('2 / 3')
    const [again] = await Promise.all([page.waitForEvent('popup'), page.getByTestId('present-view').click()])
    await expect(again.getByTestId('view-counter')).toHaveText('Page 2 of 3', { timeout: 15_000 })
    await closeAll(context)
  })

  test('leaving the slideshow tells the presenter view, which then says it has ended', async ({ page, context }) => {
    await openDeck(page)
    const view = await startWithView(page)
    await page.keyboard.press('Escape')
    await expect(overlay(page)).toBeHidden()
    await expect(view.getByTestId('view-ended')).toBeVisible()
    await expect(view.getByTestId('view-ended')).toContainText('The presentation has ended.')
    await expect(view.getByRole('button', { name: 'Close window' })).toBeVisible()
    await closeAll(context)
  })

  test('"End presentation" in the presenter view ends it in both windows', async ({ page, context }) => {
    await openDeck(page)
    const view = await startWithView(page)
    await view.getByTestId('view-exit').click()
    await expect(overlay(page)).toBeHidden()
    await expect(view.getByTestId('view-ended')).toBeVisible()
    await closeAll(context)
  })

  test('reloading the presenter view reconnects it', async ({ page, context }) => {
    await openDeck(page)
    const view = await startWithView(page)
    await page.keyboard.press('ArrowRight')
    await view.reload()
    await expect(view.getByTestId('view-counter')).toHaveText('Page 2 of 3', { timeout: 15_000 })
    await closeAll(context)
  })

  test('without a pop-up the slideshow says so and shows the notes itself', async ({ page, context }) => {
    await page.addInitScript(() => {
      window.open = () => null
    })
    await openDeck(page)
    await moreMenu(page, 'Present with notes')
    await expect(overlay(page)).toBeVisible()
    await expect(page.getByTestId('present-message')).toContainText('The presenter view was blocked')
    await expect(page.getByTestId('present-message')).toContainText('Allow pop-ups')
    await expect(page.getByTestId('present-notes')).toContainText('Welcome everyone.')
    await page.getByTestId('present-view').click()
    await expect(page.getByTestId('present-message')).toContainText('blocked')
    await closeAll(context)
  })

  test('shows when the presentation window has gone quiet', async ({ page, context }) => {
    await openDeck(page)
    const view = await startWithView(page)
    // The audience window goes away (the tab is closed): the view says the presentation ended or went quiet.
    await page.close({ runBeforeUnload: false })
    await expect(view.getByTestId('view-lost').or(view.getByTestId('view-ended'))).toBeVisible({ timeout: 15_000 })
    await closeAll(context)
  })
})

test.describe('[layout] presenter view: clocks on a fake clock', () => {
  test('the elapsed time, the page countdown and the pause note', async ({ page, context }) => {
    await context.clock.install()
    await openDeck(page)
    await setAllTimes(page, 10)
    const view = await startWithView(page)
    await context.clock.pauseAt(Date.now() + 300)
    await context.clock.runFor(3200)
    await expect(view.getByTestId('view-timer')).toContainText(/0:0[5-8] left/)
    await expect(view.getByTestId('view-elapsed')).toHaveText(/^0:0[3-6]$/)
    await view.getByTestId('view-pause').click()
    await expect(view.getByTestId('view-timer')).toContainText('Paused')
    await context.clock.runFor(4000)
    await expect(view.getByTestId('view-timer')).toContainText('Paused')
    await expect(view.getByTestId('view-elapsed')).toHaveText(/^0:0[7-9]|0:1\d$/)
    await view.getByTestId('view-pause').click()
    await context.clock.runFor(8000)
    await expect(view.getByTestId('view-counter')).toHaveText('Page 2 of 3')
    await closeAll(context)
  })
})

test.describe('[layout] presenter view: addresses', () => {
  test('a page without a valid session says so', async ({ page }) => {
    for (const query of ['', '?session=short', '?session=../../etc/passwd', `?session=${'a'.repeat(200)}`]) {
      await page.goto(`/presenter-view.html${query}`)
      await expect(page.getByRole('alert')).toHaveText('This address is not a presenter view link.')
    }
  })

  test('a valid session with no presentation waits for one', async ({ page }) => {
    await page.goto('/presenter-view.html?session=0123456789abcdef0123456789abcdef')
    await expect(page.getByTestId('view-connecting')).toBeVisible()
    await expect(page.getByRole('status')).toHaveText('Waiting for the presentation…')
  })
})
