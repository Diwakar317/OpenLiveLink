import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return res.status(500).json({ error: 'Supabase credentials not configured' });
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid authorization header' });
  }
  
  const token = authHeader.split(' ')[1];
  const authClient = createClient(SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
  const { data: { user }, error: authError } = await authClient.auth.getUser(token);
  
  if (authError || !user) {
    return res.status(401).json({ error: 'Unauthorized access' });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
  
  if (req.method === 'GET') {
     const { data, error } = await supabase
        .from('payments')
        .select('remarks')
        .eq('source_hash', 'SYS_ALIASES_HASH')
        .maybeSingle();
        
     if (error) return res.status(500).json({ error: error.message });
     
     let aliases = {};
     if (data && data.remarks) {
        try { aliases = JSON.parse(data.remarks); } catch(e) {}
     }
     return res.status(200).json({ aliases });
  }
  
  if (req.method === 'POST') {
     const { aliases } = req.body;
     const payload = {
        source_hash: 'SYS_ALIASES_HASH',
        transaction_id: 'SYS_ALIASES',
        remarks: JSON.stringify(aliases || {}),
        amount: 0,
        status: 'valid'
     };
     
     const { error } = await supabase.from('payments').upsert(payload, { onConflict: 'source_hash' });
     if (error) return res.status(500).json({ error: error.message });
     
     return res.status(200).json({ success: true });
  }
}
