const express = require('express');
const router = express.Router();
const db = require('../db/init');
const ed = require('../services/ecoledirecte');
const kb = require('../services/knowledgebase');

// Ensure ecoledirecte settings table exists
db.exec(`
  CREATE TABLE IF NOT EXISTS ed_settings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL,
    student_id TEXT,
    student_name TEXT,
    student_class TEXT,
    connected INTEGER DEFAULT 0,
    last_sync TEXT,
    UNIQUE(username, student_id)
  )
`);

// Helper: save student accounts after successful login
function saveAccounts(username, accounts) {
  for (const account of accounts) {
    const studentId = String(Math.floor(Number(account.id) || 0));
    const studentName = `${account.prenom || ''} ${account.nom || ''}`.trim();
    const studentClass = account.classe || '';

    db.prepare(`
      INSERT INTO ed_settings (username, student_id, student_name, student_class, connected, last_sync)
      VALUES (?, ?, ?, ?, 1, datetime('now'))
      ON CONFLICT(username, student_id) DO UPDATE SET
        student_name = excluded.student_name,
        student_class = excluded.student_class,
        connected = 1,
        last_sync = datetime('now')
    `).run(username, studentId, studentName, studentClass);
  }
}

// POST /api/ecoledirecte/login
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ success: false, error: 'Identifiant et mot de passe requis' });
    }

    const result = await ed.login(username, password);

    if (result.success && result.accounts?.length > 0) {
      saveAccounts(username, result.accounts);
      // Auto-sync to Knowledge Base in background
      kb.autoSyncAfterLogin(username).catch(err => console.error('KB auto-sync error:', err.message));
    }

    res.json(result);
  } catch (error) {
    console.error('ED login error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/ecoledirecte/doubleauth/question - Get QCM question
router.post('/doubleauth/question', async (req, res) => {
  try {
    const { username } = req.body;
    if (!username) {
      return res.status(400).json({ success: false, error: 'Username requis' });
    }
    const result = await ed.getDoubleAuthQuestion(username);
    res.json(result);
  } catch (error) {
    console.error('ED double auth question error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/ecoledirecte/doubleauth/answer - Submit QCM answer
router.post('/doubleauth/answer', async (req, res) => {
  try {
    const { username, password, answer } = req.body;
    if (!username || !password || !answer) {
      return res.status(400).json({ success: false, error: 'Username, password et answer requis' });
    }

    const result = await ed.submitDoubleAuthAnswer(username, password, answer);

    if (result.success && result.accounts?.length > 0) {
      saveAccounts(username, result.accounts);
      // Auto-sync to Knowledge Base in background
      kb.autoSyncAfterLogin(username).catch(err => console.error('KB auto-sync error:', err.message));
    }

    res.json(result);
  } catch (error) {
    console.error('ED double auth answer error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/ecoledirecte/status
router.get('/status', (req, res) => {
  const settings = db.prepare('SELECT * FROM ed_settings WHERE connected = 1').all();
  const activeSessions = settings.filter(s => ed.getSession(s.username));

  res.json({
    success: true,
    connected: activeSessions.length > 0,
    accounts: settings.map(s => ({
      username: s.username,
      studentId: s.student_id,
      studentName: s.student_name,
      studentClass: s.student_class,
      sessionActive: !!ed.getSession(s.username),
      lastSync: s.last_sync,
    })),
  });
});

// POST /api/ecoledirecte/logout
router.post('/logout', (req, res) => {
  const { username } = req.body;
  if (username) {
    ed.logout(username);
    db.prepare('UPDATE ed_settings SET connected = 0 WHERE username = ?').run(username);
  }
  res.json({ success: true });
});

// Middleware to check session and get username/studentId
function requireSession(req, res, next) {
  const settings = db.prepare('SELECT * FROM ed_settings WHERE connected = 1').get();
  if (!settings) {
    return res.status(401).json({ success: false, error: 'Non connecte a EcoleDirecte' });
  }

  const session = ed.getSession(settings.username);
  if (!session) {
    return res.status(401).json({ success: false, error: 'SESSION_EXPIRED', message: 'Session expiree, veuillez vous reconnecter' });
  }

  req.edUsername = settings.username;
  req.edStudentId = settings.student_id;
  next();
}

// GET /api/ecoledirecte/homework?date=YYYY-MM-DD&studentId=xxx
router.get('/homework', requireSession, async (req, res) => {
  try {
    const { date, studentId } = req.query;
    const sid = studentId || req.edStudentId;

    let result;
    if (date) {
      result = await ed.getHomework(req.edUsername, sid, date);
    } else {
      result = await ed.getHomeworkRange(req.edUsername, sid);
    }

    res.json(result);
  } catch (error) {
    if (error.message === 'SESSION_EXPIRED') {
      return res.status(401).json({ success: false, error: 'SESSION_EXPIRED' });
    }
    console.error('ED homework error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/ecoledirecte/grades?studentId=xxx
router.get('/grades', requireSession, async (req, res) => {
  try {
    const sid = req.query.studentId || req.edStudentId;
    const result = await ed.getGrades(req.edUsername, sid);
    res.json(result);
  } catch (error) {
    if (error.message === 'SESSION_EXPIRED') {
      return res.status(401).json({ success: false, error: 'SESSION_EXPIRED' });
    }
    console.error('ED grades error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/ecoledirecte/timetable?start=YYYY-MM-DD&end=YYYY-MM-DD&studentId=xxx
router.get('/timetable', requireSession, async (req, res) => {
  try {
    const { start, end, studentId } = req.query;
    const sid = studentId || req.edStudentId;
    const startDate = start || new Date().toISOString().split('T')[0];
    const endD = end || (() => {
      const d = new Date(startDate);
      d.setDate(d.getDate() + (5 - d.getDay()));
      return d.toISOString().split('T')[0];
    })();

    const result = await ed.getTimetable(req.edUsername, sid, startDate, endD);
    res.json(result);
  } catch (error) {
    if (error.message === 'SESSION_EXPIRED') {
      return res.status(401).json({ success: false, error: 'SESSION_EXPIRED' });
    }
    console.error('ED timetable error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
