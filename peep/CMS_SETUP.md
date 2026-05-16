# Peep CMS Setup Guide

## Overview

Your Peep application now has a comprehensive Content Management System (CMS) that allows you to:
- Edit video metadata and titles
- Upload and manage thumbnails
- Create, read, update, and delete content rows
- Real-time updates via Supabase subscriptions
- Search and filter content by category

## Architecture

### Components
- **CMS.jsx** - Main CMS interface with data table, edit form, and real-time sync
- **ImageUploader.jsx** - Reusable image upload component
- **storageUtils.js** - Supabase Storage utilities for file management

### Key Features
✅ Real-time streaming updates via Supabase subscriptions
✅ Image upload to Supabase Storage
✅ Advanced filtering (search + category)
✅ Batch operations support
✅ Responsive data table with inline editing
✅ Toast notifications for user feedback

## Supabase Storage Setup

### 1. Create Storage Bucket
1. Go to [Supabase Dashboard](https://app.supabase.com)
2. Select your project
3. Go to **Storage** > **Buckets**
4. Create a new bucket named `peep-media`
5. Set bucket to **Public** (allows public access to uploaded files)

### 2. Storage Policies
Add the following policies to `peep-media` bucket:

**Policy 1: Select (Public Read)**
```
SELECT = true
INSERT = false
UPDATE = false
DELETE = false
Role = public
```

**Policy 2: Insert (Authenticated)**
```
SELECT = true
INSERT = true
UPDATE = false
DELETE = false
Role = authenticated
```

**Policy 3: Update (Authenticated)**
```
SELECT = true
INSERT = false
UPDATE = true
DELETE = false
Role = authenticated
```

**Policy 4: Delete (Authenticated)**
```
SELECT = true
INSERT = false
UPDATE = false
DELETE = true
Role = authenticated
```

### 3. Access the CMS

Click the **"P"** avatar in the top-right corner of the homepage to enter the CMS.

## CMS Usage

### Adding a New Row
1. Fill in the form on the left panel:
   - **Title** * (required)
   - **Category** - Select from predefined categories
   - **Rating** - Content rating
   - **Year** - Release year
   - **Duration** - Video length
   - **Score** - Match percentage
   - **Thumbnail URL** - Link to thumbnail image
   - **Video URL** * (required) - Link to video file
   - **Tags** - Comma-separated keywords
   - **Description** - Content synopsis

2. Click "Add Row"

### Editing a Row
1. Click "Edit" button on any row in the table
2. Modify the fields in the left panel
3. Click "Save Changes"

### Deleting a Row
1. Click "Delete" button on any row
2. Confirm deletion in the modal

### Filtering & Search
- Use the **search box** to find content by title or category
- Click **category buttons** to filter by specific genres
- Click **"↺ Refresh"** to reload all data

## Real-Time Features

The CMS subscribes to Supabase changes via PostgreSQL subscriptions:

```javascript
.on(
  "postgres_changes",
  { event: "*", schema: "public", table: "videos" },
  (payload) => {
    // Handles INSERT, UPDATE, DELETE events
    // UI updates automatically across all connected sessions
  }
)
```

### What This Means
- When any user adds/edits/deletes content, **all other users see it instantly**
- Changes sync in real-time across all open CMS instances
- Perfect for collaborative content management

## Image Upload

### Uploading Thumbnails
1. Click in the thumbnail URL field
2. Alternatively, use the `ImageUploader` component (already integrated)
3. Images are stored in `peep-media/thumbnails/` folder
4. Public URL is automatically generated

### Supported Formats
- JPG / JPEG
- PNG
- WebP
- GIF

## File Structure

```
src/
├── App.jsx                    # Main app (updated with CMS import)
├── components/
│   ├── CMS.jsx              # Main CMS component
│   └── ImageUploader.jsx     # Image upload component
├── lib/
│   └── storageUtils.js       # Storage utilities
└── supabase.js              # Supabase client
```

## Environment Variables

Your Supabase credentials are in `src/supabase.js`. They're public-safe credentials (publishable key), but for production, consider:

```javascript
// .env.local (if you want to use env vars)
VITE_SUPABASE_URL=https://iuozujwtuzuwubhsnhix.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_Rf2P9mKxbkTnc4BAAQJ7mQ_Zg5g9083
```

## Database Schema

Your `videos` table should have the following columns:

```sql
CREATE TABLE videos (
  id BIGSERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  category TEXT,
  rating TEXT,
  score BIGINT,
  duration TEXT,
  year BIGINT,
  thumbnail TEXT,
  url TEXT NOT NULL,
  description TEXT,
  tags TEXT[] DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
```

## Troubleshooting

### Storage Bucket Not Found
- Ensure bucket is named exactly `peep-media`
- Verify bucket is set to Public
- Check bucket policies are configured

### Images Not Uploading
- Check browser console for errors
- Verify Supabase Storage policies are correct
- Ensure file size is under 50MB

### Real-Time Updates Not Working
- Check Supabase RealtimeEnabled on `videos` table
- Verify network connection
- Check browser console for subscription errors

### CMS Not Loading
- Verify Supabase URL and keys in `supabase.js`
- Check if `videos` table exists in Supabase
- Clear browser cache and reload

## API Reference

### uploadImage(file, folder)
```javascript
const result = await uploadImage(file, "thumbnails");
// Returns: { url, path, error }
```

### deleteImage(path)
```javascript
const result = await deleteImage("thumbnails/image.jpg");
// Returns: { error }
```

### listImages(folder)
```javascript
const result = await listImages("thumbnails");
// Returns: { files, error }
```

### getPublicUrl(path)
```javascript
const url = getPublicUrl("thumbnails/image.jpg");
// Returns: public URL string
```

## Performance Tips

1. **Compress images** before uploading (use online tools)
2. **Use consistent dimensions** for thumbnails (e.g., 16:10 aspect ratio)
3. **Limit description length** to ~500 characters
4. **Batch operations** when possible
5. **Index important columns** in Supabase dashboard

## Next Steps

1. ✅ Set up Supabase Storage bucket
2. ✅ Configure storage policies
3. ✅ Start adding content via CMS
4. ✅ Enable RealtimeEnabled for `videos` table
5. Test with multiple users for real-time sync

## Support

For issues with:
- **Supabase**: Check [Supabase Docs](https://supabase.com/docs)
- **React**: Check [React Docs](https://react.dev)
- **Vite**: Check [Vite Docs](https://vitejs.dev)

---

Happy content managing! 🎬
