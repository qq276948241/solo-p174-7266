const { body, param, query, validationResult } = require('express-validator');
const { AppError } = require('../utils/errorHandler');

function validate(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const firstError = errors.array()[0];
    return next(new AppError(firstError.msg, 400));
  }
  next();
}

const loginValidation = [
  body('username').notEmpty().withMessage('用户名不能为空'),
  body('password').notEmpty().withMessage('密码不能为空'),
  validate
];

const registerValidation = [
  body('username').isLength({ min: 3, max: 20 }).withMessage('用户名长度必须在3-20个字符之间'),
  body('password').isLength({ min: 6 }).withMessage('密码长度至少6个字符'),
  body('name').notEmpty().withMessage('姓名不能为空'),
  body('email').optional().isEmail().withMessage('邮箱格式不正确'),
  body('phone').optional().isMobilePhone('zh-CN').withMessage('手机号格式不正确'),
  validate
];

const bookSearchValidation = [
  query('keyword').optional().isString().withMessage('搜索关键词必须是字符串'),
  query('page').optional().isInt({ min: 1 }).withMessage('页码必须是正整数'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('每页数量必须在1-100之间'),
  validate
];

const bookCreateValidation = [
  body('isbn').notEmpty().withMessage('ISBN不能为空'),
  body('barcode').notEmpty().withMessage('馆藏编号不能为空'),
  body('title').notEmpty().withMessage('书名不能为空'),
  body('author').notEmpty().withMessage('作者不能为空'),
  validate
];

const borrowValidation = [
  body('book_id').isInt({ min: 1 }).withMessage('图书ID必须是正整数'),
  validate
];

const barcodeValidation = [
  body('barcode').notEmpty().withMessage('馆藏编号不能为空'),
  validate
];

const borrowIdValidation = [
  param('id').isInt({ min: 1 }).withMessage('借阅ID必须是正整数'),
  validate
];

const bookIdValidation = [
  param('id').isInt({ min: 1 }).withMessage('图书ID必须是正整数'),
  validate
];

const userIdValidation = [
  param('id').isInt({ min: 1 }).withMessage('用户ID必须是正整数'),
  validate
];

const finePayValidation = [
  body('amount').isFloat({ min: 0.01 }).withMessage('支付金额必须大于0'),
  validate
];

const reservationIdValidation = [
  param('id').isInt({ min: 1 }).withMessage('预约ID必须是正整数'),
  validate
];

const reviewCreateValidation = [
  body('rating').isInt({ min: 1, max: 5 }).withMessage('评分必须是1-5之间的整数'),
  body('content').optional().isString().isLength({ max: 1000 }).withMessage('评论内容不能超过1000字符'),
  validate
];

const reviewIdValidation = [
  param('id').isInt({ min: 1 }).withMessage('评论ID必须是正整数'),
  validate
];

module.exports = {
  loginValidation,
  registerValidation,
  bookSearchValidation,
  bookCreateValidation,
  borrowValidation,
  barcodeValidation,
  borrowIdValidation,
  bookIdValidation,
  userIdValidation,
  finePayValidation,
  reservationIdValidation,
  reviewCreateValidation,
  reviewIdValidation
};
