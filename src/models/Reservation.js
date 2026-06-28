const db = require('../config/database');
const { AppError } = require('../utils/errorHandler');
const { now, addDays } = require('../utils/dateUtils');
const Book = require('./Book');
const User = require('./User');

class Reservation {
  static create(userId, bookId) {
    const user = User.findById(userId);
    if (!user) throw new AppError('用户不存在', 404);

    if (user.fine_amount > 0) {
      throw new AppError('存在未缴纳的罚金，请先缴纳后再预约', 400);
    }

    const book = Book.findById(bookId);
    if (!book) throw new AppError('图书不存在', 404);

    const existingBorrow = db.prepare(`
      SELECT id FROM borrows 
      WHERE user_id = ? AND book_id = ? AND status = 'borrowed'
    `).get(userId, bookId);

    if (existingBorrow) {
      throw new AppError('您已借阅此书，无需预约', 400);
    }

    const existingReservation = db.prepare(`
      SELECT id FROM reservations 
      WHERE user_id = ? AND book_id = ? AND status IN ('waiting', 'notified')
    `).get(userId, bookId);

    if (existingReservation) {
      throw new AppError('您已预约此书', 400);
    }

    const maxPosition = db.prepare(`
      SELECT COALESCE(MAX(queue_position), 0) as max_pos 
      FROM reservations 
      WHERE book_id = ? AND status = 'waiting'
    `).get(bookId);

    const queuePosition = maxPosition.max_pos + 1;
    const reservedAt = now();

    let result;
    const tx = db.transaction(() => {
      const stmt = db.prepare(`
        INSERT INTO reservations (user_id, book_id, queue_position, reserved_at)
        VALUES (?, ?, ?, ?)
      `);
      result = stmt.run(userId, bookId, queuePosition, reservedAt);

      if (book.status === 'available' && queuePosition === 1) {
        Book.updateStatus(bookId, 'reserved');
        const expiresAt = addDays(new Date(), 3).toISOString();
        db.prepare(`
          UPDATE reservations 
          SET status = 'notified', notified_at = ?, expires_at = ?
          WHERE id = ?
        `).run(reservedAt, expiresAt, result.lastInsertRowid);
      }

      return this.findById(result.lastInsertRowid);
    });

    return tx();
  }

  static cancel(userId, reservationId) {
    const reservation = this.findById(reservationId);
    if (!reservation) throw new AppError('预约记录不存在', 404);

    if (reservation.user_id !== userId) {
      const user = User.findById(userId);
      if (user.role !== 'librarian') {
        throw new AppError('无权取消他人的预约', 403);
      }
    }

    if (!['waiting', 'notified'].includes(reservation.status)) {
      throw new AppError('该预约已完成或已取消', 400);
    }

    const tx = db.transaction(() => {
      db.prepare(`
        UPDATE reservations 
        SET status = 'cancelled'
        WHERE id = ?
      `).run(reservationId);

      if (reservation.status === 'notified') {
        db.prepare(`
          UPDATE reservations 
          SET queue_position = queue_position - 1
          WHERE book_id = ? AND status = 'waiting' AND queue_position > ?
        `).run(reservation.book_id, reservation.queue_position);

        const nextReservation = db.prepare(`
          SELECT * FROM reservations 
          WHERE book_id = ? AND status = 'waiting'
          ORDER BY queue_position ASC LIMIT 1
        `).get(reservation.book_id);

        if (nextReservation) {
          const expiresAt = addDays(new Date(), 3).toISOString();
          db.prepare(`
            UPDATE reservations 
            SET status = 'notified', notified_at = ?, expires_at = ?
            WHERE id = ?
          `).run(now(), expiresAt, nextReservation.id);
        } else {
          const book = Book.findById(reservation.book_id);
          if (book && book.status === 'reserved') {
            Book.updateStatus(reservation.book_id, 'available');
          }
        }
      }

      return this.findById(reservationId);
    });

    return tx();
  }

  static findById(id) {
    return db.prepare(`
      SELECT r.*,
             u.name as user_name, u.username,
             bk.title as book_title, bk.isbn, bk.barcode, bk.author, bk.status as book_status
      FROM reservations r
      JOIN users u ON r.user_id = u.id
      JOIN books bk ON r.book_id = bk.id
      WHERE r.id = ?
    `).get(id);
  }

  static findByUserId(userId) {
    return db.prepare(`
      SELECT r.*,
             bk.title as book_title, bk.isbn, bk.barcode, bk.author
      FROM reservations r
      JOIN books bk ON r.book_id = bk.id
      WHERE r.user_id = ?
      ORDER BY r.created_at DESC
    `).all(userId);
  }

  static findByBookId(bookId) {
    return db.prepare(`
      SELECT r.*,
             u.name as user_name, u.username, u.phone
      FROM reservations r
      JOIN users u ON r.user_id = u.id
      WHERE r.book_id = ?
      ORDER BY r.queue_position ASC
    `).all(bookId);
  }

  static findAll(filters = {}) {
    let sql = `
      SELECT r.*,
             u.name as user_name, u.username, u.phone,
             bk.title as book_title, bk.isbn, bk.barcode, bk.author
      FROM reservations r
      JOIN users u ON r.user_id = u.id
      JOIN books bk ON r.book_id = bk.id
    `;
    const conditions = [];
    const params = [];

    if (filters.status) {
      conditions.push('r.status = ?');
      params.push(filters.status);
    }
    if (filters.book_id) {
      conditions.push('r.book_id = ?');
      params.push(filters.book_id);
    }
    if (filters.expired) {
      conditions.push('r.status = "notified" AND r.expires_at < datetime("now")');
    }

    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }
    sql += ' ORDER BY r.created_at DESC';

    return db.prepare(sql).all(...params);
  }

  static claimReservation(userId, reservationId) {
    const reservation = this.findById(reservationId);
    if (!reservation) throw new AppError('预约记录不存在', 404);

    if (reservation.user_id !== userId) {
      throw new AppError('这不是您的预约', 403);
    }

    if (reservation.status !== 'notified') {
      throw new AppError('预约尚未通知到您，或已过期/取消', 400);
    }

    if (new Date(reservation.expires_at) < new Date()) {
      this.cancel(userId, reservationId);
      throw new AppError('预约已过期，已自动取消', 400);
    }

    db.prepare(`
      UPDATE reservations 
      SET status = 'claimed'
      WHERE id = ?
    `).run(reservationId);

    return this.findById(reservationId);
  }

  static cleanupExpired() {
    const expired = db.prepare(`
      SELECT * FROM reservations 
      WHERE status = 'notified' AND expires_at < datetime('now')
    `).all();

    expired.forEach(r => {
      try {
        this.cancel(r.user_id, r.id);
      } catch (e) {
        console.error('清理过期预约失败:', e.message);
      }
    });

    return expired.length;
  }
}

module.exports = Reservation;
