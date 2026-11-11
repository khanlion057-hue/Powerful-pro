import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined

if (!url || !key) {
  throw new Error(
    'VITE_SUPABASE_URL va VITE_SUPABASE_PUBLISHABLE_KEY o‘rnatilmagan. .env.example faylini .env ga nusxalang.',
  )
}

export const supabase = createClient(url, key)

export type Note = {
  id: string
  user_id: string
  content: string
  created_at: string
}
