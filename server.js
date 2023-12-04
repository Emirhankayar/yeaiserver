const express = require("express");
const { createClient } = require("@supabase/supabase-js");
const dotenv = require("dotenv");
const cors = require("cors");
const nodemailer = require("nodemailer");

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

if (
  !supabaseUrl ||
  !supabaseKey ||
  !smtpHost ||
  !smtpPort ||
  !smtpUser ||
  !smtpPass
) {
  throw new Error(
    "Supabase URL, key and SMTP credentials are required in the .env file"
  );
}

const supabase = createClient(supabaseUrl, supabaseKey);
const transporter = nodemailer.createTransport({
  host: smtpHost,
  port: smtpPort,
  auth: {
    user: smtpUser,
    pass: smtpPass,
  },
});
const { v4: uuidv4 } = require("uuid");

// Route Handlers
const retrieveAllCategoriesFromSupabase = async (type) => {
  try {
    let data, error;
    if (type === 'newscategories') {
      ({ data, error } = await supabase
        .from("distinct_news_categories")
        .select("*")
        .order("post_category", { ascending: true }));
    } else if (type === 'categories') {
      ({ data, error } = await supabase
        .from("distinct_categories")
        .select("*")
        .order("post_category", { ascending: true }));
    }

    if (error) {
      console.error(`Error fetching ${type}:`, error);
      return [];
    }

    const categories = data
      .map((item) => item.post_category)
      .filter((category) => category !== null);
    return categories;
  } catch (error) {
    console.error(`Error fetching distinct ${type}:`, error.message);
    return [];
  }
};

app.get("/allCategories", async (req, res) => {
  const type = req.query.type;
  const categories = await retrieveAllCategoriesFromSupabase(type);
  res.json(categories);
});

app.get("/trendingPosts", async (req, res) => {
  const { limit = 10 } = req.query;

  try {
    let query = supabase
      .from("tools")
      .select("*")
      .order("post_view", { ascending: false })
      .limit(limit);

    const { data: popularPosts, error } = await query;

    if (error) {
      console.error("Error retrieving popular posts:", error);
      res.status(500).json({ error: "Error fetching trending posts" });
      return;
    }

    res.status(200).json(popularPosts.slice(0, limit));
  } catch (error) {
    console.error("Error retrieving popular posts:", error);
    res.status(500).json({ error: "Error fetching trending posts" });
  }
});

app.get("/postsByCategory", async (req, res) => {
  const {
    categoryName,
    offset,
    limit,
    searchTerm,
    sortBy,
    sortOrder,
    filterBy,
  } = req.query;

  try {
    let query = supabase.from("tools").select("*");

    if (categoryName) {
      query = query.eq("post_category", categoryName);
    }

    if (searchTerm) {
      query = query.ilike("post_title", `%${searchTerm}%`); // Filter posts by title
    }

    if (sortBy) {
      query = query.order(sortBy, { ascending: sortOrder === "asc" }); // Sort posts
    }

    if (filterBy) {
      query = query.eq("post_price", filterBy); // Filter posts by price
    }

    const { data: allPosts, error } = await query;

    if (error) {
      return res.status(500).json({ error: "Error fetching posts" });
    }

    const totalPosts = allPosts.length;

    const posts = allPosts.slice(
      parseInt(offset) * parseInt(limit),
      (parseInt(offset) + 1) * parseInt(limit)
    );

    // Fetch image URLs for each post
    for (let post of posts) {
      const { data: imageData, error: imageError } = await supabase.storage
        .from("images")
        .getPublicUrl(`${post.id}.webp`);
      if (imageError) {
        console.error("Error fetching image: ", imageError);
        return res.status(500).json({ error: "Error fetching image" });
      }

      const { data: iconData, error: iconError } = await supabase.storage
        .from("favicons")
        .getPublicUrl(`${post.id}.png`);
      if (iconError) {
        console.error("Error fetching icon: ", iconError);
        return res.status(500).json({ error: "Error fetching icon" });
      }

      post.image = imageData;
      post.icon = iconData;
    }

    return res.status(200).json({ posts, totalPosts });
  } catch (error) {
    return res.status(500).json({ error: "Error fetching posts" });
  }
});



