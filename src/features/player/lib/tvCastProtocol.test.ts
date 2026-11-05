import { describe, it, expect } from 'vitest'
import { getTvCastChannelName, isValidPin } from './tvCastProtocol'

describe('tvCastProtocol', () => {
  describe('isValidPin', () => {
    it('validates 4-digit numeric pins', () => {
      expect(isValidPin('1234')).toBe(true)
      expect(isValidPin('7829')).toBe(true)
      expect(isValidPin('0000')).toBe(true)
    })

    it('validates 4-character alphanumeric pins', () => {
      expect(isValidPin('A1B2')).toBe(true)
      expect(isValidPin('ABCD')).toBe(true)
    })

    it('rejects invalid pins', () => {
      expect(isValidPin('123')).toBe(false)
      expect(isValidPin('12345')).toBe(false)
      expect(isValidPin('')).toBe(false)
      expect(isValidPin('12#4')).toBe(false)
    })
  })

  describe('getTvCastChannelName', () => {
    it('formats channel name consistently and uppercased', () => {
      expect(getTvCastChannelName('7829')).toBe('tv_cast:7829')
      expect(getTvCastChannelName('abcd')).toBe('tv_cast:ABCD')
      expect(getTvCastChannelName(' 1234 ')).toBe('tv_cast:1234')
    })
  })
})
