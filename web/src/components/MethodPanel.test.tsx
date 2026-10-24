import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import MethodPanel from './MethodPanel'

describe('MethodPanel', () => {
  it('names the function and sets backticked text as inline code', () => {
    const { container } = render(
      <MethodPanel
        fn={{ file: 'preprocess.py', name: 'to_grayscale', params: ['img'] }}
        how={'Pillow\'s `convert("L")` weights each pixel.'}
      />,
    )
    expect(screen.getByText('preprocess.py › to_grayscale(img)').tagName).toBe('CODE')
    const inline = container.querySelectorAll('p code')
    expect(inline).toHaveLength(1)
    expect(inline[0]).toHaveTextContent('convert("L")')
    expect(container.querySelector('p')).toHaveTextContent('Pillow\'s convert("L") weights each pixel.')
    expect(screen.queryByText('Planned')).not.toBeInTheDocument()
  })

  it('names a helper on its own line under the function', () => {
    render(
      <MethodPanel
        fn={{
          file: 'preprocess.py',
          name: 'crop_and_center',
          params: ['grid'],
          helpers: [{ file: 'preprocess.py', name: 'otsu_threshold', params: ['grid'] }],
        }}
        how="x"
      />,
    )
    expect(screen.getByText('preprocess.py › crop_and_center(grid)')).toBeInTheDocument()
    expect(screen.getByText('→ otsu_threshold(grid)').tagName).toBe('CODE')
  })

  it('labels a function that exists only in the plan', () => {
    render(<MethodPanel fn={{ file: 'encoder.py', name: 'encode_frame', params: ['grid'], planned: true }} how="x" />)
    expect(screen.getByText('Planned')).toBeInTheDocument()
  })
})
