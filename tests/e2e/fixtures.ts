// Shared helpers for the e2e suite. Selectors here are matched to the actual
// rendered markup (read from src/ before writing this file) rather than
// guessed -- if a selector here stops matching, the app's markup changed and
// this file needs updating, not the other way around.
import { expect, type Locator, type Page } from '@playwright/test'

export interface TestUser {
  username: string
  email: string
  password: string
}

let counter = 0

/** Randomized so reruns (and parallel workers) against a real backend never collide. */
export function makeTestUser(label = 'user'): TestUser {
  const unique = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${counter++}`
  return {
    // profiles.username presumably has a uniqueness/format constraint (see
    // supabase/migrations) -- keep it short, lowercase-friendly, no spaces.
    username: `${label}_${unique}`.toLowerCase().slice(0, 32),
    // Domain must be on the allowlist enforced both client-side
    // (SignupPage.tsx) and in the DB trigger (see
    // supabase/migrations/20260714120009_email_domain_allowlist.sql) -- any
    // other domain gets rejected before a session is ever created.
    email: `${label}.${unique}@nextventures.mx`,
    password: 'TestPass123!',
  }
}

/**
 * Signs up a brand-new user via /signup and waits for the dashboard.
 *
 * NOTE: SignupPage (src/pages/SignupPage.tsx) only navigates to '/' if
 * `supabase.auth.getSession()` resolves with a session right after signUp()
 * -- i.e. the Supabase project has "Confirm email" disabled (the common
 * dev/test default). If confirmation is required instead, the page shows an
 * info message and never navigates, and this helper's assertion below will
 * fail with a clear message rather than hanging.
 */
export async function signUp(page: Page, user: TestUser) {
  await page.goto('/signup')
  await page.getByLabel('Nombre de usuario').fill(user.username)
  await page.getByLabel('Correo electrónico').fill(user.email)
  await page.getByLabel('Contraseña').fill(user.password)
  await page.getByRole('button', { name: 'Registrarse' }).click()
  await expect(
    page.getByRole('heading', { name: 'Tus tableros' }),
    'expected redirect to the dashboard after signup -- if this fails, check whether the Supabase project requires email confirmation (SignupPage shows an info message instead of navigating in that case)',
  ).toBeVisible()
}

export async function login(page: Page, user: Pick<TestUser, 'email' | 'password'>) {
  await page.goto('/login')
  await page.getByLabel('Correo electrónico').fill(user.email)
  await page.getByLabel('Contraseña').fill(user.password)
  await page.getByRole('button', { name: 'Iniciar sesión' }).click()
  await expect(page.getByRole('heading', { name: 'Tus tableros' })).toBeVisible()
}

export async function logout(page: Page) {
  await page.getByRole('button', { name: 'Cerrar sesión' }).click()
  await expect(page).toHaveURL(/\/login$/)
}

/** From the dashboard: creates a board, follows the app's redirect into it, and returns its id. */
export async function createBoard(page: Page, name: string): Promise<string> {
  await page.getByRole('button', { name: '+ Crear nuevo tablero' }).click()
  await page.getByLabel('Nombre del tablero').fill(name)
  await page.getByRole('button', { name: 'Crear' }).click()
  await expect(page).toHaveURL(/\/boards\/[^/]+$/)
  await expect(page.getByRole('heading', { name, level: 1 })).toBeVisible()
  return page.url().split('/boards/')[1]
}

/** The ListColumn container (src/components/ListColumn.tsx) for a given list name, found via its <h2> ancestor. */
export function listColumn(page: Page, listName: string): Locator {
  const heading = page.getByRole('heading', { name: listName, level: 2, exact: true })
  return heading.locator(
    'xpath=ancestor::div[contains(concat(" ", normalize-space(@class), " "), " bg-slate-50 ")][1]',
  )
}

export async function addList(page: Page, listName: string) {
  await page.getByLabel('Nombre de la nueva lista').fill(listName)
  await page.getByRole('button', { name: 'Agregar lista' }).click()
  await expect(listColumn(page, listName)).toBeVisible()
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * The CardItem button (src/components/CardItem.tsx) for a card, scoped to its
 * list. Matched by textContent (`hasText`) rather than `getByRole(...,
 * {name})` -- once a label is assigned, CardItem renders an empty
 * `<span title={label.name}>` pill alongside the title, and some
 * accessible-name computations fold a childless element's `title` attribute
 * into its ancestor's aggregate name, which would make an exact accessible-
 * name match brittle after the "assign a label" step. textContent is
 * unaffected by `title` attributes, so it stays exact.
 *
 * The button also renders a trailing "created at" timestamp (see
 * `card.created_at` in CardItem.tsx) directly after the title, so the regex
 * allows an optional `\s*\d.*` tail for that timestamp instead of anchoring
 * on the title alone -- otherwise it'd never match any card.
 */
export function cardItem(page: Page, listName: string, cardTitle: string): Locator {
  return listColumn(page, listName)
    .getByRole('button')
    .filter({ hasText: new RegExp(`^${escapeRegExp(cardTitle)}(\\s*\\d.*)?$`) })
}

export async function addCard(page: Page, listName: string, cardTitle: string) {
  const column = listColumn(page, listName)
  await column.getByRole('button', { name: '+ Agregar una tarjeta' }).click()
  await column.getByPlaceholder('Escribe un título para esta tarjeta').fill(cardTitle)
  await column.getByRole('button', { name: 'Agregar tarjeta' }).click()
  await expect(cardItem(page, listName, cardTitle)).toBeVisible()
}

export async function openCard(page: Page, listName: string, cardTitle: string) {
  await cardItem(page, listName, cardTitle).click()
  await expect(page.getByLabel('Título de la tarjeta')).toBeVisible()
}

export async function closeCardModal(page: Page) {
  await page.getByRole('button', { name: 'Cerrar' }).click()
}

/**
 * Inicio/Fin/Ubicación/Etiquetas/Lista de verificación are collapsed by
 * default inside the card modal (T130) -- their content isn't interactable
 * until the matching toggle button is opened. Scoped by `aria-controls`
 * rather than accessible name for consistency with the other fields.
 */
export async function openCardField(
  page: Page,
  field: 'inicio' | 'fin' | 'ubicacion' | 'etiquetas' | 'checklist',
) {
  await page.locator(`button[aria-controls="card-field-panel-${field}"]`).click()
}

export async function openMembersPanel(page: Page) {
  await page.getByRole('button', { name: 'Miembros' }).click()
  await expect(page.getByRole('heading', { name: 'Miembros' })).toBeVisible()
}

/**
 * Drags `source` onto `target` using a manual multi-step pointer sequence.
 *
 * BoardPage.tsx configures dnd-kit's PointerSensor with
 * `activationConstraint: { distance: 8 }` (see the `useSensors(useSensor(...))`
 * call), meaning a drag is only recognized once the pointer has moved more
 * than 8px past its mousedown position. Playwright's `locator.dragTo()` does
 * a single mousedown -> mousemove -> mouseup and in practice does not
 * reliably clear that activation distance with enough intermediate
 * pointermove events for dnd-kit's collision detection (closestCorners) to
 * register the hover target mid-drag -- so we drive the mouse manually
 * instead: an initial small move well past 8px to trigger activation, then
 * a stepped move to the target, then release.
 */
export async function dragTo(page: Page, source: Locator, target: Locator) {
  const sourceBox = await source.boundingBox()
  const targetBox = await target.boundingBox()
  if (!sourceBox || !targetBox) {
    throw new Error('dragTo: source or target element has no bounding box (not visible/attached)')
  }

  const startX = sourceBox.x + sourceBox.width / 2
  const startY = sourceBox.y + sourceBox.height / 2
  const endX = targetBox.x + targetBox.width / 2
  const endY = targetBox.y + targetBox.height / 2

  await page.mouse.move(startX, startY)
  await page.mouse.down()
  // Clear dnd-kit's 8px activation distance first, or "dragging" never starts.
  await page.mouse.move(startX + 15, startY + 15, { steps: 5 })
  await page.mouse.move((startX + endX) / 2, (startY + endY) / 2, { steps: 10 })
  await page.mouse.move(endX, endY, { steps: 10 })
  await page.mouse.up()
}

/** Registers auto-accept for the window.confirm() dialogs the app uses for every delete action. */
export function autoAcceptDialogs(page: Page) {
  page.on('dialog', (dialog) => {
    void dialog.accept()
  })
}
