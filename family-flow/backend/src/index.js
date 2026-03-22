require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Training data collector middleware (Agent 1)
const { preCollector, postCollector } = require('./middleware/trainingCollector');

// Routes
app.use('/api/family', require('./routes/family'));
app.use('/api/homework', preCollector, postCollector, require('./routes/homework'));
app.use('/api/activities', require('./routes/calendar'));
app.use('/api/posts', require('./routes/newsboard'));
app.use('/api/quiz', require('./routes/quiz'));
app.use('/api/ecoledirecte', require('./routes/ecoledirecte'));
app.use('/api/kb', require('./routes/knowledgebase'));
app.use('/api/revision', require('./routes/revision'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/xp', require('./routes/xp'));
app.use('/api/routine', require('./routes/routine'));
app.use('/api/profile', require('./routes/profile'));
app.use('/api/parent', require('./routes/parent'));
app.use('/api/avatar', require('./routes/avatar'));
app.use('/api/feedback', require('./routes/feedback'));

// Agent d'amélioration continue — endpoint d'analyse
const { runAnalysis, getTrends } = require('./agents/improvementAgent');
app.post('/api/feedback/analyze', async (req, res) => {
  try {
    const result = await runAnalysis();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.get('/api/feedback/trends', (req, res) => {
  try {
    res.json(getTrends());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', app: 'Family Flow' });
});

const PORT = process.env.PORT || 3002;
const HOST = process.env.HOST || '0.0.0.0'; // Listen on all interfaces for mobile access
app.listen(PORT, HOST, () => {
  console.log(`Family Flow API running on http://${HOST}:${PORT}`);
  // Show local network URL for mobile access
  try {
    const os = require('os');
    const nets = os.networkInterfaces();
    for (const name of Object.keys(nets)) {
      for (const net of nets[name]) {
        if (net.family === 'IPv4' && !net.internal) {
          console.log(`  Mobile: http://${net.address}:${PORT}`);
        }
      }
    }
  } catch {}
});
