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
    email: `${label}.${unique}@example.test`,
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
  await page.getByLabel('Username').fill(user.username)
  await page.getByLabel('Email').fill(user.email)
  await page.getByLabel('Password').fill(user.password)
  await page.getByRole('button', { name: 'Sign up' }).click()
  await expect(
    page.getByRole('heading', { name: 'Your boards' }),
    'expected redirect to the dashboard after signup -- if this fails, check whether the Supabase project requires email confirmation (SignupPage shows an info message instead of navigating in that case)',
  ).toBeVisible()
}

export async function login(page: Page, user: Pick<TestUser, 'email' | 'password'>) {
  await page.goto('/login')
  await page.getByLabel('Email').fill(user.email)
  await page.getByLabel('Password').fill(user.password)
  await page.getByRole('button', { name: 'Log in' }).click()
  await expect(page.getByRole('heading', { name: 'Your boards' })).toBeVisible()
}

export async function logout(page: Page) {
  await page.getByRole('button', { name: 'Sign out' }).click()
  await expect(page).toHaveURL(/\/login$/)
}

/** From the dashboard: creates a board, follows the app's redirect into it, and returns its id. */
export async function createBoard(page: Page, name: string): Promise<string> {
  await page.getByRole('button', { name: '+ Create new board' }).click()
  await page.getByLabel('Board name').fill(name)
  await page.getByRole('button', { name: 'Create' }).click()
  await expect(page).toHaveURL(/\/boards\/[^/]+$/)
  await expect(page.getByRole('heading', { name, level: 1 })).toBeVisible()
  return page.url().split('/boards/')[1]
}

/** The ListColumn container (src/components/ListColumn.tsx) for a given list name, found via its <h2> ancestor. */
export function listColumn(page: Page, listName: string): Locator {
  const heading = page.getByRole('heading', { name: listName, level: 2, exact: true })
  return heading.locator(
    'xpath=ancestor::div[contains(concat(" ", normalize-space(@class), " "), " bg-gray-100 ")][1]',
  )
}

export async function addList(page: Page, listName: string) {
  await page.getByLabel('New list name').fill(listName)
  await page.getByRole('button', { name: 'Add list' }).click()
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
 */
export function cardItem(page: Page, listName: string, cardTitle: string): Locator {
  return listColumn(page, listName)
    .getByRole('button')
    .filter({ hasText: new RegExp(`^${escapeRegExp(cardTitle)}$`) })
}

export async function addCard(page: Page, listName: string, cardTitle: string) {
  const column = listColumn(page, listName)
  await column.getByRole('button', { name: '+ Add a card' }).click()
  await column.getByPlaceholder('Enter a title for this card').fill(cardTitle)
  await column.getByRole('button', { name: 'Add card' }).click()
  await expect(cardItem(page, listName, cardTitle)).toBeVisible()
}

export async function openCard(page: Page, listName: string, cardTitle: string) {
  await cardItem(page, listName, cardTitle).click()
  await expect(page.getByLabel('Card title')).toBeVisible()
}

export async function closeCardModal(page: Page) {
  await page.getByRole('button', { name: 'Close' }).click()
}

export async function openLabelsPanel(page: Page) {
  await page.getByRole('button', { name: 'Labels' }).click()
  await expect(page.getByRole('heading', { name: 'Labels' })).toBeVisible()
}

export async function openMembersPanel(page: Page) {
  await page.getByRole('button', { name: 'Members' }).click()
  await expect(page.getByRole('heading', { name: 'Members' })).toBeVisible()
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
