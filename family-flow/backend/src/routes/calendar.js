const express = require('express');
const router = express.Router();
const db = require('../db/init');

// GET /api/activities
router.get('/', (req, res) => {
  const { month, memberId } = req.query;

  let query = `
    SELECT a.*, GROUP_CONCAT(am.member_id) as member_ids
    FROM activities a
    LEFT JOIN activity_members am ON a.id = am.activity_id
  `;
  const params = [];
  const conditions = [];

  if (month) {
    conditions.push("a.start_time LIKE ?");
    params.push(`${month}%`);
  }

  if (memberId) {
    conditions.push("a.id IN (SELECT activity_id FROM activity_members WHERE member_id = ?)");
    params.push(memberId);
  }

  if (conditions.length > 0) {
    query += ' WHERE ' + conditions.join(' AND ');
  }

  query += ' GROUP BY a.id ORDER BY a.start_time ASC';

  const activities = db.prepare(query).all(...params).map(a => ({
    ...a,
    memberIds: a.member_ids ? a.member_ids.split(',').map(Number) : [],
  }));

  res.json({ success: true, activities });
});

// POST /api/activities
router.post('/', (req, res) => {
  const { title, description, category, start_time, end_time, all_day, memberIds, created_by } = req.body;

  const result = db.prepare(
    'INSERT INTO activities (title, description, category, start_time, end_time, all_day, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(title, description || null, category, start_time, end_time || null, all_day ? 1 : 0, created_by || null);

  const activityId = result.lastInsertRowid;

  if (memberIds && memberIds.length > 0) {
    const insertMember = db.prepare('INSERT INTO activity_members (activity_id, member_id) VALUES (?, ?)');
    for (const mid of memberIds) {
      insertMember.run(activityId, mid);
    }
  }

  res.json({ success: true, activityId });
});

// PUT /api/activities/:id
router.put('/:id', (req, res) => {
  const { title, description, category, start_time, end_time, all_day, memberIds } = req.body;

  db.prepare(
    'UPDATE activities SET title = ?, description = ?, category = ?, start_time = ?, end_time = ?, all_day = ? WHERE id = ?'
  ).run(title, description || null, category, start_time, end_time || null, all_day ? 1 : 0, req.params.id);

  // Update members
  db.prepare('DELETE FROM activity_members WHERE activity_id = ?').run(req.params.id);
  if (memberIds && memberIds.length > 0) {
    const insertMember = db.prepare('INSERT INTO activity_members (activity_id, member_id) VALUES (?, ?)');
    for (const mid of memberIds) {
      insertMember.run(req.params.id, mid);
    }
  }

  res.json({ success: true });
});

// DELETE /api/activities/:id
router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM activities WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

module.exports = router;