app.get("/newsByCategory", async (req, res) => {
  const {
    categoryName,
    offset,
    limit,
    searchTerm,
    sortBy,
    sortOrder,
  } = req.query;

  try {
    let query = supabase.from("news").select("*");

    if (categoryName) {
      query = query.eq("post_category", categoryName);
    }

    if (searchTerm) {
      query = query.ilike("post_title", `%${searchTerm}%`); // Filter posts by title
    }

    if (sortBy) {
      query = query.order(sortBy, { ascending: sortOrder === "asc" }); // Sort posts
    }

    const { data: allPosts, error } = await query;

    if (error) {
      return res.status(500).json({ error: "Error fetching posts" });
    }

    const totalPosts = allPosts.length;

    const posts = allPosts.slice(
      parseInt(offset) * parseInt(limit),
      (parseInt(offset) + 1) * parseInt(limit)
    );

    // Fetch image URLs for each post
    for (let post of posts) {
      const { data: imageData, error: imageError } = await supabase.storage
        .from("news_images")
        .getPublicUrl(`${post.post_id}.png`);
      if (imageError) {
        console.error("Error fetching image: ", imageError);
        return res.status(500).json({ error: "Error fetching image" });
      }

      post.image = imageData;
    }

    return res.status(200).json({ posts, totalPosts });
  } catch (error) {
    return res.status(500).json({ error: "Error fetching posts" });
  }
});







app.put("/updatePostView", async (req, res) => {
  const { postId, post_view } = req.body;

  try {
    const updatedView = (post_view || 0) + 1;

    const { error } = await supabase
      .from("tools")
      .update({ post_view: updatedView })
      .eq("id", postId);

    if (error) {
      console.error("Error updating post view:", error);
      res.status(500).json({ error: "Error updating post view" });
      return;
    }

    res.status(200).json({ message: "Post view updated successfully" });
  } catch (error) {
    console.error("Error updating post view:", error);
    res.status(500).json({ error: "Error updating post view" });
  }
});

app.put("/toggleBookmark", async (req, res) => {
  const { userId, postId } = req.body;

  try {
    // Check if the bookmark already exists
    let { data: existingBookmark, error: fetchError } = await supabase
      .from("user_bookmarked_posts")
      .select("*")
      .eq("user_id", userId)
      .eq("post_id", postId)
      .maybeSingle();

    if (fetchError) {
      console.error("Error fetching bookmark:", fetchError);
      res.status(500).json({ error: "Error fetching bookmark" });
      return;
    }

    if (existingBookmark) {
      // If the bookmark exists, delete it
      let { error: deleteError } = await supabase
        .from("user_bookmarked_posts")
        .delete()
        .eq("user_id", userId)
        .eq("post_id", postId);

      if (deleteError) {
        console.error("Error deleting bookmark:", deleteError);
        res.status(500).json({ error: "Error deleting bookmark" });
        return;
      }
    } else {
      // If the bookmark doesn't exist, create it
      let { error: insertError } = await supabase
        .from("user_bookmarked_posts")
        .insert([{ user_id: userId, post_id: postId }]);

      if (insertError) {
        console.error("Error creating bookmark:", insertError);
        res.status(500).json({ error: "Error creating bookmark" });
        return;
      }
    }

    res.status(200).json({ success: true });
  } catch (error) {
    console.error("Error toggling bookmark:", error);
    res.status(500).json({ error: "Error toggling bookmark" });
  }
});

