// Live verification of T129 (board page fixed-height + internal list scroll)
// and T130-T137 (card modal 60% resize, collapsible fields with custom
// icons, animations). Standalone chromium.launch() (bare `playwright`),
// same bypass-the-contended-MCP-browser technique as this repo's other
// verify-*.mjs scripts.
import { chromium } from 'playwright'

const BASE = 'http://localhost:5173'
const unique = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
const user = {
  username: `modal_${unique}`.toLowerCase().slice(0, 32),
  email: `modal.${unique}@nextventures.mx`,
  password: 'TestPass123!',
}

const browser = await chromium.launch({ args: ['--no-sandbox'] })
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } })
page.on('pageerror', (err) => console.log('PAGE ERROR:', err.message))

function listColumn(pg, listName) {
  const heading = pg.getByRole('heading', { name: listName, level: 2, exact: true })
  return heading.locator(
    'xpath=ancestor::div[contains(concat(" ", normalize-space(@class), " "), " bg-slate-50 ")][1]',
  )
}

async function waitForCardModal(pg, title, timeout = 5000) {
  await pg.waitForFunction(
    (expected) => document.querySelector('#card-title')?.value === expected,
    title,
    { timeout },
  )
}

let failures = 0

try {
  console.log('Signing up test user...')
  await page.goto(`${BASE}/signup`)
  await page.getByLabel('Nombre de usuario').fill(user.username)
  await page.getByLabel('Correo electrónico').fill(user.email)
  await page.getByLabel('Contraseña').fill(user.password)
  await page.getByRole('button', { name: 'Registrarse' }).click()
  await page.getByRole('heading', { name: 'Tus tableros' }).waitFor({ timeout: 15000 })

  console.log('Creating board + one list...')
  await page.getByRole('button', { name: '+ Crear nuevo tablero' }).click()
  await page.getByLabel('Nombre del tablero').fill('Scroll+Modal Verify Board')
  await page.getByRole('button', { name: 'Crear' }).click()
  await page.waitForURL(/\/boards\/[^/]+$/, { timeout: 15000 })

  await page.getByLabel('Nombre de la nueva lista').fill('Many Cards')
  await page.getByRole('button', { name: 'Agregar lista' }).click()
  await page.getByRole('heading', { name: 'Many Cards', level: 2, exact: true }).waitFor({ timeout: 10000 })
  await page.getByLabel('Nombre de la nueva lista').fill('Empty List')
  await page.getByRole('button', { name: 'Agregar lista' }).click()
  await page.getByRole('heading', { name: 'Empty List', level: 2, exact: true }).waitFor({ timeout: 10000 })

  // ============ T129: board page fixed height + internal list scroll ============
  console.log('\n=== T129: board page scroll ===')
  const col = listColumn(page, 'Many Cards')
  for (let i = 1; i <= 15; i++) {
    await col.getByRole('button', { name: '+ Agregar una tarjeta' }).click()
    await col.getByPlaceholder('Escribe un título para esta tarjeta').fill(`Card ${i}`)
    await col.getByRole('button', { name: 'Agregar tarjeta' }).click()
    await page.waitForTimeout(150)
  }
  await page.waitForTimeout(500)

  const pageScroll = await page.evaluate(() => ({
    docScrollHeight: document.documentElement.scrollHeight,
    docClientHeight: document.documentElement.clientHeight,
    bodyScrollHeight: document.body.scrollHeight,
  }))
  console.log('Page-level scroll:', JSON.stringify(pageScroll))
  const pageGrew = pageScroll.docScrollHeight - pageScroll.docClientHeight
  if (pageGrew > 4) {
    console.log(`FAIL: page grew taller by ${pageGrew}px after adding 15 cards to one list`)
    failures++
  } else {
    console.log('PASS: page height stayed fixed despite 15 cards in one list')
  }

  const colScrollInfo = await col.evaluate((el) => {
    const cardsWrapper = el.querySelector('.overflow-y-auto')
    if (!cardsWrapper) return null
    return { scrollHeight: cardsWrapper.scrollHeight, clientHeight: cardsWrapper.clientHeight }
  })
  console.log('"Many Cards" internal card-list scroll info:', JSON.stringify(colScrollInfo))
  if (!colScrollInfo || colScrollInfo.scrollHeight <= colScrollInfo.clientHeight + 4) {
    console.log('FAIL: "Many Cards" list does not appear to have internal overflow with 15 cards')
    failures++
  } else {
    console.log('PASS: "Many Cards" list has its own internal scrollable overflow')
  }

  const emptyColScrollInfo = await listColumn(page, 'Empty List').evaluate((el) => {
    const cardsWrapper = el.querySelector('.overflow-y-auto')
    if (!cardsWrapper) return null
    return { scrollHeight: cardsWrapper.scrollHeight, clientHeight: cardsWrapper.clientHeight }
  })
  console.log('"Empty List" internal scroll info (should show no overflow):', JSON.stringify(emptyColScrollInfo))

  await page.screenshot({ path: '/tmp/t129-board-scroll.png' })

  // dnd-kit sanity: drag Card 1 from "Many Cards" into "Empty List" still works
  console.log('\nSanity-checking drag-and-drop still works after the scroll fix...')
  const card1 = page.getByText('Card 1', { exact: true })
  await card1.scrollIntoViewIfNeeded()
  const sourceBox = await card1.boundingBox()
  const targetBox = await listColumn(page, 'Empty List').boundingBox()
  await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2)
  await page.mouse.down()
  await page.mouse.move(sourceBox.x + sourceBox.width / 2 + 15, sourceBox.y + sourceBox.height / 2 + 15, { steps: 5 })
  await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2, { steps: 10 })
  await page.mouse.up()
  await page.waitForTimeout(600)
  const movedCardVisible = await listColumn(page, 'Empty List')
    .getByRole('button')
    .filter({ hasText: 'Card 1' })
    .first()
    .isVisible()
    .catch(() => false)
  console.log(movedCardVisible ? 'PASS: drag-and-drop still works (Card 1 moved to Empty List)' : 'FAIL: drag-and-drop broken after scroll fix')
  if (!movedCardVisible) failures++

  // ============ T130-T137: card modal resize + collapsible fields + icons + animation ============
  console.log('\n=== T130-T137: card modal ===')
  const targetCard = page.getByText('Card 5', { exact: true })
  await targetCard.scrollIntoViewIfNeeded()
  await targetCard.click()
  await waitForCardModal(page, 'Card 5')

  const modalBox = await page.locator('#card-title').locator('xpath=ancestor::div[contains(@class,"rounded-2xl")][1]').boundingBox()
  const viewport = page.viewportSize()
  console.log('Modal box:', JSON.stringify(modalBox), 'viewport:', JSON.stringify(viewport))
  const widthRatio = modalBox.width / viewport.width
  const heightRatio = modalBox.height / viewport.height
  console.log(`Modal size ratio: ${(widthRatio * 100).toFixed(1)}% width x ${(heightRatio * 100).toFixed(1)}% height`)
  if (widthRatio < 0.45 || widthRatio > 0.75 || heightRatio < 0.45 || heightRatio > 0.75) {
    console.log('FAIL: modal is not roughly 60% of the screen')
    failures++
  } else {
    console.log('PASS: modal is roughly 60% of the screen')
  }
  const borderRadius = await page.locator('#card-title').locator('xpath=ancestor::div[contains(@class,"rounded-2xl")][1]').evaluate((el) => getComputedStyle(el).borderRadius)
  console.log('Modal border-radius (should be a small rectangle radius, not huge/circular):', borderRadius)

  await page.screenshot({ path: '/tmp/t130-modal-resized-empty.png' })

  console.log('\nSetting Inicio/Fin/Ubicación/Etiquetas/Checklist data on a fresh card...')
  await page.locator('button[aria-controls="card-field-panel-inicio"]').click()
  await page.waitForTimeout(400)
  await page.locator('#card-start-date').fill('2026-08-01T09:00')
  await page.waitForTimeout(300)
  await page.locator('button[aria-controls="card-field-panel-fin"]').click()
  await page.waitForTimeout(400)
  await page.locator('#card-end-date').fill('2026-08-01T10:00')
  await page.waitForTimeout(300)
  await page.locator('button[aria-controls="card-field-panel-ubicacion"]').click()
  await page.waitForTimeout(400)
  await page.context().grantPermissions(['geolocation'])
  await page.context().setGeolocation({ latitude: 19.4326, longitude: -99.1332 })
  await page.getByRole('button', { name: 'Usar mi ubicación actual' }).click()
  await page.waitForTimeout(800)
  await page.screenshot({ path: '/tmp/t130-fields-open.png' })

  console.log('\nClosing the card, reopening it, confirming data persisted and shows as "has data" before any click...')
  await page.getByRole('button', { name: 'Cerrar' }).click()
  await page.waitForTimeout(300)
  await targetCard.click()
  await waitForCardModal(page, 'Card 5')
  await page.waitForTimeout(500)

  const inicioBtn = page.locator('button[aria-controls="card-field-panel-inicio"]')
  const finBtn = page.locator('button[aria-controls="card-field-panel-fin"]')
  const ubicacionBtn = page.locator('button[aria-controls="card-field-panel-ubicacion"]')
  const [inicioClass, finClass, ubicacionClass] = await Promise.all([
    inicioBtn.getAttribute('class'),
    finBtn.getAttribute('class'),
    ubicacionBtn.getAttribute('class'),
  ])
  console.log('Inicio button reflects saved data (bg-slate-100, not bg-slate-50):', inicioClass?.includes('bg-slate-100'))
  console.log('Fin button reflects saved data:', finClass?.includes('bg-slate-100'))
  console.log('Ubicación button reflects saved data:', ubicacionClass?.includes('bg-slate-100'))
  if (!inicioClass?.includes('bg-slate-100') || !finClass?.includes('bg-slate-100') || !ubicacionClass?.includes('bg-slate-100')) {
    console.log('FAIL: at least one field with saved data does not show the "has data" indicator on mount')
    failures++
  } else {
    console.log('PASS: all three date/location fields show "has data" on mount, before any click')
  }

  // Panel content should NOT be visible/interactive before opening (collapsed)
  const startDateVisibleBeforeOpen = await page.locator('#card-start-date').isVisible()
  console.log('#card-start-date visible before opening Inicio panel (should be false, collapsed):', startDateVisibleBeforeOpen)

  console.log('\nOpening Inicio panel again to confirm saved value is still there...')
  await inicioBtn.click()
  await page.waitForTimeout(400)
  const startValue = await page.locator('#card-start-date').inputValue()
  console.log('Inicio value after reopen+close+reopen cycle:', startValue, '(expect 2026-08-01T09:00)')
  if (!startValue.startsWith('2026-08-01T09:00')) {
    console.log('FAIL: Inicio value did not persist correctly')
    failures++
  } else {
    console.log('PASS: Inicio value persisted correctly across the collapse/expand cycle')
  }

  console.log('\nOpening Etiquetas and Checklist, confirming they still function...')
  await page.locator('button[aria-controls="card-field-panel-etiquetas"]').click()
  await page.waitForTimeout(400)
  const etiquetasVisible = await page.getByText('Aún no hay etiquetas en este tablero.').isVisible().catch(() => false)
  console.log('Etiquetas panel content visible (no labels yet on this board):', etiquetasVisible)

  await page.locator('button[aria-controls="card-field-panel-checklist"]').click()
  await page.waitForTimeout(400)
  await page.getByLabel('Título de la nueva lista de verificación').fill('Verification checklist')
  await page.getByRole('button', { name: 'Agregar lista de verificación' }).click()
  await page.waitForTimeout(500)
  const checklistCreated = await page.getByText('Verification checklist', { exact: true }).isVisible().catch(() => false)
  console.log('Checklist created inside its collapsible panel:', checklistCreated)
  if (!checklistCreated) {
    console.log('FAIL: checklist creation inside the collapsible panel did not work')
    failures++
  } else {
    console.log('PASS: checklist creation works inside the collapsible panel')
  }

  await page.screenshot({ path: '/tmp/t130-multiple-panels-open.png' })

  // ============ icons ============
  console.log('\n=== Custom icons rendered (not letter placeholders) ===')
  const iconSrcs = await page.locator('button[aria-controls^="card-field-panel-"] img').evaluateAll((imgs) =>
    imgs.map((img) => img.getAttribute('src')),
  )
  console.log('Icon <img> src values found:', iconSrcs)
  const allFiveIconsPresent =
    iconSrcs.length === 5 && iconSrcs.every((src) => src && /\.svg/.test(src))
  console.log(allFiveIconsPresent ? 'PASS: all 5 field buttons render an <img> SVG icon (not a text placeholder)' : 'FAIL: expected 5 SVG icon images')
  if (!allFiveIconsPresent) failures++

  // ============ animation / reduced motion ============
  console.log('\n=== Animation respects prefers-reduced-motion ===')
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.reload()
  await page.waitForTimeout(500)
  const reducedMotionDuration = await page.evaluate(() => {
    const style = getComputedStyle(document.body)
    return style.transitionDuration
  })
  console.log('body transition-duration under prefers-reduced-motion:', reducedMotionDuration)

  // ============ mobile viewport re-check ============
  console.log('\n=== Modal still usable at phone viewport (375x812) ===')
  const mobilePage = await browser.newPage({ viewport: { width: 375, height: 812 } })
  await mobilePage.goto(page.url())
  await mobilePage.waitForTimeout(1000)
  const mobileOverflow = await mobilePage.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }))
  console.log('Mobile horizontal overflow check:', JSON.stringify(mobileOverflow))
  if (mobileOverflow.scrollWidth - mobileOverflow.clientWidth > 2) {
    console.log('FAIL: horizontal overflow at phone viewport')
    failures++
  } else {
    console.log('PASS: no horizontal overflow at phone viewport')
  }
  await mobilePage.screenshot({ path: '/tmp/t138-mobile-modal.png' })
  await mobilePage.close()

  console.log('\n\n========================================')
  console.log(`RESULT: ${failures} failure(s)`)
  console.log('========================================')
  if (failures > 0) process.exitCode = 1
} catch (err) {
  console.error('SCRIPT ERROR:', err)
  await page.screenshot({ path: '/tmp/t129-t138-error.png' }).catch(() => {})
  process.exitCode = 1
} finally {
  await browser.close()
}
