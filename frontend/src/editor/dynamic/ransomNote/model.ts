import { getEnv, util } from 'fabric'

export const MAX_NOTE_LENGTH = 160
export const NOTE_COLORS = ['white', 'red', 'yellow', 'blue', 'black', 'green', 'gray'] as const
export const NOTE_FONTS = ['serif', 'sans', 'slab', 'display', 'mono'] as const
export const NOTE_CASES = ['mixed', 'typed', 'upper', 'lower'] as const
export const NOTE_EDGES = ['scissors', 'torn', 'rounded'] as const

export const NOTE_LIMITS = {
  chaos: { min: 0, max: 100 },
  letterSize: { min: 40, max: 160 },
  gap: { min: 0, max: 30 },
  shadow: { min: 0, max: 100 },
} as const

export interface NoteOptions {
  chaos: number
  letterSize: number
  gap: number
  shadow: number
  letterCase: typeof NOTE_CASES[number]
  edge: typeof NOTE_EDGES[number]
  colors: (typeof NOTE_COLORS[number])[]
  fonts: (typeof NOTE_FONTS[number])[]
}

export interface RansomNoteSpec extends Partial<NoteOptions> {
  text: string
  seed: number
}

export const DEFAULT_NOTE_OPTIONS: Readonly<NoteOptions> = {
  chaos: 55,
  letterSize: 100,
  gap: 6,
  shadow: 45,
  letterCase: 'mixed',
  edge: 'scissors',
  colors: [...NOTE_COLORS],
  fonts: [...NOTE_FONTS],
}

export function defaultRansomNote(text: string): RansomNoteSpec {
  return { text, seed: 681207, ...noteOptions({ text, seed: 681207 }) }
}

export function noteOptions(spec: RansomNoteSpec): NoteOptions {
  return {
    ...DEFAULT_NOTE_OPTIONS,
    ...spec,
    colors: [...(spec.colors ?? DEFAULT_NOTE_OPTIONS.colors)],
    fonts: [...(spec.fonts ?? DEFAULT_NOTE_OPTIONS.fonts)],
  }
}

export interface NoteTile {
  text: string
  x: number
  y: number
  angle: number
  width: number
  height: number
  points: { x: number; y: number }[]
  radius: number
  font: string
  italic: boolean
  size: number
  weight: number
  stretch: number
  textX: number
  textY: number
  paper: string
  ink: string
}

export interface NoteLayout {
  width: number
  height: number
  tiles: NoteTile[]
}

const FONTS = {
  serif: ['Georgia, serif', '"Times New Roman", serif'],
  sans: ['Arial, sans-serif', 'Verdana, sans-serif'],
  slab: ['Rockwell, "Courier New", monospace'],
  display: ['Impact, fantasy', 'cursive'],
  mono: ['"Courier New", monospace'],
}

export const PAPER_COLORS = {
  white: '#fafafa',
  red: '#d9362b',
  yellow: '#f4ce27',
  blue: '#2857d8',
  black: '#17191b',
  green: '#29894e',
  gray: '#c9cdd0',
} as const

const INKS = {
  white: ['#17191b', '#2857d8', '#b52520'],
  red: ['#fafafa', '#17191b'],
  yellow: ['#17191b', '#2857d8'],
  blue: ['#fafafa', '#f4ce27'],
  black: ['#fafafa', '#f4ce27'],
  green: ['#fafafa', '#17191b'],
  gray: ['#17191b', '#b52520'],
}

export function readRansomNote(value: unknown): RansomNoteSpec | null {
  if (!value || typeof value !== 'object') return null
  const note = value as Record<string, unknown>
  if (typeof note.text !== 'string' || note.text.length > MAX_NOTE_LENGTH || !note.text.trim()) return null
  if (typeof note.seed !== 'number' || !Number.isInteger(note.seed) || note.seed < 0 || note.seed > 0xffffffff) return null
  const result: RansomNoteSpec = { text: note.text, seed: note.seed }
  for (const key of ['chaos', 'letterSize', 'gap', 'shadow'] as const) {
    if (note[key] === undefined) continue
    const number = note[key]
    if (typeof number !== 'number' || !Number.isInteger(number) || number < NOTE_LIMITS[key].min || number > NOTE_LIMITS[key].max) return null
    result[key] = number
  }
  if (note.letterCase !== undefined) {
    if (!NOTE_CASES.includes(note.letterCase as NoteOptions['letterCase'])) return null
    result.letterCase = note.letterCase as NoteOptions['letterCase']
  }
  if (note.edge !== undefined) {
    if (!NOTE_EDGES.includes(note.edge as NoteOptions['edge'])) return null
    result.edge = note.edge as NoteOptions['edge']
  }
  for (const key of ['colors', 'fonts'] as const) {
    if (note[key] === undefined) continue
    const choices = key === 'colors' ? NOTE_COLORS : NOTE_FONTS
    const list = note[key]
    if (!Array.isArray(list) || !list.length || list.length > choices.length || new Set(list).size !== list.length || list.some((item) => !choices.some((choice) => choice === item))) return null
    if (key === 'colors') result.colors = [...list] as NoteOptions['colors']
    else result.fonts = [...list] as NoteOptions['fonts']
  }
  return result
}

