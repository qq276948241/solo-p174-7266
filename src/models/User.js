const db = require('../config/database');
const bcrypt = require('bcryptjs');
const { AppError } = require('../utils/errorHandler');

class User {
  static create(userData) {
    const { username, password, name, email, phone, role = 'reader' } = userData;
    
    const existingUser = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
    if (existingUser) {
      throw new AppError('用户名已存在', 400);
    }

    const hashedPassword = bcrypt.hashSync(password, parseInt(process.env.BCRYPT_SALT_ROUNDS) || 10);
    
    const result = db.prepare(`
      INSERT INTO users (username, password, name, email, phone, role)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(username, hashedPassword, name, email, phone, role);

    return this.findById(result.lastInsertRowid);
  }

  static findByUsername(username) {
    return db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  }

  static findById(id) {
    return db.prepare('SELECT id, username, name, email, phone, role, borrow_count, current_borrow_count, max_borrow_limit, fine_amount, created_at FROM users WHERE id = ?').get(id);
  }

  static findAllReaders() {
    return db.prepare('SELECT id, username, name, email, phone, borrow_count, current_borrow_count, max_borrow_limit, fine_amount, created_at FROM users WHERE role = ?').all('reader');
  }

  static comparePassword(password, hashedPassword) {
    return bcrypt.compareSync(password, hashedPassword);
  }

  static updateBorrowStats(userId, delta) {
    return db.prepare(`
      UPDATE users 
      SET current_borrow_count = current_borrow_count + ?,
          borrow_count = borrow_count + CASE WHEN ? > 0 THEN ? ELSE 0 END,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(delta, delta, delta, userId);
  }

  static addFine(userId, amount) {
    return db.prepare(`
      UPDATE users 
      SET fine_amount = fine_amount + ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(amount, userId);
  }

  static payFine(userId, amount) {
    const user = this.findById(userId);
    if (!user) throw new AppError('用户不存在', 404);
    if (user.fine_amount < amount) {
      throw new AppError('支付金额超过欠费金额', 400);
    }
    
    return db.prepare(`
      UPDATE users 
      SET fine_amount = fine_amount - ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(amount, userId);
  }

  static getWithFineDetails(userId) {
    return db.prepare(`
      SELECT u.*,
             (SELECT COUNT(*) FROM fines f WHERE f.user_id = u.id AND f.paid = 0) as unpaid_fine_count
      FROM users u
      WHERE u.id = ?
    `).get(userId);
  }
}

module.exports = User;
