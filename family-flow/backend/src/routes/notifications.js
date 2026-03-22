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

  // Evening EDT-based review + photo reminder (17h-21h weekdays)
  const hour = today.getHours();
  const dayOfWeek = today.getDay();
  if (hour >= 17 && hour <= 21 && dayOfWeek >= 1 && dayOfWeek <= 5) {
    for (const child of children) {
      const todayClasses = db.prepare(
        'SELECT DISTINCT subject FROM kb_timetable WHERE member_id = ? AND day_of_week = ?'
      ).all(child.id, dayOfWeek);

      if (todayClasses.length > 0) {
        const subjectList = todayClasses.map(c => c.subject).join(', ');
        const dueReviews = db.prepare(`
          SELECT COUNT(*) as c FROM kb_topics
          WHERE member_id = ? AND (next_review_date IS NULL OR next_review_date <= ?)
        `).get(child.id, todayStr);

        if (dueReviews?.c > 0) {
          notifications.push({
            type: 'tip',
            icon: '🔁',
            title: `${child.name} : ${dueReviews.c} revision${dueReviews.c > 1 ? 's' : ''} a faire ce soir`,
            description: `Cours du jour: ${subjectList}. Methode 2-3-5-7 active !`,
            memberId: child.id,
            action: 'review',
          });
        } else {
          notifications.push({
            type: 'tip',
            icon: '📖',
            title: `${child.name} : cours du jour a relire`,
            description: `Aujourd'hui: ${subjectList}. 10 min de relecture pour ancrer la memoire !`,
            memberId: child.id,
            action: 'kb',
          });
        }
      }
    }

    notifications.push({
      type: 'tip',
      icon: '🌙',
      title: 'Routine du soir — on s\'y met ?',
      description: 'Photos des cours + évaluations → Foxie génère votre plan de révision personnalisé !',
      action: 'routine',
    });
  } else if (hour >= 15 && hour < 17 && dayOfWeek >= 1 && dayOfWeek <= 5) {
    notifications.push({
      type: 'tip',
      icon: '🌙',
      title: 'Routine du soir — prépare tes cours',
      description: 'Prends en photo tes cours du jour pour que Foxie prépare ton plan de révision ce soir !',
      action: 'routine',
    });
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

  // Low grade alerts
  for (const child of children) {
    try {
      const weakGrades = db.prepare(`
        SELECT * FROM kb_grades
        WHERE member_id = ? AND (student_avg < 10 OR (class_avg IS NOT NULL AND student_avg < class_avg - 2))
        ORDER BY student_avg ASC LIMIT 2
      `).all(child.id);
      if (weakGrades.length > 0) {
        const subjects = weakGrades.map(g => `${g.subject} (${g.student_avg}/20)`).join(', ');
        notifications.push({
          type: 'warning',
          icon: '📉',
          title: `${child.name} : notes à renforcer`,
          description: subjects,
          memberId: child.id,
          action: 'revision',
        });
      }
    } catch {}
  }

  // Sort: urgent first, then warning, then info, then tips
  const priority = { urgent: 0, warning: 1, info: 2, tip: 3 };
  notifications.sort((a, b) => (priority[a.type] || 9) - (priority[b.type] || 9));

  res.json({ success: true, notifications });
});

module.exports = router;
