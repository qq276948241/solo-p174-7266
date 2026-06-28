const db = require('../config/database');
const { AppError } = require('../utils/errorHandler');
const { addDays, daysBetween, now, isOverdue } = require('../utils/dateUtils');
const User = require('./User');
const Book = require('./Book');
const Fine = require('./Fine');

class Borrow {
  static borrowBook(userId, bookId) {
    const user = User.findById(userId);
    if (!user) throw new AppError('用户不存在', 404);

    if (user.fine_amount > 0) {
      throw new AppError('存在未缴纳的罚金，请先缴纳后再借阅', 400);
    }

    if (user.current_borrow_count >= user.max_borrow_limit) {
      throw new AppError(`已达到借阅上限(${user.max_borrow_limit}本)，请先归还部分图书`, 400);
    }

    const book = Book.findById(bookId);
    if (!book) throw new AppError('图书不存在', 404);

    let isReservationBorrow = false;
    let reservationId = null;

    if (book.status !== 'available') {
      if (book.status === 'borrowed') {
        throw new AppError('图书已被借出，可预约排队', 400);
      } else if (book.status === 'reserved') {
        const reservation = db.prepare(`
          SELECT * FROM reservations 
          WHERE book_id = ? AND user_id = ? AND status = 'notified'
          ORDER BY queue_position ASC LIMIT 1
        `).get(bookId, userId);
        
        if (!reservation) {
          throw new AppError('图书已被其他读者预约', 400);
        }
        
        if (new Date(reservation.expires_at) < new Date()) {
          throw new AppError('您的预约已过期，请重新预约', 400);
        }
        
        isReservationBorrow = true;
        reservationId = reservation.id;
      } else if (book.status === 'maintenance') {
        throw new AppError('图书正在维修中', 400);
      } else {
        throw new AppError('图书当前不可借阅', 400);
      }
    }

    const borrowDays = parseInt(process.env.BORROW_DAYS) || 30;
    const borrowDate = now();
    const dueDate = addDays(new Date(), borrowDays).toISOString();

    const tx = db.transaction(() => {
      const result = db.prepare(`
        INSERT INTO borrows (user_id, book_id, borrow_date, due_date)
        VALUES (?, ?, ?, ?)
      `).run(userId, bookId, borrowDate, dueDate);

      if (isReservationBorrow && reservationId) {
        db.prepare(`
          UPDATE reservations 
          SET status = 'completed'
          WHERE id = ?
        `).run(reservationId);
      }

      Book.updateStatus(bookId, 'borrowed');
      User.updateBorrowStats(userId, 1);

      return this.findById(result.lastInsertRowid);
    });

    return tx();
  }

  static returnBook(userId, bookId) {
    const borrow = db.prepare(`
      SELECT b.* FROM borrows b
      WHERE b.book_id = ? AND b.status = 'borrowed'
      ORDER BY b.borrow_date DESC LIMIT 1
    `).get(bookId);

    if (!borrow) {
      throw new AppError('该图书没有正在进行的借阅记录', 400);
    }

    if (borrow.user_id !== userId) {
      const user = User.findById(userId);
      if (user.role !== 'librarian') {
        throw new AppError('无权归还他人借阅的图书', 403);
      }
    }

    const returnDate = now();
    let fineAmount = 0;
    let fineRecord = null;

    if (isOverdue(borrow.due_date)) {
      const overdueDays = daysBetween(borrow.due_date, returnDate);
      const finePerDay = parseFloat(process.env.OVERDUE_FINE_PER_DAY) || 0.5;
      fineAmount = Math.round(overdueDays * finePerDay * 100) / 100;

      if (fineAmount > 0) {
        fineRecord = Fine.create({
          user_id: borrow.user_id,
          borrow_id: borrow.id,
          amount: fineAmount,
          reason: `逾期${overdueDays}天，每天${finePerDay}元`
        });
      }
    }

    const tx = db.transaction(() => {
      db.prepare(`
        UPDATE borrows 
        SET return_date = ?, status = 'returned', fine_amount = ?
        WHERE id = ?
      `).run(returnDate, fineAmount, borrow.id);

      User.updateBorrowStats(borrow.user_id, -1);

      const reservations = db.prepare(`
        SELECT * FROM reservations 
        WHERE book_id = ? AND status = 'waiting'
        ORDER BY queue_position ASC LIMIT 1
      `).get(bookId);

      if (reservations) {
        Book.updateStatus(bookId, 'reserved');
        const expiresAt = addDays(new Date(), 3).toISOString();
        db.prepare(`
          UPDATE reservations 
          SET status = 'notified', notified_at = ?, expires_at = ?
          WHERE id = ?
        `).run(now(), expiresAt, reservations.id);
      } else {
        Book.updateStatus(bookId, 'available');
      }

      return this.findById(borrow.id);
    });

    const result = tx();
    if (fineRecord) {
      result.fine = fineRecord;
    }
    return result;
  }

