const express = require('express');
const router = express.Router();
const Book = require('../models/Book');
const { AppError } = require('../utils/errorHandler');
const { authenticateToken, requireLibrarian } = require('../middleware/auth');
const { bookSearchValidation, bookCreateValidation, bookIdValidation } = require('../middleware/validator');

router.get('/', authenticateToken, bookSearchValidation, async (req, res, next) => {
  try {
    const { keyword, page, limit } = req.query;
    const result = Book.search({
      keyword: keyword || '',
      page: page ? parseInt(page) : 1,
      limit: limit ? parseInt(limit) : 20
    });
    
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.get('/:id', authenticateToken, bookIdValidation, async (req, res, next) => {
  try {
    const book = Book.findById(req.params.id);
    if (!book) {
      return next(new AppError('图书不存在', 404));
    }
    
    const queue = Book.getReservationQueue(req.params.id);
    
    res.json({
      book,
      reservation_queue: queue
    });
  } catch (err) {
    next(err);
  }
});

router.get('/barcode/:barcode', authenticateToken, async (req, res, next) => {
  try {
    const book = Book.findByBarcode(req.params.barcode);
    if (!book) {
      return next(new AppError('图书不存在', 404));
    }
    
    const queue = Book.getReservationQueue(book.id);
    
    res.json({
      book,
      reservation_queue: queue
    });
  } catch (err) {
    next(err);
  }
});

router.post('/', authenticateToken, requireLibrarian, bookCreateValidation, async (req, res, next) => {
  try {
    const book = Book.create(req.body);
    
    res.status(201).json({
      message: '图书添加成功',
      book
    });
  } catch (err) {
    next(err);
  }
});

router.put('/:id', authenticateToken, requireLibrarian, bookIdValidation, bookCreateValidation, async (req, res, next) => {
  try {
    const existing = Book.findById(req.params.id);
    if (!existing) {
      return next(new AppError('图书不存在', 404));
    }
    
    Book.update(req.params.id, req.body);
    const book = Book.findById(req.params.id);
    
    res.json({
      message: '图书更新成功',
      book
    });
  } catch (err) {
    next(err);
  }
});

router.patch('/:id/status', authenticateToken, requireLibrarian, bookIdValidation, async (req, res, next) => {
  try {
    const { status } = req.body;
    if (!status) {
      return next(new AppError('状态不能为空', 400));
    }
    
    const existing = Book.findById(req.params.id);
    if (!existing) {
      return next(new AppError('图书不存在', 404));
    }
    
    Book.updateStatus(req.params.id, status);
    const book = Book.findById(req.params.id);
    
    res.json({
      message: '状态更新成功',
      book
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
