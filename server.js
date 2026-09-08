const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcryptjs');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// Initialize Local SQLite Database using safe user data path for packaged builds
const dbPath = path.join(process.env.USER_DATA_PATH || __dirname, 'ticktask.db');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error opening database', err.message);
    } else {
        console.log('Connected to the SQLite database.');
    }
});

db.serialize(() => {
    db.run(`
        CREATE TABLE IF NOT EXISTS users (
            userId INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL,
            email TEXT NOT NULL,
            full_name TEXT NOT NULL,
            password TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS tasks (
            taskId INTEGER PRIMARY KEY AUTOINCREMENT,
            userId INTEGER NOT NULL,
            title TEXT NOT NULL,
            subject TEXT,
            category TEXT,
            priority TEXT,
            deadline DATE,
            description TEXT,
            status TEXT,
            FOREIGN KEY (userId) REFERENCES users(userId) ON DELETE CASCADE
        )
    `);
});

/* ==========================================
   AUTHENTICATION ENDPOINT
   ========================================== */
app.post('/auth.php', (req, res) => {
    const { action, email, password, fullName, username } = req.body;

    if (action === 'register') {
        db.get('SELECT * FROM users WHERE email = ?', [email], (err, existing) => {
            if (err) return res.status(500).json({ error: err.message });
            if (existing) {
                return res.status(400).json({ error: 'Email is already registered.' });
            }

            const hashedPassword = bcrypt.hashSync(password, 10);
            const finalUsername = username || email.split('@')[0];
            const finalFullName = fullName || 'User';

            db.run(
                'INSERT INTO users (username, email, full_name, password) VALUES (?, ?, ?, ?)',
                [finalUsername, email, finalFullName, hashedPassword],
                function (err) {
                    if (err) return res.status(500).json({ error: err.message });
                    return res.json({
                        userId: this.lastID,
                        email: email,
                        fullName: finalFullName
                    });
                }
            );
        });
    } else if (action === 'login') {
        db.get('SELECT * FROM users WHERE email = ? OR username = ?', [email, email], (err, user) => {
            if (err) return res.status(500).json({ error: err.message });
            if (!user || !bcrypt.compareSync(password, user.password)) {
                return res.status(401).json({ error: 'Invalid email or password.' });
            }

            return res.json({
                userId: user.userId,
                email: user.email,
                fullName: user.full_name
            });
        });
    } else {
        res.status(400).json({ error: 'Invalid action specified.' });
    }
});

/* ==========================================
   TASK MANAGEMENT ENDPOINTS
   ========================================== */
app.get('/tasks.php', (req, res) => {
    const userId = req.query.userId;
    let sql = "SELECT * FROM tasks";
    let params = [];

    if (userId) {
        sql += " WHERE userId = ?";
        params.push(userId);
    }

    sql += " ORDER BY deadline ASC";

    db.all(sql, params, (err, tasks) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(tasks);
    });
});

app.post('/tasks.php', (req, res) => {
    const data = req.body;
    console.log("Incoming task payload:", data);

    if (!data.title || !data.userId) {
        return res.status(400).json({ error: "Task title and userId are required." });
    }

    const sql = `INSERT INTO tasks (userId, title, subject, category, priority, deadline, description, status) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
    
    const params = [
        data.userId,
        data.title,
        data.subject || '',
        data.category || '',
        data.priority || 'Medium',
        data.deadline || new Date().toISOString().split('T')[0],
        data.description || '',
        data.status || 'Pending'
    ];

    db.run(sql, params, function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true, taskId: this.lastID });
    });
});

app.put('/tasks.php', (req, res) => {
    const data = req.body;
    if (!data.taskId) {
        return res.status(400).json({ error: "Missing taskId" });
    }

    const fields = [];
    const params = [];

    for (const field of ['title', 'subject', 'category', 'priority', 'deadline', 'description', 'status']) {
        if (data[field] !== undefined) {
            fields.push(`${field} = ?`);
            params.push(data[field]);
        }
    }

    if (fields.length === 0) {
        return res.json({ success: true });
    }

    params.push(data.taskId);
    const sql = `UPDATE tasks SET ${fields.join(', ')} WHERE taskId = ?`;

    db.run(sql, params, (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

app.delete('/tasks.php', (req, res) => {
    const taskId = req.query.taskId;
    if (!taskId) {
        return res.status(400).json({ error: "Missing taskId" });
    }

    db.run("DELETE FROM tasks WHERE taskId = ?", [taskId], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

// Start Server
app.listen(PORT, () => {
    console.log(`TickTask backend server active at http://localhost:${PORT}`);
});