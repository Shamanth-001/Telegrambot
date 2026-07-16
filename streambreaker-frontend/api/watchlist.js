import supabase from './db-client.js';
import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (req.method === 'GET') {
      if (!token) return res.status(401).json({ error: 'Unauthorized' });
      
      const userSupabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
        { global: { headers: { Authorization: `Bearer ${token}` } } }
      );
      
      const { data: items, error } = await userSupabase
        .from('watchlist')
        .select('*, movies(*)')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return res.status(200).json(items.map(item => item.movies));
    }
    
    if (req.method === 'POST') {
      if (!token) return res.status(401).json({ error: 'Unauthorized' });
      
      const { movie_id } = req.body;
      
      // Verify token and get user
      const { data: { user }, error: authError } = await supabase.auth.getUser(token);
      if (authError || !user) return res.status(401).json({ error: 'Invalid token' });
      
      // Check if already in watchlist
      const { data: existing } = await supabase.from('watchlist').select('id').eq('user_id', user.id).eq('movie_id', movie_id).maybeSingle();
      
      if (existing) {
        return res.status(200).json({ message: 'Already in watchlist', id: existing.id });
      }
      
      const { data, error } = await supabase.from('watchlist').insert({ user_id: user.id, movie_id }).select().single();
      if (error) throw error;
      return res.status(201).json(data);
    }
    
    if (req.method === 'DELETE') {
      if (!token) return res.status(401).json({ error: 'Unauthorized' });
      
      const { movie_id } = req.body;
      
      const { data: { user }, error: authError } = await supabase.auth.getUser(token);
      if (authError || !user) return res.status(401).json({ error: 'Invalid token' });
      
      const { error } = await supabase.from('watchlist').delete().eq('user_id', user.id).eq('movie_id', movie_id);
      if (error) throw error;
      return res.status(200).json({ ok: true });
    }
    
    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('Watchlist API error:', err);
    res.status(500).json({ error: err.message });
  }
}