  static renewBook(userId, borrowId) {
    const borrow = this.findById(borrowId);
    if (!borrow) throw new AppError('借阅记录不存在', 404);

    if (borrow.user_id !== userId) {
      throw new AppError('无权续借他人的图书', 403);
    }

    if (borrow.status !== 'borrowed') {
      throw new AppError('该借阅已归还或已取消', 400);
    }

    if (borrow.renewed_count >= 2) {
      throw new AppError('续借次数已达上限(最多2次)', 400);
    }

    if (isOverdue(borrow.due_date)) {
      throw new AppError('图书已逾期，不能续借，请先归还', 400);
    }

    const reservations = db.prepare(`
      SELECT COUNT(*) as count FROM reservations 
      WHERE book_id = ? AND status = 'waiting'
    `).get(borrow.book_id);

    if (reservations.count > 0) {
      throw new AppError('该书已有读者预约，无法续借', 400);
    }

    const renewDays = parseInt(process.env.BORROW_DAYS) || 30;
    const newDueDate = addDays(new Date(borrow.due_date), renewDays).toISOString();

    db.prepare(`
      UPDATE borrows 
      SET due_date = ?, renewed_count = renewed_count + 1
      WHERE id = ?
    `).run(newDueDate, borrowId);

    return this.findById(borrowId);
  }

  static findById(id) {
    return db.prepare(`
      SELECT b.*, 
             u.name as user_name, u.username,
             bk.title as book_title, bk.isbn, bk.barcode, bk.author
      FROM borrows b
      JOIN users u ON b.user_id = u.id
      JOIN books bk ON b.book_id = bk.id
      WHERE b.id = ?
    `).get(id);
  }

  static findByUserId(userId) {
    return db.prepare(`
      SELECT b.*,
             bk.title as book_title, bk.isbn, bk.barcode, bk.author
      FROM borrows b
      JOIN books bk ON b.book_id = bk.id
      WHERE b.user_id = ?
      ORDER BY b.created_at DESC
    `).all(userId);
  }

  static findActiveByUserId(userId) {
    return db.prepare(`
      SELECT b.*,
             bk.title as book_title, bk.isbn, bk.barcode, bk.author
      FROM borrows b
      JOIN books bk ON b.book_id = bk.id
      WHERE b.user_id = ? AND b.status = 'borrowed'
      ORDER BY b.borrow_date DESC
    `).all(userId);
  }

  static findAllOverdue() {
    return db.prepare(`
      SELECT b.*,
             u.name as user_name, u.username, u.phone, u.email,
             bk.title as book_title, bk.isbn, bk.barcode, bk.author
      FROM borrows b
      JOIN users u ON b.user_id = u.id
      JOIN books bk ON b.book_id = bk.id
      WHERE b.status = 'borrowed' AND b.due_date < datetime('now')
      ORDER BY b.due_date ASC
    `).all();
  }

  static calculateOverdueFine(borrow) {
    if (borrow.status !== 'borrowed' || !isOverdue(borrow.due_date)) {
      return 0;
    }
    const overdueDays = daysBetween(borrow.due_date, now());
    const finePerDay = parseFloat(process.env.OVERDUE_FINE_PER_DAY) || 0.5;
    return Math.round(overdueDays * finePerDay * 100) / 100;
  }

  static findAll(filters = {}) {
    let sql = `
      SELECT b.*,
             u.name as user_name, u.username,
             bk.title as book_title, bk.isbn, bk.barcode, bk.author
      FROM borrows b
      JOIN users u ON b.user_id = u.id
      JOIN books bk ON b.book_id = bk.id
    `;
    const conditions = [];
    const params = [];

    if (filters.status) {
      conditions.push('b.status = ?');
      params.push(filters.status);
    }
    if (filters.user_id) {
      conditions.push('b.user_id = ?');
      params.push(filters.user_id);
    }
    if (filters.overdue) {
      conditions.push('b.status = "borrowed" AND b.due_date < datetime("now")');
    }

    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }
    sql += ' ORDER BY b.created_at DESC';

    return db.prepare(sql).all(...params);
  }
}

module.exports = Borrow;
