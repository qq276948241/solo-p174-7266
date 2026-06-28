const db = require('../config/database');
const { AppError } = require('../utils/errorHandler');
const { JOIN_FIELDS, buildReviewStats } = require('../utils/sqlHelper');

const REVIEW_WITH_USER = `r.*, ${JOIN_FIELDS.userBasic}`;
const REVIEW_WITH_BOOK = `r.*, ${JOIN_FIELDS.bookBasic}`;

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
      SELECT ${REVIEW_WITH_USER}
      FROM reviews r
      JOIN users u ON r.user_id = u.id
      WHERE r.id = ?
    `).get(id);
  }

  static findByBookId(bookId) {
    const reviews = db.prepare(`
      SELECT ${REVIEW_WITH_USER}
      FROM reviews r
      JOIN users u ON r.user_id = u.id
      WHERE r.book_id = ?
      ORDER BY r.created_at DESC
    `).all(bookId);

    return {
      reviews,
      stats: buildReviewStats(reviews)
    };
  }

  static findByUserId(userId) {
    return db.prepare(`
      SELECT ${REVIEW_WITH_BOOK}
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
    const reviews = db.prepare(`
      SELECT rating FROM reviews WHERE book_id = ?
    `).all(bookId);

    const stats = buildReviewStats(reviews);
    return {
      average_rating: stats.average_rating,
      review_count: stats.total_count
    };
  }
}

module.exports = Review;
