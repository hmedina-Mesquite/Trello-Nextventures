// Live verification of T067 sub-items 2-4 (sub-item 1 already verified, see
// T079): (2) edit a dated card's date from the calendar, confirm it moves to
// the new date bucket; (3) add a date to a previously-undated card via the
// board, confirm it appears on the calendar; (4) clear a card's date,
// confirm it disappears from the calendar. Standalone chromium.launch()
// (bare `playwright`), same bypass-the-contended-MCP-browser technique as
// verify-t095-t102.mjs / verify-t080-t088.mjs. Expects the dev server
// already running (checked via `lsof`/`curl` before writing this script;
// adjust BASE below if the port differs).
import { chromium } from 'playwright'

const BASE = 'http://localhost:5183'
const unique = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
const user = {
  username: `calver_${unique}`.toLowerCase().slice(0, 32),
  email: `calver.${unique}@nextventures.mx`,
  password: 'TestPass123!',
}

const CARD_A = 'Tarjeta calendario A'
const CARD_B = 'Tarjeta calendario B'

const browser = await chromium.launch({ args: ['--no-sandbox'] })
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } })
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

// A calendar month-grid cell: the div whose date-number span text matches
// `dayOfMonth` AND is styled as in-month (bg-white) -- disambiguates from
// padding cells at the head/tail of the grid that repeat day numbers from
// the previous/next month (those are bg-slate-50 instead). See
// CalendarPage.tsx's gridDays.map for the exact class logic mirrored here.
function dayCell(pg, dayOfMonth) {
  return pg.locator(
    `xpath=//div[contains(concat(" ", normalize-space(@class), " "), " bg-white ")]` +
      `[.//span[normalize-space(text())="${dayOfMonth}"]]`,
  )
}