function random(seed: number, index: number, salt: number): number {
  let value = (seed + Math.imul(index + 1, 0x9e3779b9) + Math.imul(salt, 0x85ebca6b)) | 0
  value = Math.imul(value ^ (value >>> 16), 0x7feb352d)
  value = Math.imul(value ^ (value >>> 15), 0x846ca68b)
  return (value ^ (value >>> 16)) >>> 0
}

let measureContext: CanvasRenderingContext2D | null = null

export function tileFont(tile: Pick<NoteTile, 'italic' | 'weight' | 'size' | 'font'>): string {
  return `${tile.italic ? 'italic ' : ''}${tile.weight} ${tile.size}px ${tile.font}`
}

function makeTile(char: string, spec: RansomNoteSpec, options: NoteOptions, index: number): NoteTile {
  const pick = (salt: number): number => random(spec.seed, index, salt)
  const variation = (salt: number): number => (pick(salt) / 0xffffffff * 2 - 1) * options.chaos / 100
  const text = options.letterCase === 'typed' ? char
    : options.letterCase === 'upper' || (options.letterCase === 'mixed' && pick(0) % 2) ? char.toUpperCase() : char.toLowerCase()
  const family = options.fonts[pick(1) % options.fonts.length]
  const fonts = FONTS[family]
  const color = options.colors[pick(2) % options.colors.length]
  const tile: NoteTile = {
    text, x: 0, y: variation(3) * options.letterSize * 0.12,
    angle: variation(4) * 16,
    size: options.letterSize * (1 + variation(5) * 0.32),
    font: fonts[pick(6) % fonts.length],
    weight: pick(7) % 3 === 0 ? 700 : 900,
    italic: (family === 'serif' || family === 'display') && pick(8) % 3 === 0,
    stretch: 1 + variation(9) * 0.35,
    width: 0, height: 0, points: [], radius: 0, textX: 0, textY: 0,
    paper: PAPER_COLORS[color], ink: INKS[color][pick(10) % INKS[color].length],
  }
  measureContext ??= getEnv().document.createElement('canvas').getContext('2d')
  if (!measureContext) throw new Error('A canvas context is required to lay out a ransom note')
  measureContext.font = tileFont(tile)
  measureContext.textAlign = 'left'
  measureContext.textBaseline = 'alphabetic'
  const metrics = measureContext.measureText(text)
  const left = metrics.actualBoundingBoxLeft ?? 0
  const right = metrics.actualBoundingBoxRight ?? metrics.width
  const ascent = metrics.actualBoundingBoxAscent ?? tile.size * 0.75
  const descent = metrics.actualBoundingBoxDescent ?? tile.size * 0.2
  const padding = tile.size * (0.08 + pick(11) / 0xffffffff * 0.06)
  tile.width = Math.max(tile.size * 0.12, (left + right) * tile.stretch) + padding * 2
  tile.height = Math.max(tile.size * 0.2, ascent + descent) + padding * 2
  tile.textX = (left - right) / 2
  tile.textY = (ascent - descent) / 2
  const halfW = tile.width / 2, halfH = tile.height / 2
  if (options.edge === 'rounded') tile.radius = Math.min(halfW, halfH, tile.size * 0.12)
  else {
    const corners = [
      { x: -halfW - Math.abs(variation(12)) * padding, y: -halfH },
      { x: halfW, y: -halfH - Math.abs(variation(13)) * padding },
      { x: halfW + Math.abs(variation(14)) * padding, y: halfH },
      { x: -halfW, y: halfH + Math.abs(variation(15)) * padding },
    ]
    if (options.edge === 'scissors') tile.points = corners
    else {
      for (let edge = 0; edge < corners.length; edge++) {
        const from = corners[edge], to = corners[(edge + 1) % corners.length]
        for (let step = 0; step < 8; step++) {
          const progress = step / 8
          const roughness = step === 0 ? 0 : (pick(16 + edge * 8 + step) / 0xffffffff - 0.5) * padding * 0.7
          tile.points.push({
            x: from.x + (to.x - from.x) * progress + (edge % 2 ? roughness : 0),
            y: from.y + (to.y - from.y) * progress + (edge % 2 ? 0 : roughness),
          })
        }
      }
    }
  }
  return tile
}

