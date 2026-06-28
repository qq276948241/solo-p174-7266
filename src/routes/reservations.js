const express = require('express');
const router = express.Router();
const Reservation = require('../models/Reservation');
const Book = require('../models/Book');
const { AppError } = require('../utils/errorHandler');
const { authenticateToken, requireReader } = require('../middleware/auth');
const { borrowValidation, reservationIdValidation, bookIdValidation } = require('../middleware/validator');

router.get('/my', authenticateToken, requireReader, async (req, res, next) => {
  try {
    const reservations = Reservation.findByUserId(req.user.id);
    
    res.json({
      reservations
    });
  } catch (err) {
    next(err);
  }
});

router.post('/', authenticateToken, requireReader, borrowValidation, async (req, res, next) => {
  try {
    const { book_id } = req.body;
    const reservation = Reservation.create(req.user.id, book_id);
    
    res.status(201).json({
      message: '预约成功',
      reservation
    });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', authenticateToken, requireReader, reservationIdValidation, async (req, res, next) => {
  try {
    const reservationId = parseInt(req.params.id);
    const reservation = Reservation.cancel(req.user.id, reservationId);
    
    res.json({
      message: '取消预约成功',
      reservation
    });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/claim', authenticateToken, requireReader, reservationIdValidation, async (req, res, next) => {
  try {
    const reservationId = parseInt(req.params.id);
    const reservation = Reservation.claimReservation(req.user.id, reservationId);
    
    res.json({
      message: '已确认取书，请在3天内完成借阅',
      reservation
    });
  } catch (err) {
    next(err);
  }
});

router.get('/book/:bookId', authenticateToken, bookIdValidation, async (req, res, next) => {
  try {
    const bookId = parseInt(req.params.bookId);
    const reservations = Reservation.findByBookId(bookId);
    
    res.json({
      reservations
    });
  } catch (err) {
    next(err);
  }
});

router.get('/:id', authenticateToken, reservationIdValidation, async (req, res, next) => {
  try {
    const reservation = Reservation.findById(req.params.id);
    if (!reservation) {
      return next(new AppError('预约记录不存在', 404));
    }
    
    if (reservation.user_id !== req.user.id && req.user.role !== 'librarian') {
      return next(new AppError('无权查看他人的预约记录', 403));
    }
    
    res.json({
      reservation
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
