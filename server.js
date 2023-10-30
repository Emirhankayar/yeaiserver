const express = require('express');
const { createClient, sql } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const cors = require('cors'); // Import the cors package

dotenv.config();
const app = express();

app.use(cors()); // Enable CORS for all routes

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

const retrieveCategoriesFromSupabase = async (page) => {
  const categoriesPerPage = 12;
  try {
    const { data, error } = await supabase
      .from('distinct_categories')
      .select('*')
      .order('post_category', { ascending: true });

    if (error) {
      console.error('Error fetching categories:', error);
      return [];
    }

    const startIndex = (page - 1) * categoriesPerPage;
    let endIndex = startIndex + categoriesPerPage;
    if (endIndex > data.length) {
      endIndex = data.length;
    }
    const categoriesForRequestedPage = data.slice(startIndex, endIndex);
    return categoriesForRequestedPage.map((item) => item.post_category.toLowerCase()).filter(category => category !== null);
  } catch (error) {
    console.error('Error fetching categories:', error);
    return [];
  }
};

const fetchPostsByCategory = async (categoryName, page) => {
  const postsPerPage = 6; // Constant posts per page
  try {
    let { data: allPosts, error } = await supabase
      .from(categoryName === 'freebies' ? 'free_tools' : 'tools')
      .select('*')
      .eq(categoryName === 'freebies' ? 'post_category' : 'post_category', categoryName)
      .order('post_view', { ascending: false });

    if (error) {
      console.error('Error fetching posts:', error);
      return [];
    }

    if (categoryName === 'freebies') {
      const { data: freeItems, error: freeItemsError } = await supabase
        .from('free_tools')
        .select('*')
        .order('post_view', { ascending: false });

      if (freeItemsError) {
        console.error('Error fetching free items:', freeItemsError);
      } else {
        allPosts = [...allPosts, ...freeItems];
      }
    }

    const startIndex = (page - 1) * postsPerPage;
    let endIndex = startIndex + postsPerPage;
    if (endIndex > allPosts.length) {
      endIndex = allPosts.length;
    }
    const postsForRequestedPage = allPosts.slice(startIndex, endIndex);
    return postsForRequestedPage
  } catch (error) {
    console.error('Error fetching posts:', error);
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
          .from(categoryName === 'freebies' ? 'free_tools' : 'tools')
          .select('*')
          .order('post_view', { ascending: false });
    
        if (categoryName === 'freebies') {
          query = supabase.from('free_tools').select('*');
        } else {
          query = query.eq('post_category', categoryName);
        }
    
        query = query.limit(limit);
    
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

// Route Handlers
app.get('/allCategories', async (req, res) => {
  const categories = await retrieveAllCategoriesFromSupabase();
  res.json(categories);
});

app.get('/categories', async (req, res) => {
  const { page } = req.query;
  const categories = await retrieveCategoriesFromSupabase(page);
  res.json(categories);
});

app.get('/postsByCategory', async (req, res) => {
  const { categoryName, page } = req.query;
  const posts = await fetchPostsByCategory(categoryName, page);
  res.json(posts);
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


const port = process.env.PORT || 10000;
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
