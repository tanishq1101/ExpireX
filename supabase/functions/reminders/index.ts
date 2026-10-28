import { createClient } from '@supabase/supabase-js';
import { edgeHandler } from '../_shared/edge-handler.ts';
import { runReminders } from '../_shared/reminder-jobs.ts';
Deno.serve(edgeHandler(createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!), Deno.env.get, runReminders));
