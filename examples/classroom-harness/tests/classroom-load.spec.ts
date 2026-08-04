import { expect, test, type BrowserContext, type Page } from '@playwright/test'

type ClassroomUser = {
  context: BrowserContext
  page: Page
  username: string
}

const studentCount = 10

async function joinClassroom(page: Page, role: 'teacher' | 'student', username: string) {
  await page.goto('/')
  await page.getByLabel('Display name').fill(username)
  await page.getByLabel('Role').selectOption(role)
  await page.getByLabel('Auth token').fill(`${role}:${username}`)
  await page.getByRole('button', { name: 'Join without media' }).click()
  await expect(page.getByText('Live session')).toBeVisible()
}

test('one teacher moderates ten simultaneous students', async ({ browser }, testInfo) => {
  const errors: string[] = []
  const users: ClassroomUser[] = []

  const createUser = async (role: 'teacher' | 'student', username: string) => {
    const context = await browser.newContext()
    const page = await context.newPage()
    page.on('pageerror', error => errors.push(`${username}: ${error.message}`))
    users.push({ context, page, username })
    await joinClassroom(page, role, username)
    return page
  }

  try {
    const teacherPromise = createUser('teacher', 'teacher')
    const studentPromises = Array.from({ length: studentCount }, (_, index) =>
      createUser('student', `student-${index + 1}`))
    const [teacher, ...students] = await Promise.all([teacherPromise, ...studentPromises])

    await expect(teacher.getByText(`${studentCount + 1} participants`)).toBeVisible()
    await expect(teacher.locator('.person')).toHaveCount(studentCount + 1)

    const teacherRow = teacher.locator('.person').filter({ has: teacher.getByText('teacher', { exact: true }) })
    await expect(teacherRow.getByRole('button', { name: 'Remove' })).toHaveCount(0)

    await students[0].getByPlaceholder('Message the classroom…').fill('Hello from student 1')
    await students[0].getByRole('button', { name: 'Send message' }).click()
    await expect(teacher.locator('.chat-message').filter({ hasText: 'Hello from student 1' })).toHaveCount(1)
    await Promise.all(students.map(student =>
      expect(student.locator('.chat-message').filter({ hasText: 'Hello from student 1' })).toHaveCount(1)))

    await Promise.all(students.map(student => student.getByRole('button', { name: 'Raise hand' }).click()))
    await expect(teacher.getByText('Hand raised')).toHaveCount(studentCount)

    await teacher.getByRole('button', { name: 'Mute all' }).click()
    await Promise.all(students.map(student => expect(student.getByRole('button', { name: 'Unmute' })).toBeVisible()))

    await students[0].getByRole('button', { name: 'Unmute' }).click()
    const firstStudentRow = teacher.locator('.person').filter({
      has: teacher.getByText('student-1', { exact: true }),
    })
    await firstStudentRow.getByRole('button', { name: 'Mute' }).click()
    await expect(students[0].getByRole('button', { name: 'Unmute' })).toBeVisible()

    const lastStudentRow = teacher.locator('.person').filter({
      has: teacher.getByText(`student-${studentCount}`, { exact: true }),
    })
    teacher.once('dialog', dialog => dialog.accept())
    await lastStudentRow.getByRole('button', { name: 'Remove' }).click()
    await expect(students.at(-1)!.getByText('You were removed: Removed by instructor')).toBeVisible()
    await expect(teacher.getByText(`${studentCount} participants`)).toBeVisible()
    await expect(teacher.locator('.person')).toHaveCount(studentCount)

    await teacher.screenshot({
      path: testInfo.outputPath('teacher-with-ten-students.png'),
      fullPage: true,
    })
    expect(errors).toEqual([])
  } finally {
    for (const user of users) await user.context.close()
  }
})
