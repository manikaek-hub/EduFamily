const express = require('express');
const router = express.Router();
const db = require('../db/init');
const { generateJSON } = require('../services/claude');
const { buildQuizPrompt } = require('../services/prompts');
const kb = require('../services/knowledgebase');

// POST /api/quiz/generate
router.post('/generate', async (req, res) => {
  try {
    const { topics, forceRegenerate } = req.body;

    // Check if quiz already exists for today
    const today = new Date().toISOString().split('T')[0];
    const existing = db.prepare('SELECT * FROM quiz_sessions WHERE date = ?').get(today);

    if (existing && !forceRegenerate) {
      return res.json({ success: true, message: 'Quiz deja genere aujourd\'hui', sessionId: existing.id });
    }

    // If force regenerating, delete old quiz for today
    if (existing && forceRegenerate) {
      db.prepare('DELETE FROM quiz_answers WHERE question_id IN (SELECT id FROM quiz_questions WHERE quiz_session_id = ?)').run(existing.id);
      db.prepare('DELETE FROM quiz_questions WHERE quiz_session_id = ?').run(existing.id);
      db.prepare('DELETE FROM quiz_sessions WHERE id = ?').run(existing.id);
    }

    // Get child members
    const children = db.prepare("SELECT * FROM members WHERE role = 'child' ORDER BY age ASC").all();

    // Get KB context - what children studied today
    const childrenContext = kb.getAllChildrenContext();

    // Log context to verify data is being passed
    console.log('Quiz generation - KB context per child:');
    childrenContext.forEach(ctx => {
      console.log(`  ${ctx.name}: ${ctx.recentHomework?.length || 0} homework, ${ctx.recentTopics?.length || 0} topics`);
    });

    const systemPrompt = buildQuizPrompt(children, childrenContext);
    let userMessage = 'Genere le quiz du soir pour la famille.';
    if (topics && topics.length > 0) {
      userMessage += '\nAujourd\'hui, les enfants ont travaille sur:\n';
      topics.forEach(t => {
        userMessage += `- ${t.name}: ${t.subject} (${t.topic})\n`;
      });
    }

    const questions = await generateJSON(systemPrompt, userMessage);

    if (!Array.isArray(questions) || questions.length === 0) {
      return res.status(500).json({ success: false, error: 'Le quiz n\'a pas pu etre genere. Reessayez.' });
    }

    // Save in a transaction so if any question fails, nothing is saved
    const saveQuiz = db.transaction(() => {
      const session = db.prepare('INSERT INTO quiz_sessions (date) VALUES (?)').run(today);
      const sessionId = session.lastInsertRowid;

      const insertQ = db.prepare(
        'INSERT INTO quiz_questions (quiz_session_id, target_member, question_text, choices, correct_answer, difficulty, subject, explanation) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      );

      let savedCount = 0;
      for (const q of questions) {
        if (!q.question_text || !q.choices) continue; // skip malformed questions

        // Search in ALL members (not just children) to find Maman/Papa too
        const allMembers = db.prepare('SELECT * FROM members').all();
        const targetMember = allMembers.find(c => c.name === q.target_member_name);
        const diff = ['easy', 'medium', 'hard'].includes((q.difficulty || '').toLowerCase())
          ? q.difficulty.toLowerCase() : 'medium';
        const correctAnswer = typeof q.correct_answer === 'number' ? q.correct_answer : 0;

        insertQ.run(
          sessionId,
          targetMember ? targetMember.id : null,
          q.question_text,
          JSON.stringify(Array.isArray(q.choices) ? q.choices : []),
          correctAnswer,
          diff,
          q.subject || '',
          q.explanation || ''
        );
        savedCount++;
      }

      if (savedCount === 0) {
        throw new Error('Aucune question valide generee');
      }

      console.log(`Quiz saved: ${savedCount} questions for session ${sessionId}`);
      return sessionId;
    });

    const sessionId = saveQuiz();
    res.json({ success: true, sessionId });
  } catch (error) {
    console.error('Quiz generation error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/quiz/today
router.get('/today', (req, res) => {
  const today = new Date().toISOString().split('T')[0];
  const session = db.prepare('SELECT * FROM quiz_sessions WHERE date = ?').get(today);

  if (!session) {
    return res.json({ success: true, quiz: null });
  }

  const questions = db.prepare(`
    SELECT q.*, m.name as target_name
    FROM quiz_questions q
    LEFT JOIN members m ON q.target_member = m.id
    WHERE q.quiz_session_id = ?
  `).all(session.id);

  // Get answers
  const answers = db.prepare(`
    SELECT qa.* FROM quiz_answers qa
    JOIN quiz_questions q ON qa.question_id = q.id
    WHERE q.quiz_session_id = ?
  `).all(session.id);

  res.json({
    success: true,
    quiz: {
      ...session,
      questions: questions.map(q => ({
        ...q,
        choices: JSON.parse(q.choices || '[]'),
        answered: answers.filter(a => a.question_id === q.id),
      })),
    },
  });
});

// POST /api/quiz/answer
router.post('/answer', (req, res) => {
  const { questionId, memberId, answer } = req.body;

  const question = db.prepare('SELECT * FROM quiz_questions WHERE id = ?').get(questionId);
  if (!question) {
    return res.status(404).json({ success: false, error: 'Question non trouvee' });
  }

  const isCorrect = answer === question.correct_answer ? 1 : 0;

  db.prepare(
    'INSERT INTO quiz_answers (question_id, member_id, answer, is_correct) VALUES (?, ?, ?, ?)'
  ).run(questionId, memberId, answer, isCorrect);

  // Update streak
  const today = new Date().toISOString().split('T')[0];
  const streak = db.prepare('SELECT * FROM quiz_streaks WHERE member_id = ?').get(memberId);

  if (streak) {
    if (streak.last_played !== today) {
      const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
      const newStreak = streak.last_played === yesterday ? streak.current_streak + 1 : 1;
      const bestStreak = Math.max(newStreak, streak.best_streak);
      db.prepare(
        'UPDATE quiz_streaks SET current_streak = ?, best_streak = ?, last_played = ? WHERE member_id = ?'
      ).run(newStreak, bestStreak, today, memberId);
    }
  } else {
    db.prepare(
      'INSERT INTO quiz_streaks (member_id, current_streak, best_streak, last_played) VALUES (?, 1, 1, ?)'
    ).run(memberId, today);
  }

  res.json({
    success: true,
    isCorrect: !!isCorrect,
    explanation: question.explanation,
    correctAnswer: question.correct_answer,
  });
});

// GET /api/quiz/scores
router.get('/scores', (req, res) => {
  const { memberId } = req.query;

  let streaks;
  if (memberId) {
    streaks = db.prepare(`
      SELECT qs.*, m.name, m.avatar_color
      FROM quiz_streaks qs
      JOIN members m ON qs.member_id = m.id
      WHERE qs.member_id = ?
    `).all(memberId);
  } else {
    streaks = db.prepare(`
      SELECT qs.*, m.name, m.avatar_color
      FROM quiz_streaks qs
      JOIN members m ON qs.member_id = m.id
      ORDER BY qs.current_streak DESC
    `).all();
  }

  res.json({ success: true, scores: streaks });
});

module.exports = router;
