import supabase from './db-client.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    if (req.method === 'GET') {
      const { genre, mood, search, sort = 'trending', limit = 50, offset = 0 } = req.query;
      
      let query = supabase.from('movies').select('*', { count: 'exact' });
      
      if (genre && genre !== 'all') {
        query = query.eq('genre', genre);
      }
      
      if (mood && mood !== 'all') {
        query = query.contains('mood_tags', [mood]);
      }
      
      if (search) {
        query = query.or(`title.ilike.%${search}%,description.ilike.%${search}%,cast.ilike.%${search}%`);
      }
      
      // Sorting
      switch (sort) {
        case 'rating':
          query = query.order('rating', { ascending: false });
          break;
        case 'newest':
          query = query.order('release_year', { ascending: false });
          break;
        case 'trending':
        default:
          query = query.order('trending_score', { ascending: false });
          break;
      }
      
      const { data, error, count } = await query.range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);
      
      if (error) throw error;
      return res.status(200).json({ data, count, total: count });
    }
    
    if (req.method === 'POST') {
      const movieData = req.body;
      const { data, error } = await supabase.from('movies').insert(movieData).select().single();
      if (error) throw error;
      return res.status(201).json(data);
    }
    
    if (req.method === 'PUT') {
      const { id, ...updateData } = req.body;
      const { data, error } = await supabase.from('movies').update(updateData).eq('id', id).select().single();
      if (error) throw error;
      return res.status(200).json(data);
    }
    
    if (req.method === 'DELETE') {
      const { id } = req.body;
      const { error } = await supabase.from('movies').delete().eq('id', id);
      if (error) throw error;
      return res.status(200).json({ ok: true });
    }
    
    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('Movies API error:', err);
    res.status(500).json({ error: err.message });
  }
}
