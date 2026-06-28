const express = require('express');
const router = express.Router();
const Fine = require('../models/Fine');
const { authenticateToken, requireReader } = require('../middleware/auth');
const { finePayValidation } = require('../middleware/validator');

router.get('/my', authenticateToken, requireReader, async (req, res, next) => {
  try {
    const fines = Fine.findByUserId(req.user.id);
    const unpaidFines = Fine.findUnpaidByUserId(req.user.id);
    const totalUnpaid = Fine.getTotalUnpaidAmount(req.user.id);
    
    res.json({
      fines,
      unpaid_fines: unpaidFines,
      total_unpaid: totalUnpaid
    });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/pay', authenticateToken, requireReader, finePayValidation, async (req, res, next) => {
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

router.post('/pay-all', authenticateToken, requireReader, async (req, res, next) => {
  try {
    const result = Fine.payAll(req.user.id);
    
    res.json({
      message: `成功缴纳${result.paid_count}笔罚金，共${result.total_amount}元`,
      ...result
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
