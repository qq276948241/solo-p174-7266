const express = require('express');
const router = express.Router();
const Borrow = require('../models/Borrow');
const User = require('../models/User');
const Fine = require('../models/Fine');
const Reservation = require('../models/Reservation');
const Book = require('../models/Book');
const { daysBetween } = require('../utils/dateUtils');
const { authenticateToken, requireLibrarian } = require('../middleware/auth');
const { userIdValidation, finePayValidation } = require('../middleware/validator');

router.get('/overview', authenticateToken, requireLibrarian, async (req, res, next) => {
  try {
    const totalBooks = Book.findAll().length;
    const availableBooks = Book.findAll('available').length;
    const borrowedBooks = Book.findAll('borrowed').length;
    const totalUsers = User.findAllReaders().length;
    const overdueBorrows = Borrow.findAllOverdue();
    
    let totalOverdueFine = 0;
    overdueBorrows.forEach(b => {
      totalOverdueFine += Borrow.calculateOverdueFine(b);
    });
    
    const totalUnpaidFines = Fine.findAll({ paid: false }).reduce((sum, f) => sum + f.amount, 0);
    
    res.json({
      stats: {
        total_books: totalBooks,
        available_books: availableBooks,
        borrowed_books: borrowedBooks,
        total_users: totalUsers,
        overdue_count: overdueBorrows.length,
        total_overdue_fine: Math.round(totalOverdueFine * 100) / 100,
        total_unpaid_fines: Math.round(totalUnpaidFines * 100) / 100
      }
    });
  } catch (err) {
    next(err);
  }
});

router.get('/overdue', authenticateToken, requireLibrarian, async (req, res, next) => {
  try {
    const borrows = Borrow.findAllOverdue();
    
    const borrowsWithDetails = borrows.map(b => {
      const overdueDays = daysBetween(b.due_date, new Date().toISOString());
      const fine = Borrow.calculateOverdueFine(b);
      return {
        ...b,
        overdue_days: overdueDays,
        calculated_fine: fine
      };
    });
    
    const totalOverdueAmount = borrowsWithDetails.reduce((sum, b) => sum + b.calculated_fine, 0);
    
    res.json({
      overdue_borrows: borrowsWithDetails,
      total_count: borrowsWithDetails.length,
      total_overdue_amount: Math.round(totalOverdueAmount * 100) / 100
    });
  } catch (err) {
    next(err);
  }
});

router.get('/borrows', authenticateToken, requireLibrarian, async (req, res, next) => {
  try {
    const { status, user_id, overdue } = req.query;
    const filters = {};
    
    if (status) filters.status = status;
    if (user_id) filters.user_id = parseInt(user_id);
    if (overdue === 'true') filters.overdue = true;
    
    const borrows = Borrow.findAll(filters);
    
    const borrowsWithDetails = borrows.map(b => {
      const fine = Borrow.calculateOverdueFine(b);
      return {
        ...b,
        calculated_fine: fine
      };
    });
    
    res.json({
      borrows: borrowsWithDetails
    });
  } catch (err) {
    next(err);
  }
});

router.get('/reservations', authenticateToken, requireLibrarian, async (req, res, next) => {
  try {
    const { status, book_id, expired } = req.query;
    const filters = {};
    
    if (status) filters.status = status;
    if (book_id) filters.book_id = parseInt(book_id);
    if (expired === 'true') filters.expired = true;
    
    const reservations = Reservation.findAll(filters);
    
    res.json({
      reservations
    });
  } catch (err) {
    next(err);
  }
});

router.get('/fines', authenticateToken, requireLibrarian, async (req, res, next) => {
  try {
    const { paid, user_id } = req.query;
    const filters = {};
    
    if (paid !== undefined) filters.paid = paid === 'true';
    if (user_id) filters.user_id = parseInt(user_id);
    
    const fines = Fine.findAll(filters);
    
    res.json({
      fines
    });
  } catch (err) {
    next(err);
  }
});

router.get('/users', authenticateToken, requireLibrarian, async (req, res, next) => {
  try {
    const users = User.findAllReaders();
    
    res.json({
      users
    });
  } catch (err) {
    next(err);
  }
});

router.get('/users/:id', authenticateToken, requireLibrarian, userIdValidation, async (req, res, next) => {
  try {
    const userId = parseInt(req.params.id);
    const user = User.getWithFineDetails(userId);
    
    if (!user) {
      return next(new AppError('用户不存在', 404));
    }
    
    const borrows = Borrow.findByUserId(userId);
    const reservations = Reservation.findByUserId(userId);
    const fines = Fine.findByUserId(userId);
    
    res.json({
      user,
      borrows,
      reservations,
      fines
    });
  } catch (err) {
    next(err);
  }
});

router.post('/fines/:id/pay', authenticateToken, requireLibrarian, finePayValidation, async (req, res, next) => {
  try {
    const fineId = parseInt(req.params.id);
    const { amount } = req.body;
    const fine = Fine.pay(req.user.id, fineId, amount);
    
    res.json({
      message: '缴费成功',
      fine
    });
  } catch (err) {
    next(err);
  }
});

router.post('/cleanup-expired-reservations', authenticateToken, requireLibrarian, async (req, res, next) => {
  try {
    const count = Reservation.cleanupExpired();
    
    res.json({
      message: `清理了${count}条过期预约记录`,
      cleaned_count: count
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
