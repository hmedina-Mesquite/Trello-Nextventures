// Live verification of T119 (rebrand) + T128 (mobile-responsive redesign).
// Standalone chromium.launch() (bare `playwright`), same bypass-the-
// contended-MCP-browser technique as verify-t095-t102.mjs and friends.
import { chromium } from 'playwright'

const BASE = 'http://localhost:5173'
const unique = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
const user = {
  username: `mobile_${unique}`.toLowerCase().slice(0, 32),
  email: `mobile.${unique}@nextventures.mx`,
  password: 'TestPass123!',
}

const PHONE = { width: 375, height: 812 } // iPhone 12/13-ish

const browser = await chromium.launch({ args: ['--no-sandbox'] })
const page = await browser.newPage({ viewport: PHONE })
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

async function checkNoHorizontalOverflow(pg, label) {
  const { scrollWidth, clientWidth } = await pg.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }))
  const overflow = scrollWidth - clientWidth
  console.log(`  [overflow check: ${label}] scrollWidth=${scrollWidth} clientWidth=${clientWidth} ${overflow > 2 ? `OVERFLOW +${overflow}px` : 'OK'}`)
  return overflow <= 2
}

async function checkNoTrelloText(pg, label) {
  const bodyText = await pg.evaluate(() => document.body.innerText)
  const hasTrello = /trello/i.test(bodyText)
  console.log(`  [branding check: ${label}] ${hasTrello ? 'FOUND "Trello" TEXT' : 'OK, no "Trello" text'}`)
  return !hasTrello
}

let overflowFailures = 0
let brandingFailures = 0

