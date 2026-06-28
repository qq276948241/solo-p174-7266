const db = require('../config/database');
const { AppError } = require('../utils/errorHandler');
const { now } = require('../utils/dateUtils');
const User = require('./User');

class Fine {
  static create(fineData) {
    const { user_id, borrow_id, amount, reason } = fineData;

    const result = db.prepare(`
      INSERT INTO fines (user_id, borrow_id, amount, reason)
      VALUES (?, ?, ?, ?)
    `).run(user_id, borrow_id, amount, reason);

    User.addFine(user_id, amount);

    return this.findById(result.lastInsertRowid);
  }

  static pay(userId, fineId, amount) {
    const fine = this.findById(fineId);
    if (!fine) throw new AppError('罚款记录不存在', 404);

    if (fine.user_id !== userId) {
      const user = User.findById(userId);
      if (user.role !== 'librarian') {
        throw new AppError('无权缴纳他人的罚款', 403);
      }
    }

    if (fine.paid) {
      throw new AppError('该罚款已缴纳', 400);
    }

    if (amount !== fine.amount) {
      throw new AppError(`缴纳金额不正确，应缴${fine.amount}元`, 400);
    }

    const tx = db.transaction(() => {
      db.prepare(`
        UPDATE fines 
        SET paid = 1, paid_at = ?
        WHERE id = ?
      `).run(now(), fineId);

      User.payFine(fine.user_id, amount);

      return this.findById(fineId);
    });

    return tx();
  }

  static payAll(userId) {
    const user = User.findById(userId);
    if (!user) throw new AppError('用户不存在', 404);

    if (user.fine_amount <= 0) {
      throw new AppError('没有待缴纳的罚金', 400);
    }

    const unpaidFines = this.findUnpaidByUserId(userId);
    const totalAmount = unpaidFines.reduce((sum, f) => sum + f.amount, 0);

    if (Math.abs(totalAmount - user.fine_amount) > 0.01) {
      throw new AppError('罚金金额不匹配，请联系管理员', 500);
    }

    const tx = db.transaction(() => {
      unpaidFines.forEach(fine => {
        db.prepare(`
          UPDATE fines 
          SET paid = 1, paid_at = ?
          WHERE id = ?
        `).run(now(), fine.id);
      });

      User.payFine(userId, totalAmount);

      return {
        paid_count: unpaidFines.length,
        total_amount: totalAmount,
        fines: unpaidFines.map(f => f.id)
      };
    });

    return tx();
  }

  static findById(id) {
    return db.prepare(`
      SELECT f.*,
             u.name as user_name, u.username,
             b.borrow_date, b.due_date, b.return_date,
             bk.title as book_title, bk.barcode
      FROM fines f
      JOIN users u ON f.user_id = u.id
      LEFT JOIN borrows b ON f.borrow_id = b.id
      LEFT JOIN books bk ON b.book_id = bk.id
      WHERE f.id = ?
    `).get(id);
  }

  static findByUserId(userId) {
    return db.prepare(`
      SELECT f.*,
             b.borrow_date, b.due_date, b.return_date,
             bk.title as book_title, bk.barcode
      FROM fines f
      LEFT JOIN borrows b ON f.borrow_id = b.id
      LEFT JOIN books bk ON b.book_id = bk.id
      WHERE f.user_id = ?
      ORDER BY f.created_at DESC
    `).all(userId);
  }

  static findUnpaidByUserId(userId) {
    return db.prepare(`
      SELECT f.*,
             b.borrow_date, b.due_date, b.return_date,
             bk.title as book_title, bk.barcode
      FROM fines f
      LEFT JOIN borrows b ON f.borrow_id = b.id
      LEFT JOIN books bk ON b.book_id = bk.id
      WHERE f.user_id = ? AND f.paid = 0
      ORDER BY f.created_at DESC
    `).all(userId);
  }

  static findAll(filters = {}) {
    let sql = `
      SELECT f.*,
             u.name as user_name, u.username, u.phone, u.email,
             b.borrow_date, b.due_date, b.return_date,
             bk.title as book_title, bk.barcode
      FROM fines f
      JOIN users u ON f.user_id = u.id
      LEFT JOIN borrows b ON f.borrow_id = b.id
      LEFT JOIN books bk ON b.book_id = bk.id
    `;
    const conditions = [];
    const params = [];

    if (filters.paid !== undefined) {
      conditions.push('f.paid = ?');
      params.push(filters.paid ? 1 : 0);
    }
    if (filters.user_id) {
      conditions.push('f.user_id = ?');
      params.push(filters.user_id);
    }

    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }
    sql += ' ORDER BY f.created_at DESC';

    return db.prepare(sql).all(...params);
  }

  static getTotalUnpaidAmount(userId) {
    const result = db.prepare(`
      SELECT COALESCE(SUM(amount), 0) as total
      FROM fines 
      WHERE user_id = ? AND paid = 0
    `).get(userId);
    return result.total;
  }
}

module.exports = Fine;
