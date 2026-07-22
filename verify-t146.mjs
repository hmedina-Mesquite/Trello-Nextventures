// Live verification of T146: no full data refetch on a plain tab
// refocus/reopen, while an explicit reload or in-app navigation to a
// different board/page still refetches normally. Standalone
// chromium.launch() (bare `playwright`), same bypass-the-contended-MCP-
// browser technique as verify-t067.mjs / verify-t080-t088.mjs.
//
// Strategy: count outgoing Supabase REST requests tied to BoardPage's (and
// separately CalendarPage's) own data-load query, then:
//   1. simulate a tab refocus (second tab bringToFront + real bringToFront
//      back, PLUS a synthetic window 'focus' / document 'visibilitychange'
//      dispatch for good measure) -> assert the count does NOT increase.
//   2. do an explicit page.reload() -> assert the count DOES increase.
//   3. navigate in-app to a different board -> assert the count increases
//      again (fresh board, fresh fetch).
//   4. repeat the refocus/reload check on CalendarPage, which used to have
//      its own independent window 'focus' listener driving a refetch.
import { chromium } from 'playwright'

const BASE = 'http://localhost:5173'
const unique = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
const user = {
  username: `t146_${unique}`.toLowerCase().slice(0, 32),
  email: `t146.${unique}@nextventures.mx`,
  password: 'TestPass123!',
}

function assert(cond, msg) {
  if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`)
  console.log(`  OK: ${msg}`)
}

async function simulateTabRefocus(page, context) {
  const blank = await context.newPage()
  await blank.goto('about:blank')
  await blank.bringToFront()
  await page.waitForTimeout(500)
  await page.bringToFront()
  await page.waitForTimeout(300)
  // Extra, direct nudge per the task's suggested technique -- covers any gap
  // between headless bringToFront() and a real OS-level tab switch. Native
  // `visibilitychange` fires (bubbles: true) at `document` and propagates up
  // to `window` per the DOM spec's event-propagation rules for Document
  // targets (the one documented exception being `load`) -- supabase-js's own
  // internal listener is registered on `window`, so the synthetic dispatch
  // must set bubbles: true too or it never reaches it (confirmed empirically:
  // without it, this dispatch is a silent no-op against the real library).
  await page.evaluate(() => {
    window.dispatchEvent(new Event('focus'))
    document.dispatchEvent(new Event('visibilitychange', { bubbles: true }))
  })
  await page.waitForTimeout(1500)
  await blank.close()
}

const browser = await chromium.launch({ args: ['--no-sandbox'] })
const context = await browser.newContext({ viewport: { width: 1280, height: 800 } })
const page = await context.newPage()
page.on('pageerror', (err) => console.log('PAGE ERROR:', err.message))

let boardFetchCount = 0
let calendarFetchCount = 0
page.on('request', (req) => {
  if (req.method() !== 'GET') return
  const url = req.url()
  // The first query BoardPage's load() effect issues: supabase
  // .from('boards').select('*').eq('id', boardId).single().
  if (url.includes('/rest/v1/boards') && url.includes('id=eq.')) {
    boardFetchCount++
    console.log(`  [board fetch #${boardFetchCount}] ${url}`)
  }
  // The first query CalendarPage's load() issues: supabase
  // .from('board_members').select('board_id').eq('user_id', user.id).
  if (url.includes('/rest/v1/board_members') && url.includes('user_id=eq.')) {
    calendarFetchCount++
    console.log(`  [calendar fetch #${calendarFetchCount}] ${url}`)
  }
})

