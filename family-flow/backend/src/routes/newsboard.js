const express = require('express');
const router = express.Router();
const db = require('../db/init');

// GET /api/posts
router.get('/', (req, res) => {
  const limit = parseInt(req.query.limit) || 20;
  const offset = parseInt(req.query.offset) || 0;

  const posts = db.prepare(`
    SELECT p.*, m.name as author_name, m.avatar_color as author_color, m.role as author_role
    FROM posts p
    JOIN members m ON p.member_id = m.id
    ORDER BY p.created_at DESC
    LIMIT ? OFFSET ?
  `).all(limit, offset);

  // Get reactions for each post
  const postsWithReactions = posts.map(post => {
    const reactions = db.prepare(`
      SELECT emoji, COUNT(*) as count, GROUP_CONCAT(member_id) as member_ids
      FROM post_reactions WHERE post_id = ?
      GROUP BY emoji
    `).all(post.id);

    return {
      ...post,
      reactions: reactions.map(r => ({
        emoji: r.emoji,
        count: r.count,
        memberIds: r.member_ids.split(',').map(Number),
      })),
    };
  });

  res.json({ success: true, posts: postsWithReactions });
});

// POST /api/posts
router.post('/', (req, res) => {
  const { memberId, content, post_type, image_data } = req.body;
  const result = db.prepare(
    'INSERT INTO posts (member_id, content, post_type, image_data) VALUES (?, ?, ?, ?)'
  ).run(memberId, content, post_type || 'update', image_data || null);
  res.json({ success: true, postId: result.lastInsertRowid });
});

// DELETE /api/posts/:id
router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM posts WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// POST /api/posts/:id/reactions
router.post('/:id/reactions', (req, res) => {
  const { memberId, emoji } = req.body;
  try {
    db.prepare(
      'INSERT INTO post_reactions (post_id, member_id, emoji) VALUES (?, ?, ?)'
    ).run(req.params.id, memberId, emoji);
    res.json({ success: true });
  } catch (e) {
    // Already reacted with this emoji - remove it (toggle)
    db.prepare(
      'DELETE FROM post_reactions WHERE post_id = ? AND member_id = ? AND emoji = ?'
    ).run(req.params.id, memberId, emoji);
    res.json({ success: true, toggled: true });
  }
});

module.exports = router;