try {
  // ============ T119: rebrand ============
  console.log('=== T119: rebrand checks ===')
  console.log('Title tag:', await page.title())

  await page.goto(`${BASE}/signup`)
  if (!(await checkNoTrelloText(page, 'signup page'))) brandingFailures++
  const signupHeading = await page.getByText('TAMS', { exact: true }).isVisible().catch(() => false)
  console.log('  "TAMS" visible on signup:', signupHeading)

  await page.getByLabel('Nombre de usuario').fill(user.username)
  await page.getByLabel('Correo electrónico').fill(user.email)
  await page.getByLabel('Contraseña').fill(user.password)
  await page.getByRole('button', { name: 'Registrarse' }).click()
  await page.getByRole('heading', { name: 'Tus tableros' }).waitFor({ timeout: 15000 })
  if (!(await checkNoTrelloText(page, 'dashboard (empty)'))) brandingFailures++
  if (!(await checkNoHorizontalOverflow(page, 'dashboard (empty)'))) overflowFailures++
  await page.screenshot({ path: '/tmp/t128-dashboard-empty.png' })

  console.log('\nChecking DocumentationPage branding...')
  await page.goto(`${BASE}/documentation`)
  await page.waitForTimeout(500)
  if (!(await checkNoTrelloText(page, 'documentation page'))) brandingFailures++
  if (!(await checkNoHorizontalOverflow(page, 'documentation page'))) overflowFailures++
  await page.screenshot({ path: '/tmp/t128-documentation.png' })

  // ============ T128: full mobile flow ============
  console.log('\n=== T128: mobile-responsive flow (375x812) ===')
  await page.goto(`${BASE}/`)
  await page.getByRole('heading', { name: 'Tus tableros' }).waitFor({ timeout: 10000 })

  console.log('\nCreating board...')
  await page.getByRole('button', { name: '+ Crear nuevo tablero' }).click()
  await page.getByLabel('Nombre del tablero').fill('Mobile Verify Board')
  await page.getByRole('button', { name: 'Crear' }).click()
  await page.waitForURL(/\/boards\/[^/]+$/, { timeout: 15000 })
  console.log('Board created:', page.url())
  if (!(await checkNoHorizontalOverflow(page, 'board page (empty, header+nav)'))) overflowFailures++
  await page.screenshot({ path: '/tmp/t128-board-header.png' })

  console.log('\nCreating two lists...')
  await page.getByLabel('Nombre de la nueva lista').fill('Por hacer')
  await page.getByRole('button', { name: 'Agregar lista' }).click()
  await page.getByRole('heading', { name: 'Por hacer', level: 2, exact: true }).waitFor({ timeout: 10000 })
  await page.getByLabel('Nombre de la nueva lista').fill('Hecho')
  await page.getByRole('button', { name: 'Agregar lista' }).click()
  await page.getByRole('heading', { name: 'Hecho', level: 2, exact: true }).waitFor({ timeout: 10000 })
  if (!(await checkNoHorizontalOverflow(page, 'kanban with 2 lists'))) overflowFailures++
  await page.screenshot({ path: '/tmp/t128-kanban-lists.png' })

  console.log('\nAdding a card...')
  const todoCol = listColumn(page, 'Por hacer')
  await todoCol.getByRole('button', { name: '+ Agregar una tarjeta' }).click()
  await todoCol.getByPlaceholder('Escribe un título para esta tarjeta').fill('Tarjeta móvil')
  await todoCol.getByRole('button', { name: 'Agregar tarjeta' }).click()
  await page.waitForTimeout(500)
  if (!(await checkNoHorizontalOverflow(page, 'kanban with a card'))) overflowFailures++

  console.log('\nOpening card detail modal...')
  await page.getByText('Tarjeta móvil', { exact: true }).click()
  await waitForCardModal(page, 'Tarjeta móvil')
  if (!(await checkNoHorizontalOverflow(page, 'card detail modal'))) overflowFailures++
  await page.screenshot({ path: '/tmp/t128-card-modal.png' })
  await page.locator('#card-start-date').fill('2026-08-01T09:00')
  await page.waitForTimeout(300)
  await page.locator('#card-end-date').fill('2026-08-01T10:00')
  await page.waitForTimeout(300)
  await page.context().grantPermissions(['geolocation'])
  await page.context().setGeolocation({ latitude: 19.4326, longitude: -99.1332 })
  await page.getByRole('button', { name: 'Usar mi ubicación actual' }).click()
  await page.waitForTimeout(800)
  await page.getByRole('button', { name: 'Cerrar' }).click()
  await page.waitForTimeout(300)

  // ============ view switcher across all views ============
  for (const [label, tabName] of [['Tabla', 'Tabla'], ['Cronología', 'Cronología'], ['Panel', 'Panel'], ['Mapa', 'Mapa']]) {
    console.log(`\n--- ${label} (mobile) ---`)
    await page.getByRole('button', { name: tabName, exact: true }).click()
    await page.waitForTimeout(1000)
    if (!(await checkNoHorizontalOverflow(page, `${label} view`))) overflowFailures++
    await page.screenshot({ path: `/tmp/t128-view-${label.toLowerCase()}.png` })
  }

  console.log('\nBack to Tablero...')
  await page.getByRole('button', { name: 'Tablero', exact: true }).click()
  await page.waitForTimeout(500)

  // ============ board settings panels ============
  for (const [label, buttonName] of [
    ['Etiquetas', 'Etiquetas'],
    ['Miembros', 'Miembros'],
    ['Fondo', 'Fondo'],
    ['Integraciones', 'Integraciones'],
  ]) {
    console.log(`\n--- Panel: ${label} (mobile) ---`)
    await page.getByRole('button', { name: buttonName, exact: true }).click()
    await page.waitForTimeout(500)
    if (!(await checkNoHorizontalOverflow(page, `${label} panel`))) overflowFailures++
    await page.screenshot({ path: `/tmp/t128-panel-${label.toLowerCase()}.png` })
    await page.getByRole('button', { name: 'Cerrar' }).click()
    await page.waitForTimeout(300)
  }

  console.log('\n--- Notifications bell (mobile) ---')
  await page.getByRole('button', { name: /notificaci/i }).click().catch(async () => {
    await page.locator('[aria-label*="otificaci"]').first().click()
  })
  await page.waitForTimeout(500)
  if (!(await checkNoHorizontalOverflow(page, 'notifications panel'))) overflowFailures++
  await page.screenshot({ path: '/tmp/t128-notifications.png' })

  console.log('\n\n========================================')
  console.log(`RESULT: ${overflowFailures} horizontal-overflow failures, ${brandingFailures} branding failures`)
  console.log('========================================')
  if (overflowFailures > 0 || brandingFailures > 0) process.exitCode = 1
} catch (err) {
  console.error('SCRIPT ERROR:', err)
  await page.screenshot({ path: '/tmp/t114-t128-error.png' }).catch(() => {})
  process.exitCode = 1
} finally {
  await browser.close()
}