function tileBounds(tile: NoteTile): { width: number; height: number } {
  const width = tile.radius ? tile.width : Math.max(...tile.points.map((p) => p.x)) - Math.min(...tile.points.map((p) => p.x))
  const height = tile.radius ? tile.height : Math.max(...tile.points.map((p) => p.y)) - Math.min(...tile.points.map((p) => p.y))
  const angle = tile.angle * Math.PI / 180
  return { width: Math.abs(Math.cos(angle)) * width + Math.abs(Math.sin(angle)) * height, height: Math.abs(Math.sin(angle)) * width + Math.abs(Math.cos(angle)) * height }
}

/** Measured cutouts and seeded choices are shared by the canvas, preview and SVG export. */
export function noteLayout(spec: RansomNoteSpec): NoteLayout {
  const options = noteOptions(spec)
  const maxWidth = options.letterSize * 16
  const lines = [{ tiles: [] as NoteTile[], width: 0, height: options.letterSize * 0.65 }]
  let index = 0, spaces = 0
  const tokens = spec.text.replace(/\r\n?/g, '\n').split(/(\n|[^\S\n]+)/u)
  for (const token of tokens) {
    if (!token) continue
    if (token === '\n') {
      lines.push({ tiles: [], width: 0, height: options.letterSize * 0.65 })
      spaces = 0
      index++
      continue
    }
    if (/^\s+$/.test(token)) {
      spaces += token.length * options.letterSize * 0.32
      index += token.length
      continue
    }
    const word = util.string.graphemeSplit(token).map((char) => makeTile(char, spec, options, index++))
    const wordWidth = word.reduce((sum, tile) => sum + tileBounds(tile).width, 0) + options.gap * (word.length - 1)
    let line = lines[lines.length - 1]
    if (line.tiles.length && line.width + spaces + options.gap + wordWidth > maxWidth) {
      line = { tiles: [], width: 0, height: options.letterSize * 0.65 }
      lines.push(line)
      spaces = 0
    }
    for (const tile of word) {
      const bounds = tileBounds(tile)
      if (line.tiles.length && line.width + spaces + options.gap + bounds.width > maxWidth) {
        line = { tiles: [], width: 0, height: options.letterSize * 0.65 }
        lines.push(line)
        spaces = 0
      }
      const gap = line.tiles.length ? spaces + options.gap : 0
      tile.x = line.width + gap + bounds.width / 2
      line.width += gap + bounds.width
      line.height = Math.max(line.height, bounds.height + Math.abs(tile.y) * 2)
      line.tiles.push(tile)
      spaces = 0
    }
  }
  const margin = options.letterSize * 0.2
  const lineGap = options.letterSize * 0.2
  const width = Math.max(options.letterSize * 0.2, ...lines.map((line) => line.width)) + margin * 2
  const height = lines.reduce((sum, line) => sum + line.height, 0) + lineGap * (lines.length - 1) + margin * 2
  let top = margin - height / 2
  const tiles: NoteTile[] = []
  for (const line of lines) {
    for (const tile of line.tiles) {
      tile.x -= line.width / 2
      tile.y += top + line.height / 2
      tiles.push(tile)
    }
    top += line.height + lineGap
  }
  return { width, height, tiles }
}

export function paperPath(tile: NoteTile): string {
  if (!tile.radius) return `${tile.points.map((p, i) => `${i ? 'L' : 'M'} ${p.x} ${p.y}`).join(' ')} Z`
  const w = tile.width / 2, h = tile.height / 2, r = tile.radius
  return `M ${-w + r} ${-h} H ${w - r} Q ${w} ${-h} ${w} ${-h + r} V ${h - r} Q ${w} ${h} ${w - r} ${h} H ${-w + r} Q ${-w} ${h} ${-w} ${h - r} V ${-h + r} Q ${-w} ${-h} ${-w + r} ${-h} Z`
}
