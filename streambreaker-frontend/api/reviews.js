import supabase from './db-client.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    if (req.method === 'GET') {
      const { movie_id, user_id, limit = 20 } = req.query;
      
      let query = supabase.from('reviews').select('*, users(email, display_name)').order('created_at', { ascending: false }).limit(parseInt(limit));
      
      if (movie_id) {
        query = query.eq('movie_id', movie_id);
      }
      if (user_id) {
        query = query.eq('user_id', user_id);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return res.status(200).json(data);
    }
    
    if (req.method === 'POST') {
      const { movie_id, user_id, rating, comment } = req.body;
      
      // Check for existing review
      const { data: existing } = await supabase.from('reviews').select('id').eq('movie_id', movie_id).eq('user_id', user_id).maybeSingle();
      
      if (existing) {
        // Update existing review
        const { data, error } = await supabase.from('reviews').update({ rating, comment, updated_at: new Date().toISOString() }).eq('id', existing.id).select('*, users(email, display_name)').single();
        if (error) throw error;
        
        // Recalculate average rating
        await recalculateRating(movie_id);
        return res.status(200).json(data);
      }
      
      const { data, error } = await supabase.from('reviews').insert({ movie_id, user_id, rating, comment }).select('*, users(email, display_name)').single();
      if (error) throw error;
      
      // Recalculate average rating
      await recalculateRating(movie_id);
      
      return res.status(201).json(data);
    }
    
    if (req.method === 'PUT') {
      const { id, rating, comment } = req.body;
      const { data, error } = await supabase.from('reviews').update({ rating, comment, updated_at: new Date().toISOString() }).eq('id', id).select().single();
      if (error) throw error;
      
      // Get movie_id to recalculate
      const { data: review } = await supabase.from('reviews').select('movie_id').eq('id', id).single();
      if (review) await recalculateRating(review.movie_id);
      
      return res.status(200).json(data);
    }
    
    if (req.method === 'DELETE') {
      const { id } = req.body;
      const { data: review } = await supabase.from('reviews').select('movie_id').eq('id', id).single();
      
      const { error } = await supabase.from('reviews').delete().eq('id', id);
      if (error) throw error;
      
      if (review) await recalculateRating(review.movie_id);
      
      return res.status(200).json({ ok: true });
    }
    
    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('Reviews API error:', err);
    res.status(500).json({ error: err.message });
  }
}

async function recalculateRating(movieId) {
  const { data: reviews } = await supabase.from('reviews').select('rating').eq('movie_id', movieId);
  if (reviews && reviews.length > 0) {
    const avgRating = reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length;
    await supabase.from('movies').update({ rating: Math.round(avgRating * 10) / 10 }).eq('id', movieId);
  }
}
