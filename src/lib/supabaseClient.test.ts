import { describe, it, expect, vi, beforeEach } from 'vitest'
import { supabase } from './supabaseClient'

// Mock Supabase client
vi.mock('./supabaseClient', () => {
  const mockSupabase = {
    from: vi.fn(() => mockSupabase),
    select: vi.fn(() => mockSupabase),
    insert: vi.fn(() => mockSupabase),
    update: vi.fn(() => mockSupabase),
    delete: vi.fn(() => mockSupabase),
    eq: vi.fn(() => mockSupabase),
    single: vi.fn(() => Promise.resolve({ data: null, error: null })),
  }
  return {
    supabase: mockSupabase,
  }
})

describe('Supabase Client', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should be defined', () => {
    expect(supabase).toBeDefined()
  })

  it('should have from method', () => {
    expect(supabase.from).toBeDefined()
    expect(typeof supabase.from).toBe('function')
  })
})





