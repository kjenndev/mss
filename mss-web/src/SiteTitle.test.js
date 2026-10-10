import { expect, test } from 'vitest'
import { build } from 'vite'
import { cwd } from 'node:process'

test('built initial HTML has the full default site title before JavaScript runs', async () => {
  const result = await build({
    root: cwd(),
    configFile: false,
    logLevel: 'silent',
    build: { write: false },
  })
  const html = result.output.find((asset) => asset.fileName === 'index.html').source
  const document = new DOMParser().parseFromString(html, 'text/html')
  expect(document.querySelectorAll('title')).toHaveLength(1)
  expect(document.title).toBe('Midnight Sound Syndicate')
}, 30000)
