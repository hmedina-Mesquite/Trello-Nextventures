// T029: end-to-end coverage of the critical single-user flow -- board/list/
// card CRUD, drag-and-drop (both reorder-within-list and move-to-another-list),
// labels, checklists, comments, and finally tearing everything back down
// (delete card, list, board). Written as one long test with test.step()
// sections because each step depends on state the previous step created;
// splitting into independent `test()`s would just mean re-deriving the same
// board/list/card setup every time.
import { test, expect } from '@playwright/test'
import {
  addCard,
  addList,
  autoAcceptDialogs,
  cardItem,
  closeCardModal,
  createBoard,
  dragTo,
  listColumn,
  makeTestUser,
  openCard,
  openLabelsPanel,
  signUp,
} from './fixtures'

test.describe('critical user flow', () => {
  test('signup through board/list/card CRUD, DnD, labels, checklists, comments, and cleanup', async ({
    page,
  }) => {
    autoAcceptDialogs(page)
    const user = makeTestUser('flow')
    const boardName = `Flow Board ${Date.now()}`

    await test.step('signup lands on dashboard', async () => {
      await signUp(page, user)
    })

    let boardId = ''
    await test.step('create a board', async () => {
      boardId = await createBoard(page, boardName)
    })

    await test.step('the board appears on the dashboard, and can be reopened', async () => {
      await page.goto('/')
      const boardLink = page.getByRole('link', { name: boardName })
      await expect(boardLink).toBeVisible()
      await boardLink.click()
      await expect(page).toHaveURL(new RegExp(`/boards/${boardId}$`))
    })

    await test.step('create two lists', async () => {
      await addList(page, 'To Do')
      await addList(page, 'Doing')
    })

    await test.step('create two cards in the first list', async () => {
      await addCard(page, 'To Do', 'Card A')
      await addCard(page, 'To Do', 'Card B')
    })

    await test.step('open a card and edit its title and description', async () => {
      await openCard(page, 'To Do', 'Card A')
      const titleInput = page.getByLabel('Card title')
      await titleInput.fill('Card A edited')
      await titleInput.blur()
      const descriptionInput = page.getByLabel('Description')
      await descriptionInput.fill('A description added during the e2e flow test.')
      await descriptionInput.blur()
      await closeCardModal(page)
      await expect(cardItem(page, 'To Do', 'Card A edited')).toBeVisible()
    })

    await test.step('drag a card to reorder it within the same list', async () => {
      // "Card B" starts after "Card A edited"; drag it to the first slot.
      await dragTo(page, cardItem(page, 'To Do', 'Card B'), cardItem(page, 'To Do', 'Card A edited'))
      const cardTitlesInOrder = await listColumn(page, 'To Do').getByRole('button').allTextContents()
      const firstCardText = cardTitlesInOrder.find((t) => t.includes('Card A edited') || t.includes('Card B'))
      expect(firstCardText).toContain('Card B')
    })

    await test.step('drag a card into the other (empty) list', async () => {
      await dragTo(page, cardItem(page, 'To Do', 'Card A edited'), listColumn(page, 'Doing'))
      await expect(cardItem(page, 'Doing', 'Card A edited')).toBeVisible()
      await expect(cardItem(page, 'To Do', 'Card A edited')).toHaveCount(0)
    })

    await test.step('create a label and assign it to a card', async () => {
      await openLabelsPanel(page)
      await page.getByLabel('Label name').fill('Bug')
      await page.getByRole('button', { name: 'Choose color green' }).click()
      await page.getByRole('button', { name: 'Add label' }).click()
      await expect(page.getByText('Bug', { exact: true })).toBeVisible()
      await page.getByRole('button', { name: 'Close' }).click()

      await openCard(page, 'Doing', 'Card A edited')
      await page.getByRole('button', { name: 'Bug' }).click() // toggles assignment on
      await closeCardModal(page)
      await expect(cardItem(page, 'Doing', 'Card A edited').locator('span[title="Bug"]')).toBeVisible()
    })

    await test.step('add a checklist with items and toggle completion', async () => {
      await openCard(page, 'Doing', 'Card A edited')
      await page.getByLabel('New checklist title').fill('Checklist 1')
      await page.getByRole('button', { name: 'Add checklist' }).click()

      await page.getByPlaceholder('Add an item').fill('Item A')
      await page.getByRole('button', { name: 'Add', exact: true }).click()
      await page.getByPlaceholder('Add an item').fill('Item B')
      await page.getByRole('button', { name: 'Add', exact: true }).click()

      await expect(page.getByText('0/2', { exact: true })).toBeVisible()
      await page.getByLabel('Item A', { exact: true }).check()
      await expect(page.getByText('1/2', { exact: true })).toBeVisible()
    })

    await test.step('add and then delete a comment', async () => {
      await page.getByLabel('Add a comment').fill('Nice card!')
      await page.getByRole('button', { name: 'Comment' }).click()
      await expect(page.getByText('Nice card!')).toBeVisible()

      await page.getByRole('button', { name: 'Delete comment' }).click()
      await expect(page.getByText('Nice card!')).toHaveCount(0)
      await closeCardModal(page)
    })

    await test.step('delete the card', async () => {
      await openCard(page, 'Doing', 'Card A edited')
      await page.getByRole('button', { name: 'Delete card' }).click()
      await expect(cardItem(page, 'Doing', 'Card A edited')).toHaveCount(0)
    })

    await test.step('delete both lists', async () => {
      await listColumn(page, 'To Do').getByRole('button', { name: 'Delete list To Do' }).click()
      await expect(listColumn(page, 'To Do')).toHaveCount(0)
      await listColumn(page, 'Doing').getByRole('button', { name: 'Delete list Doing' }).click()
      await expect(listColumn(page, 'Doing')).toHaveCount(0)
    })

    await test.step('delete the board', async () => {
      await page.goto('/')
      await page.getByRole('link', { name: boardName }).hover()
      await page.getByRole('button', { name: `Delete board ${boardName}` }).click()
      await expect(page.getByRole('link', { name: boardName })).toHaveCount(0)
    })
  })
})
