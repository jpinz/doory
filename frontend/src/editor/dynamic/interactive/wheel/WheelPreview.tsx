import { sliceGeometry, type WheelSpec, WHEEL_COLORS } from './model'

/** Small library preview; the canvas and SVG exports use the same slice geometry. */
export function WheelPreview({ spec }: { spec?: WheelSpec }) {
  const slices = spec?.slices ?? WHEEL_COLORS.map((color, i) => ({ id: String(i), color, percentage: 25 }))
  return (
    <svg viewBox="-200 -200 400 400" aria-hidden="true">
      {slices.map((slice, index) => {
        const start = slices.slice(0, index).reduce((sum, entry) => sum + entry.percentage, 0)
        const { path } = sliceGeometry(start, slice.percentage)
        return slice.percentage > 0 ? <path key={slice.id} d={path} fill={slice.color} stroke="#ffffff" strokeWidth="3" /> : null
      })}
      <circle r="24" fill="#ffffff" />
      <path d="M -12 -198 L 12 -198 L 0 -166 Z" fill="#2b1c17" />
    </svg>
  )
}
