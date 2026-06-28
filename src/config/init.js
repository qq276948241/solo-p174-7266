const db = require('./database');
const bcrypt = require('bcryptjs');

function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      name TEXT NOT NULL,
      email TEXT,
      phone TEXT,
      role TEXT NOT NULL DEFAULT 'reader',
      borrow_count INTEGER DEFAULT 0,
      current_borrow_count INTEGER DEFAULT 0,
      max_borrow_limit INTEGER DEFAULT 5,
      fine_amount REAL DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS books (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      isbn TEXT NOT NULL,
      barcode TEXT UNIQUE NOT NULL,
      title TEXT NOT NULL,
      author TEXT NOT NULL,
      publisher TEXT,
      publish_date TEXT,
      category TEXT,
      location TEXT,
      status TEXT NOT NULL DEFAULT 'available',
      description TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS borrows (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      book_id INTEGER NOT NULL,
      borrow_date TEXT NOT NULL,
      due_date TEXT NOT NULL,
      return_date TEXT,
      renewed_count INTEGER DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'borrowed',
      fine_amount REAL DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (book_id) REFERENCES books(id)
    );

    CREATE TABLE IF NOT EXISTS reservations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      book_id INTEGER NOT NULL,
      queue_position INTEGER NOT NULL,
      reserved_at TEXT NOT NULL,
      notified_at TEXT,
      expires_at TEXT,
      status TEXT NOT NULL DEFAULT 'waiting',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (book_id) REFERENCES books(id)
    );

    CREATE TABLE IF NOT EXISTS fines (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      borrow_id INTEGER,
      amount REAL NOT NULL,
      reason TEXT NOT NULL,
      paid INTEGER DEFAULT 0,
      paid_at TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (borrow_id) REFERENCES borrows(id)
    );

    CREATE TABLE IF NOT EXISTS reviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      book_id INTEGER NOT NULL,
      rating INTEGER NOT NULL CHECK(rating >= 1 AND rating <= 5),
      content TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (book_id) REFERENCES books(id),
      UNIQUE(user_id, book_id)
    );

    CREATE INDEX IF NOT EXISTS idx_borrows_user ON borrows(user_id);
    CREATE INDEX IF NOT EXISTS idx_borrows_book ON borrows(book_id);
    CREATE INDEX IF NOT EXISTS idx_reservations_book ON reservations(book_id);
    CREATE INDEX IF NOT EXISTS idx_fines_user ON fines(user_id);
    CREATE INDEX IF NOT EXISTS idx_reviews_book ON reviews(book_id);
    CREATE INDEX IF NOT EXISTS idx_reviews_user ON reviews(user_id);
  `);

  const adminCount = db.prepare('SELECT COUNT(*) as count FROM users WHERE role = ?').get('librarian').count;
  if (adminCount === 0) {
    const hashedPassword = bcrypt.hashSync('admin123', 10);
    db.prepare(`
      INSERT INTO users (username, password, name, role, max_borrow_limit)
      VALUES (?, ?, ?, ?, 999)
    `).run('admin', hashedPassword, '系统管理员', 'librarian');
  }
}

module.exports = initDatabase;
