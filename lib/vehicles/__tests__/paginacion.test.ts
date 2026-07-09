import { describe, it, expect } from 'vitest'
import { rangoPaginas, HUECO } from '@/lib/vehicles/paginacion'

describe('rangoPaginas', () => {
  it('una sola página', () => {
    expect(rangoPaginas(1, 1)).toEqual([1])
    expect(rangoPaginas(1, 0)).toEqual([1])
  })
  it('todas contiguas no llevan hueco', () => {
    expect(rangoPaginas(1, 3)).toEqual([1, 2, 3])
  })
  it('muchas páginas al medio: colapsa ambos extremos', () => {
    expect(rangoPaginas(6, 20)).toEqual([1, HUECO, 5, 6, 7, HUECO, 20])
  })
  it('cerca del inicio: solo colapsa el final', () => {
    expect(rangoPaginas(2, 20)).toEqual([1, 2, 3, HUECO, 20])
  })
  it('cerca del final: solo colapsa el inicio', () => {
    expect(rangoPaginas(19, 20)).toEqual([1, HUECO, 18, 19, 20])
  })
  it('no marca hueco cuando el salto es de una sola página', () => {
    expect(rangoPaginas(3, 5)).toEqual([1, 2, 3, 4, 5])
  })
})
