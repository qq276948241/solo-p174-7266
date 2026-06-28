const jwt = require('jsonwebtoken');
const { AppError } = require('../utils/errorHandler');
const User = require('../models/User');

function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.startsWith('Bearer ') 
    ? authHeader.substring(7) 
    : null;

  if (!token) {
    return next(new AppError('未提供认证令牌', 401));
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = User.findById(decoded.userId);
    
    if (!user) {
      return next(new AppError('用户不存在', 401));
    }
    
    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return next(new AppError('未登录', 401));
    }
    
    if (!roles.includes(req.user.role)) {
      return next(new AppError(`需要以下角色之一: ${roles.join(', ')}`, 403));
    }
    
    next();
  };
}

const requireReader = requireRole('reader', 'librarian');
const requireLibrarian = requireRole('librarian');

function generateToken(user) {
  return jwt.sign(
    { userId: user.id, username: user.username, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
}

module.exports = {
  authenticateToken,
  requireRole,
  requireReader,
  requireLibrarian,
  generateToken
};
