import { describe, expect, it, vi } from 'vitest'
import { defaultFaces, dieDocuments, randomFace, readDie } from './model'

describe('dice configuration', () => {
  it('accepts standard numbered dice and validates symbolic faces', () => {
    expect(readDie({ kind: 'number', sides: 20 })).toEqual({ kind: 'number', sides: 20 })
    expect(readDie({ kind: 'number', sides: 7 })).toBeNull()
    expect(readDie({ kind: 'number', sides: 6, pips: true })).toEqual({ kind: 'number', sides: 6, pips: true })
    expect(readDie({ kind: 'number', sides: 20, pips: true })).toEqual({ kind: 'number', sides: 20 })
    expect(readDie({ kind: 'number', sides: 6, pips: null })).toEqual({ kind: 'number', sides: 6 })
    expect(readDie({ kind: 'number', sides: 8, color: '#AA3300' })).toEqual({ kind: 'number', sides: 8, color: '#AA3300' })
    expect(readDie({ kind: 'number', sides: 8, color: 'red' })).toEqual({ kind: 'number', sides: 8 })
    expect(readDie({ kind: 'symbol', faces: defaultFaces() })).toEqual({ kind: 'symbol', faces: defaultFaces() })
    expect(readDie({ kind: 'symbol', faces: [{ text: '', color: '#123456' }, { text: '★', color: '#abcdef' }] })).not.toBeNull()
    expect(readDie({ kind: 'symbol', faces: [{ text: 'a', color: 'red' }, { text: 'b', color: '#abcdef' }] })).toBeNull()
    expect(readDie({ kind: 'symbol', faces: [{ text: 'a', color: '#123456' }] })).toBeNull()
  })

  it('rejects random values outside the largest evenly divisible range', () => {
    const random = vi.spyOn(crypto, 'getRandomValues')
    random.mockImplementationOnce((array) => { (array as Uint32Array)[0] = 0xffffffff; return array })
    random.mockImplementationOnce((array) => { (array as Uint32Array)[0] = 7; return array })
    expect(randomFace(6)).toBe(1)
    expect(random).toHaveBeenCalledTimes(2)
    random.mockRestore()
  })

  it('finds visible dice in groups only', () => {
    const die = { id: 'd', type: 'dorydie', die: { kind: 'number', sides: 6 } }
    expect(dieDocuments([{ id: 'g', type: 'group', objects: [die] }])).toEqual([die])
    expect(dieDocuments([{ ...die, visible: false }])).toEqual([])
    expect(dieDocuments([{ id: 'g', type: 'group', visible: false, objects: [die] }])).toEqual([])
  })
})
