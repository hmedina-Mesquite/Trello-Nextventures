// Live verification of T097-T102: the per-board view switcher (Tablero/
// Tabla/Calendario/Cronología/Panel/Mapa) and the four new view
// implementations. Standalone chromium.launch() (bare `playwright`), same
// bypass-the-contended-MCP-browser technique as verify-t080-t088.mjs.
import { chromium } from 'playwright'

const BASE = 'http://localhost:5173'
const unique = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
const user = {
  username: `viewer_${unique}`.toLowerCase().slice(0, 32),
  email: `viewer.${unique}@nextventures.mx`,
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

// CardDetailModal renders the title as an editable <input>, not a heading --
// wait for #card-title's value to match instead of a role=heading lookup.
async function waitForCardModal(pg, title, timeout = 5000) {
  await pg.waitForFunction(
    (expected) => document.querySelector('#card-title')?.value === expected,
    title,
    { timeout },
  )
}

try {
  console.log('Signing up test user...')
  await page.goto(`${BASE}/signup`)
  await page.getByLabel('Nombre de usuario').fill(user.username)
  await page.getByLabel('Correo electrónico').fill(user.email)
  await page.getByLabel('Contraseña').fill(user.password)
  await page.getByRole('button', { name: 'Registrarse' }).click()
  await page.getByRole('heading', { name: 'Tus tableros' }).waitFor({ timeout: 15000 })

  console.log('Creating board...')
  await page.getByRole('button', { name: '+ Crear nuevo tablero' }).click()
  await page.getByLabel('Nombre del tablero').fill('View Switcher Verify Board')
  await page.getByRole('button', { name: 'Crear' }).click()
  await page.waitForURL(/\/boards\/[^/]+$/, { timeout: 15000 })
  console.log('Board created:', page.url())

  console.log('Creating two lists...')
  await page.getByLabel('Nombre de la nueva lista').fill('Por hacer')
  await page.getByRole('button', { name: 'Agregar lista' }).click()
  await page.getByRole('heading', { name: 'Por hacer', level: 2, exact: true }).waitFor({ timeout: 10000 })
  await page.getByLabel('Nombre de la nueva lista').fill('Hecho')
  await page.getByRole('button', { name: 'Agregar lista' }).click()
  await page.getByRole('heading', { name: 'Hecho', level: 2, exact: true }).waitFor({ timeout: 10000 })

  console.log('Adding cards...')
  const todoCol = listColumn(page, 'Por hacer')
  await todoCol.getByRole('button', { name: '+ Agregar una tarjeta' }).click()
  await todoCol.getByPlaceholder('Escribe un título para esta tarjeta').fill('Tarjeta con fecha')
  await todoCol.getByRole('button', { name: 'Agregar tarjeta' }).click()
  await page.waitForTimeout(500)

  await todoCol.getByRole('button', { name: '+ Agregar una tarjeta' }).click()
  await todoCol.getByPlaceholder('Escribe un título para esta tarjeta').fill('Tarjeta sin fecha')
  await todoCol.getByRole('button', { name: 'Agregar tarjeta' }).click()
  await page.waitForTimeout(500)

  console.log('Opening "Tarjeta con fecha" to set start/end dates and complete...')
  // Click the title text itself, not the card's whole button-role wrapper --
  // that wrapper also contains the completion checkmark as a nested real
  // <button> in its top-right corner, and a click on the wrapper's bounding-
  // box center can land on the checkmark instead of opening the modal.
  await page.getByText('Tarjeta con fecha', { exact: true }).click()
  await waitForCardModal(page, 'Tarjeta con fecha')
  await page.locator('#card-start-date').fill('2026-08-01T09:00')
  await page.waitForTimeout(300)
  await page.locator('#card-end-date').fill('2026-08-01T10:00')
  await page.waitForTimeout(300)

  console.log('Setting a location via geolocation mock...')
  await page.context().grantPermissions(['geolocation'])
  await page.context().setGeolocation({ latitude: 19.4326, longitude: -99.1332 })
  await page.getByRole('button', { name: 'Usar mi ubicación actual' }).click()
  await page.waitForTimeout(800)
  const locationText = await page.getByText(/19\.4326|19\.43260/).first().textContent().catch(() => null)
  console.log('Location saved, shown as:', locationText)

  await page.getByRole('button', { name: 'Cerrar' }).click()
  await page.waitForTimeout(300)

  console.log('Reopening "Tarjeta con fecha" to confirm the location persisted (not just shown optimistically)...')
  await page.getByText('Tarjeta con fecha', { exact: true }).click()
  await waitForCardModal(page, 'Tarjeta con fecha')
  const reopenedLocText = await page.getByText(/19\.4326/).first().textContent().catch(() => 'NOT FOUND')
  console.log('Location on reopen:', reopenedLocText)
  await page.getByRole('button', { name: 'Cerrar' }).click()
  await page.waitForTimeout(300)

  console.log('Marking "Tarjeta sin fecha" complete from the board face...')
  await page
    .getByRole('button').filter({ hasText: /^Tarjeta sin fecha/ }).first()
    .getByRole('button', { name: 'Marcar como completada', exact: true })
    .click()
  await page.waitForTimeout(500)

  // ============ view switcher ============
  console.log('\n--- Switcher: all six labels present ---')
  for (const label of ['Tablero', 'Tabla', 'Calendario', 'Cronología', 'Panel', 'Mapa']) {
    const visible = await page.getByRole(label === 'Calendario' ? 'link' : 'button', { name: label }).isVisible()
    console.log(`  ${label}: ${visible ? 'OK' : 'MISSING'}`)
  }

  // ============ Tabla ============
  console.log('\n--- Tabla ---')
  await page.getByRole('button', { name: 'Tabla', exact: true }).click()
  await page.getByRole('cell', { name: 'Tarjeta con fecha' }).waitFor({ timeout: 5000 })
  const rowCount = await page.locator('table tbody tr').count()
  console.log('Table rows:', rowCount, '(expect 2)')
  const estadoCheck = await page
    .locator('table tbody tr')
    .filter({ hasText: 'Tarjeta sin fecha' })
    .locator('td')
    .last()
    .textContent()
  console.log('Estado cell for completed card:', JSON.stringify(estadoCheck?.trim()), '(expect ✓)')
  await page.screenshot({ path: '/tmp/t098-tabla.png' })
  console.log('Clicking row to open card detail...')
  await page.locator('table tbody tr').filter({ hasText: 'Tarjeta con fecha' }).click()
  await waitForCardModal(page, 'Tarjeta con fecha')
  await page.getByRole('button', { name: 'Cerrar' }).click()

  // ============ Cronología ============
  console.log('\n--- Cronología ---')
  await page.getByRole('button', { name: 'Cronología', exact: true }).click()
  await page.getByRole('button', { name: 'Tarjeta con fecha' }).waitFor({ timeout: 5000 })
  console.log('Timeline bar for dated card rendered.')
  await page.screenshot({ path: '/tmp/t099-cronologia.png' })
  await page.getByRole('button', { name: 'Tarjeta con fecha' }).click()
  await waitForCardModal(page, 'Tarjeta con fecha')
  await page.getByRole('button', { name: 'Cerrar' }).click()

  // ============ Panel ============
  console.log('\n--- Panel ---')
  await page.getByRole('button', { name: 'Panel', exact: true }).click()
  await page.getByText('Total de tarjetas').waitFor({ timeout: 5000 })
  const totalText = await page.getByText('Total de tarjetas').locator('xpath=following-sibling::p[1]').textContent()
  const pctText = await page.getByText('% Completadas').locator('xpath=following-sibling::p[1]').textContent()
  console.log('Total de tarjetas:', totalText?.trim(), '(expect 2)')
  console.log('% Completadas:', pctText?.trim(), '(expect 50%, 1 of 2 complete)')
  await page.screenshot({ path: '/tmp/t100-panel.png' })

  // ============ Mapa ============
  console.log('\n--- Mapa ---')
  await page.getByRole('button', { name: 'Mapa', exact: true }).click()
  await page.locator('.leaflet-marker-icon').waitFor({ timeout: 8000 })
  const markerCount = await page.locator('.leaflet-marker-icon').count()
  console.log('Leaflet markers rendered:', markerCount, '(expect 1)')
  await page.waitForTimeout(1500) // let map tiles finish loading before screenshotting
  await page.screenshot({ path: '/tmp/t101-mapa.png' })
  console.log('Clicking marker to open card detail...')
  await page.locator('.leaflet-marker-icon').click()
  await waitForCardModal(page, 'Tarjeta con fecha')
  await page.getByRole('button', { name: 'Cerrar' }).click()

  // Mapa empty-state check on a board with no located cards
  console.log('\n--- Mapa empty state (new board) ---')
  await page.goto(`${BASE}/`)
  await page.getByRole('heading', { name: 'Tus tableros' }).waitFor({ timeout: 10000 })
  await page.getByRole('button', { name: '+ Crear nuevo tablero' }).click()
  await page.getByLabel('Nombre del tablero').fill('Empty Mapa Board')
  await page.getByRole('button', { name: 'Crear' }).click()
  await page.waitForURL(/\/boards\/[^/]+$/, { timeout: 15000 })
  await page.getByRole('button', { name: 'Mapa', exact: true }).click()
  await page.getByText('No hay tarjetas con ubicación').waitFor({ timeout: 5000 })
  console.log('Empty state rendered correctly.')

  // ============ Calendario still navigates away ============
  console.log('\n--- Calendario still a separate page ---')
  await page.getByRole('link', { name: 'Calendario' }).click()
  await page.waitForURL(/\/calendar$/, { timeout: 10000 })
  console.log('Navigated to', page.url())

  console.log('\nDONE')
} catch (err) {
  console.error('SCRIPT ERROR:', err)
  await page.screenshot({ path: '/tmp/t095-t102-error.png' }).catch(() => {})
  process.exitCode = 1
} finally {
  await browser.close()
}
