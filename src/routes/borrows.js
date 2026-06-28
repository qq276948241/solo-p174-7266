const express = require('express');
const router = express.Router();
const Borrow = require('../models/Borrow');
const Book = require('../models/Book');
const { AppError } = require('../utils/errorHandler');
const { authenticateToken, requireReader } = require('../middleware/auth');
const { borrowValidation, barcodeValidation, borrowIdValidation, bookIdValidation } = require('../middleware/validator');

router.get('/my', authenticateToken, requireReader, async (req, res, next) => {
  try {
    const borrows = Borrow.findByUserId(req.user.id);
    
    const borrowsWithOverdue = borrows.map(b => {
      const overdueFine = Borrow.calculateOverdueFine(b);
      return {
        ...b,
        current_overdue_fine: overdueFine
      };
    });
    
    res.json({
      borrows: borrowsWithOverdue
    });
  } catch (err) {
    next(err);
  }
});

router.get('/my/active', authenticateToken, requireReader, async (req, res, next) => {
  try {
    const borrows = Borrow.findActiveByUserId(req.user.id);
    
    const borrowsWithOverdue = borrows.map(b => {
      const overdueFine = Borrow.calculateOverdueFine(b);
      return {
        ...b,
        current_overdue_fine: overdueFine
      };
    });
    
    res.json({
      borrows: borrowsWithOverdue
    });
  } catch (err) {
    next(err);
  }
});

router.post('/borrow', authenticateToken, requireReader, borrowValidation, async (req, res, next) => {
  try {
    const { book_id } = req.body;
    const borrow = Borrow.borrowBook(req.user.id, book_id);
    
    res.status(201).json({
      message: '借阅成功',
      borrow
    });
  } catch (err) {
    next(err);
  }
});

router.post('/borrow/barcode', authenticateToken, requireReader, barcodeValidation, async (req, res, next) => {
  try {
    const { barcode } = req.body;
    const book = Book.findByBarcode(barcode);
    
    if (!book) {
      return next(new AppError('图书不存在', 404));
    }
    
    const borrow = Borrow.borrowBook(req.user.id, book.id);
    
    res.status(201).json({
      message: '借阅成功',
      borrow
    });
  } catch (err) {
    next(err);
  }
});

router.post('/return/barcode', authenticateToken, requireReader, barcodeValidation, async (req, res, next) => {
  try {
    const { barcode } = req.body;
    const book = Book.findByBarcode(barcode);
    
    if (!book) {
      return next(new AppError('图书不存在', 404));
    }
    
    const result = Borrow.returnBook(req.user.id, book.id);
    
    res.json({
      message: '归还成功',
      borrow: result
    });
  } catch (err) {
    next(err);
  }
});

router.post('/return/:id', authenticateToken, requireReader, bookIdValidation, async (req, res, next) => {
  try {
    const bookId = parseInt(req.params.id);
    const result = Borrow.returnBook(req.user.id, bookId);
    
    res.json({
      message: '归还成功',
      borrow: result
    });
  } catch (err) {
    next(err);
  }
});

router.post('/renew/:id', authenticateToken, requireReader, borrowIdValidation, async (req, res, next) => {
  try {
    const borrowId = parseInt(req.params.id);
    const borrow = Borrow.renewBook(req.user.id, borrowId);
    
    res.json({
      message: '续借成功',
      borrow
    });
  } catch (err) {
    next(err);
  }
});

router.get('/:id', authenticateToken, requireReader, borrowIdValidation, async (req, res, next) => {
  try {
    const borrow = Borrow.findById(req.params.id);
    if (!borrow) {
      return next(new AppError('借阅记录不存在', 404));
    }
    
    if (borrow.user_id !== req.user.id && req.user.role !== 'librarian') {
      return next(new AppError('无权查看他人的借阅记录', 403));
    }
    
    const overdueFine = Borrow.calculateOverdueFine(borrow);
    
    res.json({
      borrow: {
        ...borrow,
        current_overdue_fine: overdueFine
      }
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