function assert(cond, msg) {
  if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`)
  console.log(`  OK: ${msg}`)
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
  await page.getByLabel('Nombre del tablero').fill('Calendar T067 Verify Board')
  await page.getByRole('button', { name: 'Crear' }).click()
  await page.waitForURL(/\/boards\/[^/]+$/, { timeout: 15000 })
  const boardUrl = page.url()
  console.log('Board created:', boardUrl)

  console.log('Creating list...')
  await page.getByLabel('Nombre de la nueva lista').fill('Tareas')
  await page.getByRole('button', { name: 'Agregar lista' }).click()
  await page.getByRole('heading', { name: 'Tareas', level: 2, exact: true }).waitFor({ timeout: 10000 })

  const col = listColumn(page, 'Tareas')

  console.log(`Creating card "${CARD_A}"...`)
  await col.getByRole('button', { name: '+ Agregar una tarjeta' }).click()
  await col.getByPlaceholder('Escribe un título para esta tarjeta').fill(CARD_A)
  await col.getByRole('button', { name: 'Agregar tarjeta' }).click()
  await page.waitForTimeout(500)

  console.log(`Creating card "${CARD_B}" (no date)...`)
  await col.getByRole('button', { name: '+ Agregar una tarjeta' }).click()
  await col.getByPlaceholder('Escribe un título para esta tarjeta').fill(CARD_B)
  await col.getByRole('button', { name: 'Agregar tarjeta' }).click()
  await page.waitForTimeout(500)

  console.log(`Opening "${CARD_A}" to set an initial start date (2026-07-05)...`)
  await col.getByText(CARD_A, { exact: true }).click()
  await waitForCardModal(page, CARD_A)
  await page.locator('#card-start-date').fill('2026-07-05T10:00')
  await page.waitForTimeout(500)
  await page.getByRole('button', { name: 'Cerrar' }).click()
  await page.waitForTimeout(300)

  // ============ Sub-item 1 sanity re-check (already verified per T079, but
  // cheap to re-confirm here since we're already set up) ============
  console.log('\n--- Navigating to /calendar ---')
  await page.goto(`${BASE}/calendar`)
  await page.getByRole('heading', { name: 'Calendario', level: 1, exact: true }).waitFor({ timeout: 10000 })
  // Wait for the loading state to clear.
  await page.getByText('Cargando calendario…').waitFor({ state: 'hidden', timeout: 10000 }).catch(() => {})

  console.log('\n--- Baseline: Card A on July 5, Card B absent ---')
  await dayCell(page, '5').getByRole('button', { name: CARD_A, exact: true }).waitFor({ timeout: 10000 })
  assert(true, `"${CARD_A}" appears in the July 5 cell`)
  const cardBCountBaseline = await page.getByRole('button', { name: CARD_B, exact: true }).count()
  assert(cardBCountBaseline === 0, `"${CARD_B}" (no date) does not appear anywhere on the calendar`)

  // ============ Sub-item 2: edit a dated card's date FROM the calendar,
  // confirm it moves to the new date bucket ============
  console.log('\n--- Sub-item 2: edit Card A\'s date from the calendar (2026-07-05 -> 2026-07-15) ---')
  await dayCell(page, '5').getByRole('button', { name: CARD_A, exact: true }).click()
  await waitForCardModal(page, CARD_A)
  await page.locator('#card-start-date').fill('2026-07-15T14:00')
  await page.waitForTimeout(500)
  await page.getByRole('button', { name: 'Cerrar' }).click()
  await page.waitForTimeout(300)

  await dayCell(page, '15').getByRole('button', { name: CARD_A, exact: true }).waitFor({ timeout: 10000 })
  assert(true, `"${CARD_A}" now appears in the July 15 cell`)
  const cardAInOldCell = await dayCell(page, '5').getByRole('button', { name: CARD_A, exact: true }).count()
  assert(cardAInOldCell === 0, `"${CARD_A}" no longer appears in the July 5 cell`)
  await page.screenshot({ path: '/tmp/t067-subitem2-moved.png' })

  // ============ Sub-item 3: add a date to a previously-undated card (via
  // the board), confirm it appears on the calendar ============
  console.log('\n--- Sub-item 3: add a date to Card B via the board, confirm it appears on the calendar ---')
  await page.goto(boardUrl)
  await page.getByRole('heading', { name: 'Tareas', level: 2, exact: true }).waitFor({ timeout: 10000 })
  await listColumn(page, 'Tareas').getByText(CARD_B, { exact: true }).click()
  await waitForCardModal(page, CARD_B)
  await page.locator('#card-start-date').fill('2026-07-10T09:00')
  await page.waitForTimeout(500)
  await page.getByRole('button', { name: 'Cerrar' }).click()
  await page.waitForTimeout(300)

  await page.goto(`${BASE}/calendar`)
  await page.getByText('Cargando calendario…').waitFor({ state: 'hidden', timeout: 10000 }).catch(() => {})
  await dayCell(page, '10').getByRole('button', { name: CARD_B, exact: true }).waitFor({ timeout: 10000 })
  assert(true, `"${CARD_B}" now appears in the July 10 cell after gaining a start date`)
  await page.screenshot({ path: '/tmp/t067-subitem3-added.png' })

  // ============ Sub-item 4: clear a card's date, confirm it disappears
  // from the calendar ============
  console.log('\n--- Sub-item 4: clear Card B\'s date from the calendar, confirm it disappears ---')
  await dayCell(page, '10').getByRole('button', { name: CARD_B, exact: true }).click()
  await waitForCardModal(page, CARD_B)
  await page.getByRole('button', { name: 'Quitar' }).first().click()
  await page.waitForTimeout(500)
  await page.getByRole('button', { name: 'Cerrar' }).click()
  await page.waitForTimeout(300)

  const cardBCountAfterClear = await page.getByRole('button', { name: CARD_B, exact: true }).count()
  assert(cardBCountAfterClear === 0, `"${CARD_B}" no longer appears anywhere on the calendar after clearing its date`)
  await page.screenshot({ path: '/tmp/t067-subitem4-cleared.png' })

  console.log('\nALL T067 SUB-ITEMS (2/3/4) PASSED')
} catch (err) {
  console.error('SCRIPT ERROR:', err)
  await page.screenshot({ path: '/tmp/t067-error.png' }).catch(() => {})
  process.exitCode = 1
} finally {
  await browser.close()
}
