const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcryptjs');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'src')));

// Fallback static handler if files are requested at root instead of src
app.use(express.static(path.join(__dirname)));

// Initialize Local MariaDB Connection Pool
const db = mysql.createPool({
    host: 'localhost',
    user: 'root',
    password: 'harold', // MariaDB password for the root user
    database: 'ticktask_db',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    dateStrings: true
});

// Test Database Connection
db.getConnection((err, connection) => {
    if (err) {
        console.error('Error connecting to MariaDB database:', err.message);
    } else {
        console.log('Connected to the MariaDB ticktask_db database.');
        connection.release();
    }
});

/* ==========================================
   AUTHENTICATION ENDPOINT
   ========================================== */
app.post('/auth.php', (req, res) => {
    const { action, email, password, fullName, username } = req.body;

    if (!action || !email || !password) {
        return res.status(400).json({ error: 'Missing required fields (action, email, or password).' });
    }

    if (action === 'register') {
        db.query('SELECT * FROM users WHERE email = ?', [email], (err, results) => {
            if (err) {
                console.error('Register DB Error:', err.message);
                return res.status(500).json({ error: err.message });
            }
            if (results.length > 0) {
                return res.status(400).json({ error: 'Email is already registered.' });
            }

            const hashedPassword = bcrypt.hashSync(password, 10);
            const finalUsername = username || email.split('@')[0];
            const finalFullName = fullName || 'User';

            db.query(
                'INSERT INTO users (username, email, full_name, password) VALUES (?, ?, ?, ?)',
                [finalUsername, email, finalFullName, hashedPassword],
                function (err, result) {
                    if (err) {
                        console.error('Insert User Error:', err.message);
                        return res.status(500).json({ error: err.message });
                    }
                    return res.json({
                        userId: result.insertId,
                        email: email,
                        fullName: finalFullName
                    });
                }
            );
        });
    } else if (action === 'login') {
        db.query('SELECT * FROM users WHERE email = ? OR username = ?', [email, email], (err, results) => {
            if (err) {
                console.error('Login DB Error:', err.message);
                return res.status(500).json({ error: err.message });
            }
            if (results.length === 0 || !bcrypt.compareSync(password, results[0].password)) {
                return res.status(401).json({ error: 'Invalid email or password.' });
            }

            const user = results[0];
            const resolvedUserId = user.userId || user.id || user.user_id;

            return res.json({
                userId: resolvedUserId,
                email: user.email,
                fullName: user.full_name || user.fullName
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

    db.query(sql, params, (err, tasks) => {
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

    db.query(sql, params, (err, result) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true, taskId: result.insertId });
    });
});

app.put('/tasks.php', (req, res) => {
    const data = req.body;
    const taskId = data.taskId || req.query.taskId;

    if (!taskId) {
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

    params.push(taskId);
    const sql = `UPDATE tasks SET ${fields.join(', ')} WHERE taskId = ?`;

    db.query(sql, params, (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

app.delete('/tasks.php', (req, res) => {
    const taskId = req.query.taskId;
    if (!taskId) {
        return res.status(400).json({ error: "Missing taskId" });
    }

    db.query("DELETE FROM tasks WHERE taskId = ?", [taskId], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

// Start Server
app.listen(PORT, () => {
    console.log(`TickTask backend server active at http://localhost:${PORT}`);
});