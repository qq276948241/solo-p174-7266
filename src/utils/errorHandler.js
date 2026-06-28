class AppError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

const errorHandler = (err, req, res, next) => {
  let statusCode = err.statusCode || 500;
  let message = err.message || '服务器内部错误';

  if (err.name === 'JsonWebTokenError') {
    statusCode = 401;
    message = '无效的JWT令牌';
  } else if (err.name === 'TokenExpiredError') {
    statusCode = 401;
    message = 'JWT令牌已过期';
  } else if (err.code === 'SQLITE_CONSTRAINT') {
    statusCode = 400;
    message = '数据约束冲突';
  }

  res.status(statusCode).json({
    error: {
      message,
      statusCode
    }
  });
};

module.exports = { AppError, errorHandler };
