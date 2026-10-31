const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));
app.use(express.static('public'));

// Create uploads directory
if (!fs.existsSync('uploads')) {
  fs.mkdirSync('uploads', { recursive: true });
}

// Multer configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    const name = path.basename(file.originalname, ext);
    cb(null, name + '-' + uniqueSuffix + ext);
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 100 * 1024 * 1024 }
});

// Initialize Database
const db = new sqlite3.Database('database.db', (err) => {
  if (err) {
    console.error('❌ Database connection error:', err);
  } else {
    console.log('✅ Connected to SQLite database');
    initializeDatabase();
  }
});

function initializeDatabase() {
  db.run(`
    CREATE TABLE IF NOT EXISTS notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      subject TEXT NOT NULL,
      description TEXT,
      fileUrl TEXT,
      fileName TEXT,
      uploadedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `, (err) => {
    if (err) console.error('❌ Table creation error:', err);
    else console.log('✅ Database tables initialized');
  });
}

// Admin Password
const adminPassword = '143065';

// Verify Admin Middleware
function verifyAdmin(req, res, next) {
  const password = req.body.password || req.headers['x-admin-password'];
  
  if (password && password === adminPassword) {
    next();
  } else {
    res.status(403).json({ 
      success: false, 
      error: 'Invalid admin password' 
    });
  }
}

// ==================== API ROUTES ====================

// GET - Fetch all notes
app.get('/api/notes', (req, res) => {
  const subject = req.query.subject;
  
  let query = 'SELECT * FROM notes ORDER BY uploadedAt DESC';
  let params = [];
  
  if (subject && subject !== 'all') {
    query = 'SELECT * FROM notes WHERE subject = ? ORDER BY uploadedAt DESC';
    params = [subject];
  }
  
  db.all(query, params, (err, rows) => {
    if (err) {
      console.error('Database error:', err);
      res.status(500).json({ success: false, error: 'Database error' });
    } else {
      res.json({ success: true, data: rows || [] });
    }
  });
});

// GET - Fetch specific note
app.get('/api/notes/:id', (req, res) => {
  db.get('SELECT * FROM notes WHERE id = ?', [req.params.id], (err, row) => {
    if (err) {
      res.status(500).json({ success: false, error: 'Database error' });
    } else if (row) {
      res.json({ success: true, data: row });
    } else {
      res.status(404).json({ success: false, error: 'Note not found' });
    }
  });
});

// GET - Subjects
app.get('/api/subjects', (req, res) => {
  const subjects = ['Chemistry', 'Biology', 'Math', 'Physics', 'ICT'];
  res.json({ success: true, data: subjects });
});

// POST - Verify Admin Password
app.post('/api/admin/verify', (req, res) => {
  const { password } = req.body;
  
  if (password === adminPassword) {
    res.json({ success: true, valid: true });
  } else {
    res.status(403).json({ success: false, valid: false, error: 'Invalid password' });
  }
});

// POST - Upload Note (Admin only)
app.post('/api/notes', verifyAdmin, upload.single('file'), (req, res) => {
  const { title, subject, description } = req.body;
  
  if (!title || !subject) {
    return res.status(400).json({ success: false, error: 'Title and subject required' });
  }
  
  const fileUrl = req.file ? `/uploads/${req.file.filename}` : null;
  const fileName = req.file ? req.file.originalname : null;
  
  const sql = `
    INSERT INTO notes (title, subject, description, fileUrl, fileName)
    VALUES (?, ?, ?, ?, ?)
  `;
  
  db.run(sql, [title, subject, description || '', fileUrl, fileName], function(err) {
    if (err) {
      console.error('Upload error:', err);
      res.status(500).json({ success: false, error: 'Error uploading note' });
    } else {
      res.status(201).json({
        success: true,
        data: {
          id: this.lastID,
          title,
          subject,
          description,
          fileUrl,
          fileName,
          uploadedAt: new Date().toISOString()
        }
      });
    }
  });
});

// DELETE - Delete Note (Admin only)
app.delete('/api/notes/:id', verifyAdmin, (req, res) => {
  db.get('SELECT fileUrl FROM notes WHERE id = ?', [req.params.id], (err, row) => {
    if (err) {
      return res.status(500).json({ success: false, error: 'Database error' });
    }
    
    if (!row) {
      return res.status(404).json({ success: false, error: 'Note not found' });
    }
    
    // Delete file
    if (row.fileUrl) {
      const filePath = path.join(__dirname, 'public', row.fileUrl);
      fs.unlink(filePath, (err) => {
        if (err) console.error('File deletion error:', err);
      });
    }
    
    // Delete from DB
    db.run('DELETE FROM notes WHERE id = ?', [req.params.id], (err) => {
      if (err) {
        res.status(500).json({ success: false, error: 'Error deleting note' });
      } else {
        res.json({ success: true, message: 'Note deleted' });
      }
    });
  });
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Error handling
app.use((err, req, res, next) => {
  console.error('Server error:', err.stack);
  res.status(500).json({ success: false, error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`\n🚀 NoteBook App is running on http://localhost:${PORT}`);
  console.log(`📝 Admin Panel: http://localhost:${PORT}/admin.html\n`);
});
