const db = require('../config/database');
const { AppError } = require('../utils/errorHandler');
const { JOIN_FIELDS } = require('../utils/sqlHelper');

class Book {
  static create(bookData) {
    const { isbn, barcode, title, author, publisher, publish_date, category, location, description } = bookData;
    
    const existingBarcode = db.prepare('SELECT id FROM books WHERE barcode = ?').get(barcode);
    if (existingBarcode) {
      throw new AppError('馆藏编号已存在', 400);
    }

    const result = db.prepare(`
      INSERT INTO books (isbn, barcode, title, author, publisher, publish_date, category, location, description)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(isbn, barcode, title, author, publisher, publish_date, category, location, description);

    return this.findById(result.lastInsertRowid);
  }

  static findById(id) {
    return db.prepare('SELECT * FROM books WHERE id = ?').get(id);
  }

  static findByBarcode(barcode) {
    return db.prepare('SELECT * FROM books WHERE barcode = ?').get(barcode);
  }

  static search({ keyword = '', page = 1, limit = 20 }) {
    const offset = (page - 1) * limit;
    const searchPattern = `%${keyword}%`;
    
    const books = db.prepare(`
      SELECT * FROM books 
      WHERE title LIKE ? OR author LIKE ? OR isbn LIKE ?
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `).all(searchPattern, searchPattern, searchPattern, limit, offset);

    const count = db.prepare(`
      SELECT COUNT(*) as total FROM books 
      WHERE title LIKE ? OR author LIKE ? OR isbn LIKE ?
    `).get(searchPattern, searchPattern, searchPattern);

    return {
      books,
      pagination: {
        page,
        limit,
        total: count.total,
        totalPages: Math.ceil(count.total / limit)
      }
    };
  }

  static updateStatus(id, status) {
    const validStatuses = ['available', 'borrowed', 'reserved', 'maintenance'];
    if (!validStatuses.includes(status)) {
      throw new AppError('无效的图书状态', 400);
    }
    
    return db.prepare(`
      UPDATE books 
      SET status = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(status, id);
  }

  static update(id, bookData) {
    const { isbn, barcode, title, author, publisher, publish_date, category, location, description, status } = bookData;
    
    const existing = db.prepare('SELECT id FROM books WHERE barcode = ? AND id != ?').get(barcode, id);
    if (existing) {
      throw new AppError('馆藏编号已被其他图书使用', 400);
    }

    return db.prepare(`
      UPDATE books 
      SET isbn = ?, barcode = ?, title = ?, author = ?, publisher = ?, 
          publish_date = ?, category = ?, location = ?, description = ?,
          status = COALESCE(?, status), updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(isbn, barcode, title, author, publisher, publish_date, category, location, description, status, id);
  }

  static findAll(status = null) {
    if (status) {
      return db.prepare('SELECT * FROM books WHERE status = ? ORDER BY created_at DESC').all(status);
    }
    return db.prepare('SELECT * FROM books ORDER BY created_at DESC').all();
  }

  static getReservationQueue(bookId) {
    return db.prepare(`
      SELECT r.id, r.user_id, ${JOIN_FIELDS.userBasic}, r.queue_position, r.reserved_at, r.status
      FROM reservations r
      JOIN users u ON r.user_id = u.id
      WHERE r.book_id = ? AND r.status = 'waiting'
      ORDER BY r.queue_position ASC
    `).all(bookId);
  }
}

module.exports = Book;
