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

// Function Definitions
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

const fetchPostById = async (postId) => {
    try {
        const { data: post, error } = await supabase
          .from('tools')
          .select('*', { headers: { apikey: {supabaseKey} } }) 
          .eq('id', postId)
          .single();
    
        if (error) {
          throw new Error(error);
        }
    
        return post;
      } catch (error) {
        console.error('Error fetching post:', error);
        return null;
      }
    };

    const fetchPopularPosts = async (categoryName, limit = 5) => {
      try {
        let query = supabase
          .from('tools')
          .select('*')
          .order('post_view', { ascending: false })
          .eq('post_category', categoryName)
          .limit(limit);
    
        const { data: popularPosts, error } = await query;
    
        if (error) {
          console.error('Error retrieving popular posts:', error);
          return [];
        }
    
        return popularPosts.slice(0, limit);
      } catch (error) {
        console.error('Error retrieving popular posts:', error);
        return [];
      }
    };

    app.get('/trendingPosts', async (req, res) => {
      const { limit = 50 } = req.query;
    
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

// Route Handlers
app.get('/allCategories', async (req, res) => {
  const categories = await retrieveAllCategoriesFromSupabase();
  res.json(categories);
});

app.get('/categories', async (req, res) => {
  const { offset, limit, search } = req.query;

  try {
    let query = supabase
      .from('distinct_categories')
      .select('post_category')
      .not('post_category', 'is', null) // Exclude null values
      .order('post_category', { ascending: true, caseSensitive: false });

    // If a search term is provided, filter the categories
    if (search) {
      query = query.ilike('post_category', `%${search}%`);
    }

    const { data, error } = await query
      .range(parseInt(offset) * parseInt(limit), (parseInt(offset) + 1) * parseInt(limit) - 1);

    if (error) {
      res.status(500).json({ error: 'Error fetching data from Supabase' });
    }

    // If a search term is provided, sort the categories by relevance
    if (search) {
      data.sort((a, b) => {
        const indexA = a.post_category.toLowerCase().indexOf(search.toLowerCase());
        const indexB = b.post_category.toLowerCase().indexOf(search.toLowerCase());

        if (indexA !== -1 && indexB !== -1) {
          return indexA - indexB;
        } else if (indexA !== -1) {
          return -1;
        } else if (indexB !== -1) {
          return 1;
        } else {
          return 0;
        }
      });
    }

    res.status(200).json(data);
  } catch (error) {
    res.status(500).json({ error: 'Error fetching data from Supabase' });
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

app.get('/postById/:postId', async (req, res) => {
  const { postId } = req.params;
  const post = await fetchPostById(postId);
  res.json(post);
});

app.get('/popularPosts/:categoryName', async (req, res) => {
  const { categoryName } = req.params;
  const { limit } = req.query; // If the limit is passed as a query parameter
  const popularPosts = await fetchPopularPosts(categoryName, limit);
  res.json(popularPosts);
});

app.get('/redirect', (req, res) => {
  const { url } = req.query;
  res.redirect(url);
});


app.post('/updatePostView/:postId', async (req, res) => {
  const { postId } = req.params;

  try {
    const { data, error } = await supabase
      .from('tools')
      .select('post_view')
      .eq('id', postId)
      .single();

    if (error) {
      throw error;
    }

    const updatedView = (data.post_view || 0) + 1;

    const { updateError } = await supabase
      .from('tools')
      .update({ post_view: updatedView })
      .eq('id', postId);

    if (updateError) {
      throw updateError;
    }

    res.status(200).json({ message: 'Post view updated successfully' });
  } catch (error) {
    console.error('Error updating post view:', error);
    res.status(500).json({ error: 'Internal server error' });
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

    console.log('Before filter:', user.user_bookmarked);

    // Remove the postId from the user_bookmarked array
    let updatedBookmarks = user.user_bookmarked?.filter(id => String(id) !== String(postId)) ?? [];

    console.log('After filter:', updatedBookmarks);

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
  console.log('Email:', email);

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
  const { data, error } = await supabase.storage.from('favicons').download(`${postId}.png`);

  if (error) {
    console.error('Error fetching image: ', error);
    res.status(500).send('Error fetching image');
    return;
  }

  const url = URL.createObjectURL(data);
  res.send(url);
});


const port = process.env.PORT || 10000;
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
