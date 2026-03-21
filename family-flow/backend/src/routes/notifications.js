const express = require('express');
const router = express.Router();
const db = require('../db/init');

// GET /api/notifications - Smart notifications for the dashboard
router.get('/', (req, res) => {
  const notifications = [];
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth()+1).padStart(2,'0')}-${String(tomorrow.getDate()).padStart(2,'0')}`;
  const dayAfter = new Date(today);
  dayAfter.setDate(dayAfter.getDate() + 2);
  const dayAfterStr = `${dayAfter.getFullYear()}-${String(dayAfter.getMonth()+1).padStart(2,'0')}-${String(dayAfter.getDate()).padStart(2,'0')}`;

  const children = db.prepare("SELECT * FROM members WHERE role = 'child'").all();

  for (const child of children) {
    // Homework due today
    const dueToday = db.prepare(
      'SELECT subject, description FROM kb_homework WHERE member_id = ? AND due_date = ? AND done = 0'
    ).all(child.id, todayStr);

    if (dueToday.length > 0) {
      notifications.push({
        type: 'urgent',
        icon: '🚨',
        title: `${child.name} : ${dueToday.length} devoir${dueToday.length > 1 ? 's' : ''} pour aujourd'hui !`,
        description: dueToday.map(h => h.subject).join(', '),
        memberId: child.id,
        action: 'homework',
      });
    }

    // Homework due tomorrow
    const dueTomorrow = db.prepare(
      'SELECT subject, description FROM kb_homework WHERE member_id = ? AND due_date = ? AND done = 0'
    ).all(child.id, tomorrowStr);

    if (dueTomorrow.length > 0) {
      notifications.push({
        type: 'warning',
        icon: '⏰',
        title: `${child.name} : ${dueTomorrow.length} devoir${dueTomorrow.length > 1 ? 's' : ''} pour demain`,
        description: dueTomorrow.map(h => `${h.subject}: ${h.description?.slice(0, 50)}`).join(' | '),
        memberId: child.id,
        action: 'homework',
      });
    }

    // Homework due day after tomorrow
    const dueDayAfter = db.prepare(
      'SELECT subject FROM kb_homework WHERE member_id = ? AND due_date = ? AND done = 0'
    ).all(child.id, dayAfterStr);

    if (dueDayAfter.length > 0) {
      notifications.push({
        type: 'info',
        icon: '📅',
        title: `${child.name} : ${dueDayAfter.length} devoir${dueDayAfter.length > 1 ? 's' : ''} dans 2 jours`,
        description: dueDayAfter.map(h => h.subject).join(', '),
        memberId: child.id,
        action: 'revision',
      });
    }
  }

  // Daily photo reminder (afternoon only, 15h-20h)
  const hour = today.getHours();
  if (hour >= 15 && hour <= 20) {
    const dayOfWeek = today.getDay();
    if (dayOfWeek >= 1 && dayOfWeek <= 5) {
      notifications.push({
        type: 'tip',
        icon: '📸',
        title: 'Photo des cours du jour ?',
        description: 'Prenez en photo les cours et exercices d\'aujourd\'hui pour que Foxie puisse mieux vous aider !',
        action: 'photo',
      });
    }
  }

  // Revision reminder if no active plan
  for (const child of children) {
    const hasHw = db.prepare('SELECT COUNT(*) as c FROM kb_homework WHERE member_id = ? AND done = 0').get(child.id);
    const hasPlan = db.prepare(
      'SELECT id FROM revision_plans WHERE member_id = ? AND valid_until >= ? ORDER BY created_at DESC LIMIT 1'
    ).get(child.id, todayStr);

    if (hasHw?.c > 3 && !hasPlan) {
      notifications.push({
        type: 'tip',
        icon: '📋',
        title: `Programme de revision pour ${child.name} ?`,
        description: `${hasHw.c} devoirs en attente. Generez un programme de revision personnalise !`,
        memberId: child.id,
        action: 'revision',
      });
    }
  }

  // Sort: urgent first, then warning, then info, then tips
  const priority = { urgent: 0, warning: 1, info: 2, tip: 3 };
  notifications.sort((a, b) => (priority[a.type] || 9) - (priority[b.type] || 9));

  res.json({ success: true, notifications });
});

module.exports = router;
