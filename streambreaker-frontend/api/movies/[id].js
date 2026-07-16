import supabase from '../db-client.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    const { id } = req.query;
    
    if (req.method === 'GET') {
      const { data, error } = await supabase.from('movies').select('*').eq('id', id).single();
      if (error) throw error;
      
      // Increment view count
      await supabase.from('movies').update({ views: data.views + 1 }).eq('id', id);
      
      return res.status(200).json(data);
    }
    
    if (req.method === 'PUT') {
      const updateData = req.body;
      const { data, error } = await supabase.from('movies').update(updateData).eq('id', id).select().single();
      if (error) throw error;
      return res.status(200).json(data);
    }
    
    if (req.method === 'DELETE') {
      const { error } = await supabase.from('movies').delete().eq('id', id);
      if (error) throw error;
      return res.status(200).json({ ok: true });
    }
    
    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('Movie detail API error:', err);
    res.status(500).json({ error: err.message });
  }
}
