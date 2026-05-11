import React from 'react'

import { describe, test, expect } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'

describe('React SSR test', () => {
  test('renderToStaticMarkup works', () => {
    const html = renderToStaticMarkup(React.createElement('div', null, 'hello'))
    expect(html).toBe('<div>hello</div>')
  })
})
