const db = require('../config/database');
const { AppError } = require('../utils/errorHandler');

class Review {
  static create(userId, bookId, reviewData) {
    const { rating, content } = reviewData;

    if (rating < 1 || rating > 5) {
      throw new AppError('评分必须在1到5星之间', 400);
    }

    const returnedBorrow = db.prepare(`
      SELECT id FROM borrows 
      WHERE user_id = ? AND book_id = ? AND status = 'returned'
      LIMIT 1
    `).get(userId, bookId);

    if (!returnedBorrow) {
      throw new AppError('只有归还过该书的读者才能发表评论', 400);
    }

    const existing = db.prepare(`
      SELECT id FROM reviews 
      WHERE user_id = ? AND book_id = ?
    `).get(userId, bookId);

    if (existing) {
      throw new AppError('您已经对该书发表过评论了', 400);
    }

    const result = db.prepare(`
      INSERT INTO reviews (user_id, book_id, rating, content)
      VALUES (?, ?, ?, ?)
    `).run(userId, bookId, rating, content || null);

    return this.findById(result.lastInsertRowid);
  }

  static findById(id) {
    return db.prepare(`
      SELECT r.*,
             u.name as user_name, u.username
      FROM reviews r
      JOIN users u ON r.user_id = u.id
      WHERE r.id = ?
    `).get(id);
  }

  static findByBookId(bookId) {
    const reviews = db.prepare(`
      SELECT r.*,
             u.name as user_name, u.username
      FROM reviews r
      JOIN users u ON r.user_id = u.id
      WHERE r.book_id = ?
      ORDER BY r.created_at DESC
    `).all(bookId);

    const stats = db.prepare(`
      SELECT 
        COUNT(*) as total_count,
        COALESCE(AVG(rating), 0) as average_rating,
        SUM(CASE WHEN rating = 5 THEN 1 ELSE 0 END) as rating_5,
        SUM(CASE WHEN rating = 4 THEN 1 ELSE 0 END) as rating_4,
        SUM(CASE WHEN rating = 3 THEN 1 ELSE 0 END) as rating_3,
        SUM(CASE WHEN rating = 2 THEN 1 ELSE 0 END) as rating_2,
        SUM(CASE WHEN rating = 1 THEN 1 ELSE 0 END) as rating_1
      FROM reviews 
      WHERE book_id = ?
    `).get(bookId);

    return {
      reviews,
      stats: {
        total_count: stats.total_count,
        average_rating: Math.round(stats.average_rating * 100) / 100,
        distribution: {
          5: stats.rating_5 || 0,
          4: stats.rating_4 || 0,
          3: stats.rating_3 || 0,
          2: stats.rating_2 || 0,
          1: stats.rating_1 || 0
        }
      }
    };
  }

  static findByUserId(userId) {
    return db.prepare(`
      SELECT r.*,
             bk.title as book_title, bk.isbn, bk.barcode, bk.author
      FROM reviews r
      JOIN books bk ON r.book_id = bk.id
      WHERE r.user_id = ?
      ORDER BY r.created_at DESC
    `).all(userId);
  }

  static delete(userId, userRole, reviewId) {
    const review = this.findById(reviewId);
    if (!review) {
      throw new AppError('评论不存在', 404);
    }

    if (review.user_id !== userId && userRole !== 'librarian') {
      throw new AppError('无权删除他人的评论', 403);
    }

    db.prepare('DELETE FROM reviews WHERE id = ?').run(reviewId);

    return {
      deleted: true,
      review
    };
  }

  static getAverageRating(bookId) {
    const result = db.prepare(`
      SELECT COALESCE(AVG(rating), 0) as average, COUNT(*) as count
      FROM reviews 
      WHERE book_id = ?
    `).get(bookId);

    return {
      average_rating: Math.round(result.average * 100) / 100,
      review_count: result.count
    };
  }
}

module.exports = Review;