try {
  console.log('Signing up test user...')
  await page.goto(`${BASE}/signup`)
  await page.getByLabel('Nombre de usuario').fill(user.username)
  await page.getByLabel('Correo electrónico').fill(user.email)
  await page.getByLabel('Contraseña', { exact: true }).fill(user.password)
  await page.getByRole('button', { name: 'Registrarse' }).click()
  await page.getByRole('heading', { name: 'Tus tableros' }).waitFor({ timeout: 15000 })

  console.log('Creating board A...')
  await page.getByRole('button', { name: '+ Crear nuevo tablero' }).click()
  await page.getByLabel('Nombre del tablero').fill('T146 Board A')
  await page.getByRole('button', { name: 'Crear' }).click()
  await page.waitForURL(/\/boards\/[^/]+$/, { timeout: 15000 })
  await page.getByText('Cargando tablero…').waitFor({ state: 'hidden', timeout: 10000 }).catch(() => {})
  await page.getByPlaceholder('Agregar una lista').waitFor({ timeout: 10000 })
  await page.waitForTimeout(500)
  console.log('Board A URL:', page.url(), '- boardFetchCount:', boardFetchCount)
  // >=1 not ===1: React StrictMode (see main.tsx) intentionally double-invokes
  // effects in dev mode (mount -> cleanup -> mount again), so a fresh mount
  // can legitimately fire the load effect twice here -- that's a dev-only
  // React quirk, not the bug under test. Everything below compares deltas
  // against this settled baseline instead of hardcoding an absolute count.
  assert(boardFetchCount >= 1, 'at least 1 board fetch right after the initial board load')

  // ============ Scenario 1: tab refocus must NOT refetch ============
  console.log('\n--- Scenario 1: simulated tab refocus on BoardPage ---')
  const baselineAfterLoad = boardFetchCount
  await simulateTabRefocus(page, context)
  console.log('boardFetchCount after refocus:', boardFetchCount)
  assert(boardFetchCount === baselineAfterLoad, 'board fetch count unchanged after simulated tab refocus')

  // ============ Scenario 2: explicit reload MUST refetch ============
  console.log('\n--- Scenario 2: explicit page.reload() on BoardPage ---')
  await page.reload()
  await page.getByText('Cargando tablero…').waitFor({ state: 'hidden', timeout: 10000 }).catch(() => {})
  await page.getByPlaceholder('Agregar una lista').waitFor({ timeout: 10000 })
  await page.waitForTimeout(500)
  console.log('boardFetchCount after reload:', boardFetchCount)
  assert(boardFetchCount > baselineAfterLoad, 'board fetch count increased after an explicit page reload')
  const baselineAfterReload = boardFetchCount

  // ============ Scenario 3: in-app navigation to a different board MUST refetch ============
  console.log('\n--- Scenario 3: in-app navigation to a different board ---')
  await page.getByRole('link', { name: '← Tableros' }).click()
  await page.getByRole('heading', { name: 'Tus tableros' }).waitFor({ timeout: 10000 })
  await page.getByRole('button', { name: '+ Crear nuevo tablero' }).click()
  await page.getByLabel('Nombre del tablero').fill('T146 Board B')
  await page.getByRole('button', { name: 'Crear' }).click()
  await page.waitForURL(/\/boards\/[^/]+$/, { timeout: 15000 })
  await page.getByText('Cargando tablero…').waitFor({ state: 'hidden', timeout: 10000 }).catch(() => {})
  await page.getByPlaceholder('Agregar una lista').waitFor({ timeout: 10000 })
  await page.waitForTimeout(500)
  console.log('boardFetchCount after navigating to Board B:', boardFetchCount)
  assert(
    boardFetchCount > baselineAfterReload,
    'board fetch count increased after in-app navigation to a different board',
  )

  // ============ Scenario 4: CalendarPage refocus must NOT refetch either ============
  console.log('\n--- Scenario 4: simulated tab refocus on CalendarPage ---')
  await page.goto(`${BASE}/calendar`)
  await page.getByRole('heading', { name: 'Calendario', level: 1, exact: true }).waitFor({ timeout: 10000 })
  await page.getByText('Cargando calendario…').waitFor({ state: 'hidden', timeout: 10000 }).catch(() => {})
  await page.waitForTimeout(500)
  const calendarBaselineAfterLoad = calendarFetchCount
  assert(calendarBaselineAfterLoad >= 1, 'CalendarPage made its board_members fetch on mount')

  await simulateTabRefocus(page, context)
  console.log('calendarFetchCount after refocus:', calendarFetchCount)
  assert(
    calendarFetchCount === calendarBaselineAfterLoad,
    'calendar fetch count unchanged after simulated tab refocus',
  )

  // ============ Scenario 5: explicit reload on CalendarPage MUST refetch ============
  console.log('\n--- Scenario 5: explicit page.reload() on CalendarPage ---')
  await page.reload()
  await page.getByRole('heading', { name: 'Calendario', level: 1, exact: true }).waitFor({ timeout: 10000 })
  await page.getByText('Cargando calendario…').waitFor({ state: 'hidden', timeout: 10000 }).catch(() => {})
  await page.waitForTimeout(500)
  console.log('calendarFetchCount after reload:', calendarFetchCount)
  assert(
    calendarFetchCount > calendarBaselineAfterLoad,
    'calendar fetch count increased after an explicit page reload',
  )

  console.log('\nALL T146 SCENARIOS PASSED')
} catch (err) {
  console.error('SCRIPT ERROR:', err)
  await page.screenshot({ path: '/tmp/t146-error.png' }).catch(() => {})
  process.exitCode = 1
} finally {
  await browser.close()
}
