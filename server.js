const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const cors = require('cors');
const nodemailer = require('nodemailer');


dotenv.config();
const app = express();

app.use(cors()); // Enable CORS for all routes
app.use(express.json()); // Parse JSON bodies

const supabaseUrl = process.env.VITE_DB_URL;
const supabaseKey = process.env.VITE_DB_KEY;
const smtpHost = process.env.SMTP_HOST;
const smtpPort = process.env.SMTP_PORT;
const smtpUser = process.env.SMTP_USER;
const smtpPass = process.env.SMTP_PASS;

if (!supabaseUrl || !supabaseKey || !smtpHost || !smtpPort || !smtpUser || !smtpPass) {
  throw new Error('Supabase URL, key and SMTP credentials are required in the .env file');
}

const supabase = createClient(supabaseUrl, supabaseKey);
const transporter = nodemailer.createTransport({
  host: smtpHost,
  port: smtpPort,
  auth: {
    user: smtpUser,
    pass: smtpPass
  }
});
const { v4: uuidv4 } = require('uuid');

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
      const { categoryName, offset, limit, searchTerm, sortBy, sortOrder, filterBy } = req.query;
    
      try {
        let query = supabase.from('tools').select('*');
    
        if (categoryName) {
          query = query.eq('post_category', categoryName);
        } 
    
        if (searchTerm) {
          query = query.ilike('post_title', `%${searchTerm}%`); // Filter posts by title
        }
    
        if (sortBy) {
          query = query.order(sortBy, { ascending: sortOrder === 'asc' }); // Sort posts
        }
    
        if (filterBy) {
          query = query.eq('post_price', filterBy); // Filter posts by price
        }
    
        const { data: allPosts, error } = await query;
    
        if (error) {
          return res.status(500).json({ error: 'Error fetching posts' });
        }
    
        const totalPosts = allPosts.length;
    
        const posts = allPosts.slice(parseInt(offset) * parseInt(limit), (parseInt(offset) + 1) * parseInt(limit));
    
        // Fetch image URLs for each post
        for (let post of posts) {
          const { data: imageData, error: imageError } = await supabase.storage.from('images').getPublicUrl(`${post.id}.webp`);
          if (imageError) {
            console.error('Error fetching image: ', imageError);
            return res.status(500).json({ error: 'Error fetching image' });
          }
    
          const { data: iconData, error: iconError } = await supabase.storage.from('favicons').getPublicUrl(`${post.id}.png`);
          if (iconError) {
            console.error('Error fetching icon: ', iconError);
            return res.status(500).json({ error: 'Error fetching icon' });
          }
    
          post.image = imageData;
          post.icon = iconData;
        }
    
        return res.status(200).json({ posts, totalPosts });
      } catch (error) {
        return res.status(500).json({ error: 'Error fetching posts' });
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








app.put('/toggleBookmark', async (req, res) => {
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
    let updatedBookmarks;
    if (userBookmarked.includes(postId)) {
      // Remove the postId from the user_bookmarked array
      updatedBookmarks = userBookmarked.filter(id => String(id) !== String(postId));
    } else {
      // Append the postId to the user_bookmarked array
      updatedBookmarks = [...userBookmarked, postId];
    }

    // Update the user
    let { data, error } = await supabase
      .from('users')
      .update({ user_bookmarked: updatedBookmarks })
      .eq('email', userEmail);

    if (error) throw error;

    res.status(200).json(data);
  } catch (error) {
    console.error('Error toggling bookmark:', error);
    res.status(500).json({ error: 'Error toggling bookmark' });
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

app.get('/getPosts', async (req, res) => {
  let { ids, email, bookmarkedPage, addedPage, limit } = req.query;

  let idArray = JSON.parse(ids);
  page = Number(page);
  limit = Number(limit);

  // Convert ids to numbers
  idArray = idArray.map(id => Number(id));

  try {
    // Fetch all bookmarked posts
    const { data: allBookmarkedPosts, error: bookmarkedPostsError } = await supabase
      .from('tools')
      .select('*')
      .in('id', idArray);

    if (bookmarkedPostsError) throw bookmarkedPostsError;

    // Fetch all added posts
    const { data: allAddedPosts, error: addedPostsError } = await supabase
      .from('email')
      .select('*')
      .eq('email', email);

    if (addedPostsError) throw addedPostsError;

    // Manually paginate the results
    const bookmarkedPosts = allBookmarkedPosts.slice((bookmarkedPage - 1) * limit, bookmarkedPage * limit);
    const addedPosts = allAddedPosts.slice((addedPage - 1) * limit, addedPage * limit);

    // Return the posts
    res.status(200).json({ bookmarkedPosts, addedPosts, totalBookmarkedPosts: allBookmarkedPosts.length, totalAddedPosts: allAddedPosts.length });
  } catch (error) {
    console.error('Error fetching posts:', error);
    res.status(500).json({ error: 'Error fetching posts' });
  }
});










app.post('/report-issue', async (req, res) => {
  const { post, message, email } = req.body;

  const emailData = {
    from: email,
    to: 'emirhan.kayar80@gmail.com',
    subject: `Report for post: ${post}`,
    text: message
  };

  transporter.sendMail(emailData)
    .then(() => res.status(200).json({ message: 'Report sent successfully' }))
    .catch((err) => {
      console.log('SMTP error:', err.message);
      res.status(500).json({ error: err.message });
    });
});

app.post('/send-email', async (req, res) => {
  console.log('Request body:', req.body);

  const { email, post_link, post_category, post_description, post_price, post_title } = req.body;
  const toolId = uuidv4(); // Generate a unique id for the tool

  const { error: insertError } = await supabase
  .from('email')
  .insert([{ uuid: toolId, email, post_link, post_category, post_description, post_price, post_title }]);

if (insertError) {
  console.log('Database error:', insertError.message);
  return res.status(500).json({ error: insertError.message });
}

// Now, when you want to refer to this record, use the toolId
const { data, error: selectError } = await supabase
  .from('email')
  .select('*')
  .eq('uuid', toolId);

if (selectError) {
  console.log('Database error:', selectError.message);
  return res.status(500).json({ error: selectError.message });
}

  const emailData = {
    from: 'Yeai <noreply@yeai.tech>',
    to: email,
    subject: 'Submission received',
    text: 'Your tool submission is successful. We will further inspect it.'
  };

  const adminEmailData = {
    from: 'Yeai <noreply@yeai.tech>',
    to: 'emirhan.kayar80@gmail.com', // replace with the admin's email
    subject: 'New tool submitted',
    html: `
      <p>A new tool has been submitted for review.</p>
      <p>Details:</p>
      <p>${email}</p>
      <p>${post_title}</p>
      <p>${post_link}</p>
      <p>${post_category}</p>
      <p>${post_price}</p>
      <p>${post_description}</p>
      <a href="https://yeai.tech/approve-tool?toolId=${toolId}&pending=approved" style="background-color: #4CAF50; color: white; padding: 15px 32px; text-align: center; text-decoration: none; display: inline-block; font-size: 16px; margin: 4px 2px; cursor: pointer; border-radius: 12px;">Approve</a>
      <a href="https://yeai.tech/approve-tool?toolId=${toolId}&pending=declined" style="background-color: #f44336; color: white; padding: 15px 32px; text-align: center; text-decoration: none; display: inline-block; font-size: 16px; margin: 4px 2px; cursor: pointer; border-radius: 12px;">Decline</a>
    `
  };

  transporter.sendMail(emailData)
    .then(() => transporter.sendMail(adminEmailData))
    .then(() => res.status(200).json({ data }))
    .catch((err) => {
      console.log('SMTP error:', err.message);
      res.status(500).json({ error: err.message });
    });
});

app.get('/update-tool-status', async (req, res) => {
  console.log(req.query); 

  const { toolId, pending } = req.query;

  let { error } = await supabase
  .from('email')
  .update({ status: pending })
  .eq('uuid', toolId);

if (error) {
  return res.status(500).send(`An error occurred: ${error.message}`);
}

let { data, error: fetchError } = await supabase
  .from('email')
  .select('*')
  .eq('uuid', toolId);

if (fetchError) {
  return res.status(500).send(`An error occurred: ${fetchError.message}`);
}

if (pending === 'approved') {
  console.log('Data before insert into tools:', data);
  try {
    const { uuid, ...toolData } = data[0]; // Destructure uuid from data[0]
    console.log('Inserting tool data:', toolData); // Log the data being inserted
    const { data: insertedToolData, error: toolError } = await supabase
      .from('tools')
      .insert([{ email_id: toolId, ...toolData }]); // Spread the remaining fields

    if (toolError) {
      console.log('Error inserting into tools:', toolError.message);
      console.log('Failed tool data:', toolData); // Log the data that failed to insert
      return res.status(500).send(`An error occurred: ${toolError.message}`);
    }
  } catch (err) {
    console.error('Unexpected error when inserting into tools:', err);
    console.error('Failed tool data:', toolData); // Log the data that caused the error
    return res.status(500).send(`An unexpected error occurred: ${err.message}`);
  }
}
  else if (pending === 'declined') {
    const { data: declinedData, error: declinedError } = await supabase
    .from('email')
    .update({ status: 'declined' })
    .eq('uuid', toolId);

    if (declinedError) {
      return res.status(500).send(`An error occurred: ${declinedError.message}`);
    }
  }

  return res.send(`Tool has been ${pending}`);
});





const port = process.env.PORT || 10000;
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
