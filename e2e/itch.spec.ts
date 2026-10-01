import { expect, test } from '@playwright/test'

const appPath = '/html/loopsmith/'

test('runs from an itch-style nested path with portable assets and downloads', async ({ page }) => {
  const failedRequests: string[] = []
  const consoleErrors: string[] = []
  page.on('requestfailed', (request) => failedRequests.push(`${request.method()} ${request.url()}: ${request.failure()?.errorText ?? 'failed'}`))
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text())
  })

  await page.goto(appPath)
  await expect(page).toHaveTitle(/LoopSmith/)
  await expect(page.getByText(/Audio ready · seam RMS/)).toBeVisible()

  const brand = page.getByRole('link', { name: 'LoopSmith home' })
  await expect(brand).toHaveAttribute('href', './')
  expect(await brand.evaluate((element) => new URL((element as HTMLAnchorElement).href).pathname)).toBe(appPath)
  const logo = brand.locator('img.brand-logo')
  await expect(logo).toHaveAttribute('src', './loopsmith-logo.webp')
  expect(await logo.evaluate((image) => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0)

  const attribution = page.getByRole('link', { name: 'Attribution' })
  await expect(attribution).toHaveAttribute('href', './CORPUS_ATTRIBUTION.txt')
  const [attributionPage] = await Promise.all([
    page.waitForEvent('popup'),
    attribution.click(),
  ])
  await expect(attributionPage).toHaveURL(/\/html\/loopsmith\/CORPUS_ATTRIBUTION\.txt$/)
  await expect(attributionPage.getByText('LoopSmith training corpus attribution')).toBeVisible()
  await attributionPage.close()

  for (const buttonName of [/Standard MIDI/, /Lossless WAV/, /LoopSmith project/]) {
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: buttonName }).click(),
    ])
    expect(download.suggestedFilename()).toBeTruthy()
  }

  const stemDownload = page.waitForEvent('download', { timeout: 120_000 })
  await page.getByRole('button', { name: 'Export WAV stems' }).click()
  expect((await stemDownload).suggestedFilename()).toMatch(/-stems\.zip$/)
  await expect(page.getByText(/WAV stem bundle exported · \d+ synchronized layers/)).toBeVisible()

  await page.getByLabel('MP3 quality').selectOption('96')
  const mp3Download = page.waitForEvent('download', { timeout: 120_000 })
  await page.getByRole('button', { name: /Game-ready MP3/ }).click()
  expect((await mp3Download).suggestedFilename()).toMatch(/-96k\.mp3$/)
  await expect(page.getByText(/MP3 decoded and verified · seam RMS/)).toBeVisible()

  expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeGreaterThan(720)
  expect(failedRequests).toEqual([])
  expect(consoleErrors).toEqual([])
})
