const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { AppError } = require('../utils/errorHandler');
const { generateToken, authenticateToken } = require('../middleware/auth');
const { loginValidation, registerValidation } = require('../middleware/validator');

router.post('/register', registerValidation, async (req, res, next) => {
  try {
    const user = User.create(req.body);
    const token = generateToken(user);
    
    res.status(201).json({
      message: '注册成功',
      user,
      token
    });
  } catch (err) {
    next(err);
  }
});

router.post('/login', loginValidation, async (req, res, next) => {
  try {
    const { username, password } = req.body;
    const user = User.findByUsername(username);
    
    if (!user) {
      return next(new AppError('用户名或密码错误', 401));
    }
    
    if (!User.comparePassword(password, user.password)) {
      return next(new AppError('用户名或密码错误', 401));
    }
    
    const token = generateToken(user);
    const userInfo = User.findById(user.id);
    
    res.json({
      message: '登录成功',
      user: userInfo,
      token
    });
  } catch (err) {
    next(err);
  }
});

router.get('/me', authenticateToken, async (req, res, next) => {
  try {
    res.json({
      user: req.user
    });
  } catch (err) {
    next(err);
  }
});

router.post('/logout', authenticateToken, async (req, res, next) => {
  try {
    res.json({
      message: '登出成功'
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
