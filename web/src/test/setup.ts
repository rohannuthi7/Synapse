import '@testing-library/jest-dom/vitest'
import { cleanup, configure } from '@testing-library/react'
import { afterEach } from 'vitest'

// StableHeight's invisible copies only reserve space; text queries should see
// the page as a visitor does.
configure({ defaultIgnore: 'script, style, [data-sizer], [data-sizer] *' })

// Vitest globals are off, so RTL's automatic cleanup isn't registered.
afterEach(cleanup)
