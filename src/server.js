require('dotenv').config();
const express = require('express');
const cors = require('cors');
const initDatabase = require('./config/init');
const { errorHandler, AppError } = require('./utils/errorHandler');

const authRoutes = require('./routes/auth');
const bookRoutes = require('./routes/books');
const borrowRoutes = require('./routes/borrows');
const reservationRoutes = require('./routes/reservations');
const fineRoutes = require('./routes/fines');
const adminRoutes = require('./routes/admin');

const app = express();
const PORT = process.env.PORT || 3000;

initDatabase();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use((req, res, next) => {
  console.log(`${req.method} ${req.path}`);
  next();
});

app.use('/api/auth', authRoutes);
app.use('/api/books', bookRoutes);
app.use('/api/borrows', borrowRoutes);
app.use('/api/reservations', reservationRoutes);
app.use('/api/fines', fineRoutes);
app.use('/api/admin', adminRoutes);

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

app.all('*', (req, res, next) => {
  next(new AppError(`无法找到 ${req.method} ${req.path}`, 404));
});

app.use(errorHandler);

const server = app.listen(PORT, () => {
  console.log(`图书馆借阅系统API服务器运行在 http://localhost:${PORT}`);
  console.log(`默认管理员账号: admin / admin123`);
});

process.on('SIGTERM', () => {
  console.log('收到SIGTERM信号，正在关闭服务器...');
  server.close(() => {
    console.log('服务器已关闭');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('收到SIGINT信号，正在关闭服务器...');
  server.close(() => {
    console.log('服务器已关闭');
    process.exit(0);
  });
});

module.exports = app;
