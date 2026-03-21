require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Routes
app.use('/api/family', require('./routes/family'));
app.use('/api/homework', require('./routes/homework'));
app.use('/api/activities', require('./routes/calendar'));
app.use('/api/posts', require('./routes/newsboard'));
app.use('/api/quiz', require('./routes/quiz'));
app.use('/api/ecoledirecte', require('./routes/ecoledirecte'));
app.use('/api/kb', require('./routes/knowledgebase'));
app.use('/api/revision', require('./routes/revision'));
app.use('/api/notifications', require('./routes/notifications'));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', app: 'Family Flow' });
});

const PORT = process.env.PORT || 3002;
app.listen(PORT, () => {
  console.log(`Family Flow API running on http://localhost:${PORT}`);
});
