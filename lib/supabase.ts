import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv' 
dotenv.config()

const supabase = createClient(
  process.env.SUPABASE_URL ?? "",
  process.env.SUPABASE_SECRET ?? ""
)

export default supabase