app.get("/getBookmarkIds", async (req, res) => {
  const userId = req.query.userId;

  try {
    const { data: bookmarkedPosts, error: bookmarkedError } = await supabase
      .from("user_bookmarked_posts")
      .select("post_id")
      .eq("user_id", userId);

    const bookmarkedPostIds = bookmarkedPosts
      ? bookmarkedPosts.map((post) => post.post_id)
      : [];

    const { data: addedPosts, error: addedError } = await supabase
      .from("user_added_posts")
      .select("post_id")
      .eq("user_id", userId);

    const userAddedPostIds = addedPosts
      ? addedPosts.map((post) => post.post_id)
      : [];

    if (bookmarkedError || addedError) {
      console.error(
        "Error fetching bookmark IDs:",
        bookmarkedError || addedError
      );
      return res.status(500).json({ error: "Internal server error" });
    }

    res.json({ bookmarkedPostIds, userAddedPostIds });
  } catch (error) {
    console.error("Error fetching bookmark IDs:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/added-posts/:userId", async (req, res) => {
  const { userId } = req.params;
  const page = req.query.page || 1;
  const limit = 5;
  const offset = (page - 1) * limit;

  let {
    data: addedPosts,
    error: addedError,
    count,
  } = await supabase
    .from("user_added_posts")
    .select("*", { count: "exact" })
    .eq("user_id", userId)
    .range(offset, offset + limit - 1);

  if (addedError) {
    console.error("Error fetching added posts: ", addedError);
    return res.status(500).json({ error: "Error fetching added posts" });
  }

  // Fetch the favicons for each post
  for (let post of addedPosts) {
    const { data: iconData, error: iconError } = await supabase.storage
      .from("favicons")
      .getPublicUrl(`${post.id}.png`);
    if (iconError) {
      console.error("Error fetching icon: ", iconError);
    } else {
      post.icon = iconData;
    }
  }

  res.json({
    addedPosts,
    totalPages: Math.ceil(count / limit),
    totalPosts: count,
  });
});

app.get("/bookmarked-posts/:userId", async (req, res) => {
  const { userId } = req.params;
  const page = req.query.page || 1;
  const limit = 5;
  const offset = (page - 1) * limit;

  // Fetch the bookmarked post ids for the user
  let { data: userBookmarks, error: bookmarkError } = await supabase
    .from("user_bookmarked_posts")
    .select("post_id")
    .eq("user_id", userId);

  // If there's an error fetching the bookmarks, return an error response
  if (bookmarkError) {
    res.status(500).json({ error: bookmarkError.message });
    return;
  }

  // Extract the post ids from the user bookmarks
  const postIds = userBookmarks.map((bookmark) => bookmark.post_id);

  // Fetch the bookmarked posts
  let {
    data: bookmarkedPosts,
    error: postsError,
    count,
  } = await supabase
    .from("tools")
    .select("*", { count: "exact" })
    .in("id", postIds)
    .range(offset, offset + limit - 1);

  if (postsError) {
    console.error("Error fetching bookmarked posts: ", postsError);
    return res.status(500).json({ error: "Error fetching bookmarked posts" });
  }

  // Fetch the favicons for each post
  for (let post of bookmarkedPosts) {
    const { data: iconData, error: iconError } = await supabase.storage
      .from("favicons")
      .getPublicUrl(`${post.id}.png`);
    if (iconError) {
      console.error("Error fetching icon: ", iconError);
    } else {
      post.icon = iconData;
    }
  }

  res.json({
    bookmarkedPosts,
    totalPages: Math.ceil(count / limit),
    totalPosts: count,
  });
});

app.post("/report-issue", async (req, res) => {
  const { post, message, email } = req.body;

  const emailData = {
    from: email,
    to: "emirhan.kayar80@gmail.com",
    subject: `Report for post: ${post}`,
    text: message,
  };

  transporter
    .sendMail(emailData)
    .then(() => res.status(200).json({ message: "Report sent successfully" }))
    .catch((err) => {
      console.log("SMTP error:", err.message);
      res.status(500).json({ error: err.message });
    });
});

app.post("/send-email", async (req, res) => {
  console.log("Request body:", req.body);

  const {
    user_id,
    email,
    post_link,
    post_category,
    post_description,
    post_price,
    post_title,
    post_image,
  } = req.body;

  const toolId = uuidv4(); // Generate a unique id for the tool

  // Remove the data type and encoding scheme from the base64 string
  const base64Image = post_image.split(';base64,').pop();

  // Convert the base64 string to a Buffer
  const imageBuffer = Buffer.from(base64Image, "base64");

  // Upload the image to the 'favicon' bucket with the toolId as the file name
  const { error: uploadError } = await supabase.storage
    .from("favicons")
    .upload(`${toolId}.png`, imageBuffer, { contentType: 'image/png' });

  console.log(`Final image name: ${toolId}.png`);

  if (uploadError) {
    console.log("Upload error:", uploadError.message);
    return res.status(500).json({ error: uploadError.message });
  }


  const { data, error: insertError } = await supabase
    .from("user_added_posts")
    .insert([
      {
        user_id,
        post_id: toolId,
        post_link,
        post_category,
        post_description,
        post_price,
        post_title,
        status: "pending",
      },
    ]);

  if (insertError) {
    console.log("Database error:", insertError.message);
    return res.status(500).json({ error: insertError.message });
  }

  const emailData = {
    from: "Yeai <noreply@yeai.tech>",
    to: email,
    subject: "Submission received",
    text: "Your tool submission is successful. We will further inspect it.",
  };

  const adminEmailData = {
    from: "Yeai <noreply@yeai.tech>",
    to: "emirhan.kayar80@gmail.com", // replace with the admin's email
    subject: "New tool submitted",
    html: `
      <p>A new tool has been submitted for review.</p>
      <p>Details:</p>
      <p>${user_id}</p>
      <p>${email}</p>
      <p>${post_title}</p>
      <p>${post_link}</p>
      <p>${post_category}</p>
      <p>${post_price}</p>
      <p>${post_description}</p>
      <a href="https://yeai.tech/approve-tool?toolId=${toolId}&pending=approved" style="background-color: #4CAF50; color: white; padding: 15px 32px; text-align: center; text-decoration: none; display: inline-block; font-size: 16px; margin: 4px 2px; cursor: pointer; border-radius: 12px;">Approve</a>
      <a href="https://yeai.tech/approve-tool?toolId=${toolId}&pending=declined" style="background-color: #f44336; color: white; padding: 15px 32px; text-align: center; text-decoration: none; display: inline-block; font-size: 16px; margin: 4px 2px; cursor: pointer; border-radius: 12px;">Decline</a>
    `,
  };

  transporter
    .sendMail(emailData)
    .then(() => transporter.sendMail(adminEmailData))
    .then(() => res.status(200).json({ data }))
    .catch((err) => {
      console.log("SMTP error:", err.message);
      res.status(500).json({ error: err.message });
    });
});

app.get("/update-tool-status", async (req, res) => {
  console.log(req.query);

  const { toolId, pending } = req.query;

  let { error } = await supabase
    .from("user_added_posts")
    .update({ status: pending })
    .eq("post_id", toolId);

  if (error) {
    return res.status(500).send(`An error occurred: ${error.message}`);
  }

  let { data, error: fetchError } = await supabase
    .from("user_added_posts")
    .select("*")
    .eq("post_id", toolId);

  if (fetchError) {
    return res.status(500).send(`An error occurred: ${fetchError.message}`);
  }

  if (pending === "approved") {
    const { user_id, post_id, status, ...toolData } = data[0]; // Destructure user_id, post_id and status from data[0]
    const { error: toolInsertError } = await supabase
      .from("tools")
      .insert([{ id: post_id, ...toolData }]); // Spread the remaining fields

    if (toolInsertError) {
      console.log("Database error:", toolInsertError.message);
      return res.status(500).json({ error: toolInsertError.message });
    }
  }

  return res.send(`Tool has been ${pending}`);
});

const port = process.env.PORT || 10000;
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
