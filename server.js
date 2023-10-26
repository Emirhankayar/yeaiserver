const express = require('express');
const session = require('express-session');
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const cors = require('cors'); // Import the cors package

dotenv.config();
const app = express();
const sesKey = process.env.VITE_SES_KEY;

app.use(cors());
app.use(
  session({
    secret: sesKey, // Replace with your actual secret key
    resave: false,
    saveUninitialized: true,
  })
);



app.post('/updatePostView/:postId', async (req, res) => {
  const { postId } = req.params;
  const { post_view } = req.body; // Make sure to get the current post_view value

  await updatePostView(postId, post_view, req);
  res.sendStatus(200); // Send a success response
});


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

    const categories = data.map((item) => item.post_category);
    return categories;
  } catch (error) {
    console.error('Error fetching distinct categories:', error.message);
    return [];
  }
};

const retrieveCategoriesFromSupabase = async (page, pageSize, searchInput) => {
    const offset = (page - 1) * pageSize;
  let { data, error } = await supabase
    .from('distinct_categories')
    .select('*')
    .order('post_category', { ascending: true })
    .range(offset, offset + pageSize - 1);

  if (searchInput) {
    const searchTerm = `%${searchInput}%`;
    ({ data, error } = await supabase
      .from('distinct_categories')
      .select('post_category')
      .order('post_category', { ascending: true })
      .range(offset, offset + pageSize - 1)
      .ilike('post_category', searchTerm, { caseSensitive: false }));
  }

  if (error) {
    console.error('Error fetching categories:', error);
    return [];
  }

  return data.map((item) => item.post_category).filter(category => category !== null);
};

const fetchPostsByCategory = async (categoryName, page, pageSize) => {
    try {
        const offset = (page - 1) * pageSize;
        let query = supabase.from('tools').select('*').range(offset, offset + pageSize - 1);
    
        if (categoryName === 'Freebies') {
          const { data: allPosts, error } = await query.order('post_view', { ascending: false });
    
          if (error) {
            console.error('Error fetching posts:', error);
            return [];
          } else {
            const freeItems = allPosts.filter(
              (post) => post.post_price === 'Free' || post.post_price === 'Freemium'
            );
            const otherItems = allPosts.filter(
              (post) => post.post_price !== 'Free' && post.post_price !== 'Freemium'
            );
            const modifiedFreeItems = freeItems.map((item) => ({ ...item, post_category: 'Freebies' }));
            return [...otherItems, ...modifiedFreeItems];
          }
        } else {
          query = query.eq('post_category', categoryName);
          const { data: posts, error } = await query.order('post_view', { ascending: false });
    
          if (error) {
            console.error('Error fetching posts:', error);
            return [];
          } else {
            return posts;
          }
        }
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

const fetchPopularPosts = async (categoryName, limit = 4) => {
    try {
        let query = supabase.from('tools').select('*');
    
        if (categoryName !== 'Freebies') {
          query = query.eq('post_category', categoryName).order('post_view', { ascending: false }).limit(limit);
        } else {
          const { data: freeItems, error: freeItemsError } = await supabase
            .from('tools')
            .select('*')
            .in('post_price', ['Free', 'Freemium'])
            .order('post_view', { ascending: false });
    
          if (freeItemsError) {
            console.error('Error retrieving popular free items:', freeItemsError);
            return [];
          }
    
          return freeItems.slice(0, limit);
        }
    
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
  const { page, pageSize, searchInput } = req.query;
  const categories = await retrieveCategoriesFromSupabase(page, pageSize, searchInput);
  res.json(categories);
});

app.get('/postsByCategory', async (req, res) => {
  const { categoryName, page, pageSize } = req.query;
  const posts = await fetchPostsByCategory(categoryName, page, pageSize);
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

const updatePostView = async (postId, post_view, req) => {
  try {
    if (!req.session.views) {
      req.session.views = {};
    }

    if (!req.session.views[postId]) {
      req.session.views[postId] = true;

      const updatedView = (post_view || 0) + 1;

      const { data, error } = await supabase
        .from('tools')
        .update({ post_view: updatedView })
        .eq('id', postId);
      if (error) {
        throw error;
      }
    }
  } catch (error) {
    console.error('Error updating post view:', error);
  }
};


const port = process.env.PORT || 5000;
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
