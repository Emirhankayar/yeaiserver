const express = require('express');
const { createClient, sql } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const cors = require('cors'); // Import the cors package

dotenv.config();
const app = express();

app.use(cors()); // Enable CORS for all routes
app.use(express.json()); // Parse JSON bodies

const supabaseUrl = process.env.VITE_DB_URL;
const supabaseKey = process.env.VITE_DB_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Supabase URL and key are required in the .env file');
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Route Handlers
const retrieveAllCategoriesFromSupabase = async () => {
  try {
    const { data, error } = await supabase
      .from('distinct_categories')
      .select('*')
      .order('post_category', { ascending: true });

    if (error) {
      console.error('Error fetching categories:', error);
      return [];
    }

    const categories = data.map((item) => item.post_category).filter(category => category !== null);
    return categories;
  } catch (error) {
    console.error('Error fetching distinct categories:', error.message);
    return [];
  }
};

app.get('/allCategories', async (req, res) => {
  const categories = await retrieveAllCategoriesFromSupabase();
  res.json(categories);
});

    app.get('/trendingPosts', async (req, res) => {
      const { limit = 10 } = req.query;
    
      try {
        let query = supabase
          .from('tools')
          .select('*')
          .order('post_view', { ascending: false })
          .limit(limit);
    
        const { data: popularPosts, error } = await query;
    
        if (error) {
          console.error('Error retrieving popular posts:', error);
          res.status(500).json({ error: 'Error fetching trending posts' });
          return;
        }
    
        res.status(200).json(popularPosts.slice(0, limit));
      } catch (error) {
        console.error('Error retrieving popular posts:', error);
        res.status(500).json({ error: 'Error fetching trending posts' });
      }
    });


app.get('/postsByCategory', async (req, res) => {
  const { categoryName, offset, limit } = req.query;

  try {
    const { data: allPosts, error } = await supabase
      .from('tools')
      .select('*')
      .eq('post_category', categoryName)
      .order('post_view', { ascending: false })
      .range(parseInt(offset) * parseInt(limit), (parseInt(offset) + 1) * parseInt(limit) - 1);

    if (error) {
      res.status(500).json({ error: 'Error fetching posts' });
    }

    res.status(200).json(allPosts);
  } catch (error) {
    res.status(500).json({ error: 'Error fetching posts' });
  }
});








app.put('/updatePostView', async (req, res) => {
  const { postId, post_view } = req.body;

  try {
    const updatedView = (post_view || 0) + 1;

    const { error } = await supabase
      .from('tools')
      .update({ post_view: updatedView })
      .eq('id', postId);

    if (error) {
      console.error('Error updating post view:', error);
      res.status(500).json({ error: 'Error updating post view' });
      return;
    }

    res.status(200).json({ message: 'Post view updated successfully' });
  } catch (error) {
    console.error('Error updating post view:', error);
    res.status(500).json({ error: 'Error updating post view' });
  }
});








app.put('/updateBookmark', async (req, res) => {
  const { userEmail, postId } = req.body;

  try {
    // Fetch the user
    let { data: user, error: fetchError } = await supabase
      .from('users')
      .select('user_bookmarked')
      .eq('email', userEmail)
      .single();

    if (fetchError) throw fetchError;

    // Check if user_bookmarked includes postId
    let userBookmarked = user.user_bookmarked ?? [];
    if (userBookmarked.includes(postId)) {
      res.status(200).json({ message: 'Post already bookmarked' });
      return;
    }

    // Append the postId to the user_bookmarked array
    let updatedBookmarks = [...userBookmarked, postId];

    // Update the user
    let { data, error } = await supabase
      .from('users')
      .update({ user_bookmarked: updatedBookmarks })
      .eq('email', userEmail);

    if (error) throw error;

    res.status(200).json(data);
  } catch (error) {
    console.error('Error updating bookmark:', error);
    res.status(500).json({ error: 'Error updating bookmark' });
  }
});

app.delete('/removeBookmark', async (req, res) => {
  const { userEmail, postId } = req.body;

  try {
    // Fetch the user
    let { data: user, error: fetchError } = await supabase
      .from('users')
      .select('user_bookmarked')
      .eq('email', userEmail)
      .single();

    if (fetchError) throw fetchError;


    // Remove the postId from the user_bookmarked array
    let updatedBookmarks = user.user_bookmarked?.filter(id => String(id) !== String(postId)) ?? [];


    // Update the user
    let { data, error } = await supabase
      .from('users')
      .update({ user_bookmarked: updatedBookmarks })
      .eq('email', userEmail);

    if (error) throw error;

    res.status(200).json(data);
  } catch (error) {
    console.error('Error removing bookmark:', error);
    res.status(500).json({ error: 'Error removing bookmark' });
  }
});

app.get('/getBookmarks', async (req, res) => {
  const { email } = req.query; // change userEmail to email

  try {
    // Fetch the user
    let { data: user, error: fetchError } = await supabase
      .from('users')
      .select('user_bookmarked')
      .eq('email', email) // change userEmail to email
      .maybeSingle();

    if (fetchError || !user) {
      console.error('Error fetching user:', fetchError);
      res.status(404).json({ error: 'User not found' });
      return;
    }

    // Return the user_bookmarked array
    res.status(200).json({ email, bookmarks: user.user_bookmarked ?? [] }); // change userEmail to email
  } catch (error) {
    console.error('Error fetching bookmarks:', error);
    res.status(500).json({ error: 'Error fetching bookmarks' });
  }
});

app.get('/getBookmarkPosts', async (req, res) => {
  let { ids } = req.query;
  let idArray = JSON.parse(ids);

  // Convert ids to numbers
  idArray = idArray.map(id => Number(id));

  try {
    // Fetch the posts
    const { data: posts, error: postsError } = await supabase
      .from('tools')
      .select('*')
      .in('id', idArray);

    if (postsError) throw postsError;

    // Return the posts
    res.status(200).json({ posts });
  } catch (error) {
    console.error('Error fetching posts:', error);
    res.status(500).json({ error: 'Error fetching posts' });
  }
});

app.get('/postImage/:postId', async (req, res) => {
  const postId = req.params.postId;
  const { data, error } = supabase.storage.from('favicons').getPublicUrl(`${postId}.png`);

  if (error) {
    console.error('Error fetching image: ', error);
    if (error.message.includes('not found')) {
      res.status(204).send(); // Send 204 status if image not found
    } else {
      res.status(500).send('Error fetching image');
    }
    return;
  }

  res.send(data);
});


const port = process.env.PORT || 10000;
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
