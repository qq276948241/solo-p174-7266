# 社区图书馆借阅系统 — 后端架构文档

面向新接手项目的开发者，说明整体脉络。

---

## 一、技术选型

| 层次 | 技术 | 说明 |
|------|------|------|
| 运行时 | Node.js | 基于 Express 4.x |
| 数据库 | SQLite（better-sqlite3） | 单文件数据库，无需额外服务，WAL 模式并发读 |
| 鉴权 | JWT（jsonwebtoken） | 无状态 Token，Bearer 方式传 Header |
| 密码哈希 | bcryptjs | 默认 10 轮盐 |
| 参数校验 | express-validator | 路由层做入参校验 |
| 跨域 | cors | 默认放行全部源，生产环境需收紧 |

---

## 二、目录结构

```
project174/
├── src/
│   ├── server.js              # Express 入口，挂载路由 + 全局错误处理
│   ├── config/
│   │   ├── database.js        # better-sqlite3 连接，启用 WAL/外键
│   │   └── init.js            # 建表脚本 + 首次启动创建默认管理员
│   ├── middleware/
│   │   ├── auth.js            # JWT 解析 + 角色权限控制
│   │   └── validator.js       # 各路由使用的 express-validator 校验链
│   ├── models/                # 数据模型层，封装所有 SQL
│   │   ├── User.js
│   │   ├── Book.js
│   │   ├── Borrow.js          # 借书/还书/续借 核心业务逻辑
│   │   ├── Reservation.js     # 预约队列 + 通知下一位
│   │   ├── Fine.js            # 逾期罚金 & 缴费
│   │   └── Review.js          # 图书评论（软删除）
│   ├── routes/                # 路由层，只做参数→模型调用→响应格式
│   │   ├── auth.js            # 注册 / 登录 / me
│   │   ├── books.js           # 图书 CRUD + 搜索 + 评论
│   │   ├── borrows.js         # 借书 / 还书 / 续借 / 我的借阅
│   │   ├── reservations.js    # 预约 / 取消 / 确认取书
│   │   ├── fines.js           # 我的罚金 / 单笔缴纳 / 一键缴清
│   │   └── admin.js           # 馆员后台：概览 / 逾期 / 全部记录
│   └── utils/
│       ├── dateUtils.js       # 加天数、计算间隔、判断逾期
│       ├── errorHandler.js    # 统一错误类 AppError + 全局错误中间件
│       └── sqlHelper.js       # 通用 JOIN 字段常量 + 评论统计计算
├── data/                      # SQLite 数据库文件（运行时生成）
│   ├── library.db
│   ├── library.db-shm
│   └── library.db-wal
├── test/
│   └── api.test.js            # 端到端 API 测试，覆盖核心流程和边界
├── .env                       # 环境变量
├── package.json
└── ARCHITECTURE.md            # 本文档
```

---

## 三、分层与调用关系

```
请求到达
   ↓
[server.js] 挂载全局中间件（CORS / JSON 解析 / 日志）
   ↓
[routes/*]    参数解析 → express-validator 校验 → 调用模型方法
   ↓
[models/*]    执行 SQL + 事务封装 + 业务规则（借阅上限、预约队列等）
   ↓
[config/database.js]  better-sqlite3 同步 API
   ↓
[middleware/errorHandler.js]  统一错误格式响应
```

**路由层只做三件事**：解析请求、调用模型、拼装 JSON 响应。所有业务规则（借阅上限、逾期天数、罚金计算、预约队列推进、软删除过滤）都在 `models/` 里，不在路由层写 SQL。

---

## 四、路由模块拆分

每个路由文件对应一个业务域，前缀在 `server.js` 里集中挂载：

| 挂载路径 | 文件 | 主要角色 | 核心接口 |
|----------|------|----------|----------|
| `/api/auth` | auth.js | 公开 | `POST /register`、`POST /login`、`GET /me` |
| `/api/books` | books.js | 登录用户读，馆员写 | `GET /`（搜索）、`GET /:id`、`POST /`、`GET /:id/reviews`、`POST /:id/reviews`、`DELETE /:id/reviews/:rid` |
| `/api/borrows` | borrows.js | 读者 | `POST /borrow`、`POST /return/:id`、`POST /renew/:id`、`GET /my`、扫码版 `/borrow/barcode` `/return/barcode` |
| `/api/reservations` | reservations.js | 读者 | `POST /`、`DELETE /:id`、`POST /:id/claim`、`GET /my` |
| `/api/fines` | fines.js | 读者 | `GET /my`、`POST /:id/pay`、`POST /pay-all` |
| `/api/admin` | admin.js | 馆员 | `GET /overview`、`GET /overdue`、`GET /borrows`、`GET /reservations`、`GET /fines`、`GET /users`、`GET /users/:id` |

> 路由注意事项：参数化路径（如 `/:id`）必须放在同前缀固定路径（如 `/barcode`）**之后**，否则 Express 会把 `barcode` 当成 `:id` 参数匹配。

---

## 五、数据库表关系

```
users (1) ────< borrows     >──── (1) books
users (1) ────< reservations >──── (1) books
users (1) ────< fines        >──── (1) borrows
users (1) ────< reviews      >──── (1) books
```

| 表 | 关键字段 | 说明 |
|----|----------|------|
| `users` | `id, username, password, name, role(reader/librarian), borrow_count, current_borrow_count, max_borrow_limit, fine_amount` | 读者和馆员共用一张表，用 `role` 区分 |
| `books` | `id, isbn, barcode(唯一), title, author, status(available/borrowed/reserved/maintenance)` | `barcode` 是馆藏编号，扫码借书/还书的主键 |
| `borrows` | `id, user_id, book_id, borrow_date, due_date, return_date, renewed_count, status(borrowed/returned), fine_amount` | 每一条借阅流水 |
| `reservations` | `id, user_id, book_id, queue_position, reserved_at, notified_at, expires_at, status(waiting/notified/cancelled/completed/claimed)` | 预约队列，按 `queue_position` 排队 |
| `fines` | `id, user_id, borrow_id, amount, reason, paid, paid_at` | 每笔罚金记录，`paid=0` 表示未缴 |
| `reviews` | `id, user_id, book_id, rating(1-5), content, created_at, deleted_at` | **软删除**：`deleted_at IS NULL` 为有效评论；`UNIQUE(user_id, book_id, deleted_at)` 允许软删后重评 |

**关键业务约束在模型层检查**，不是靠数据库触发器：

- 读者最多同时借 5 本（`users.max_borrow_limit`）
- 有未缴罚金的读者不能借书 / 预约
- 续借最多 2 次，且该书没有其他排队中的预约
- 评论必须是归还过该书的读者才能发

---

## 六、JWT 鉴权流程

1. **登录**：`POST /api/auth/login` → `User.findByUsername` 查用户 → `bcrypt.compareSync` 比密码 → `generateToken()` 签发 JWT
2. **Token 内容**：`{ userId, username, role }`
3. **Token 传递**：请求头 `Authorization: Bearer <token>`
4. **鉴权中间件**（[middleware/auth.js](file:///d:/code/ai-prompt/solo-chrome-dev-F12/repos/repo174/project174/src/middleware/auth.js)）：
   - `authenticateToken`：解析 Token → 查库确认用户存在 → 挂到 `req.user`
   - `requireRole(...roles)`：检查 `req.user.role` 是否在允许列表里
   - 便捷封装：`requireReader`（读者+馆员）、`requireLibrarian`（仅馆员）
5. **路由示例**：
   ```js
   router.get('/my', authenticateToken, requireReader, handler)
   router.post('/', authenticateToken, requireLibrarian, handler)
   ```

---

## 七、错误处理统一封装

所有路由通过 `next(err)` 把错误抛到全局。

- **[utils/errorHandler.js](file:///d:/code/ai-prompt/solo-chrome-dev-F12/repos/repo174/project174/src/utils/errorHandler.js)**：
  - `AppError(message, statusCode)`：业务错误用这个类抛出，标记 `isOperational=true`
  - `errorHandler`：全局中间件，统一转换成标准响应：
    ```json
    { "error": { "message": "...", "statusCode": 400 } }
    ```
- **特殊错误自动识别状态码**：
  - `JsonWebTokenError / TokenExpiredError` → 401
  - `SQLITE_CONSTRAINT` → 400
  - 未匹配路径（`app.all('*')`）→ 404
  - 其他未捕获 → 500

路由里的常见用法：
```js
if (!book) return next(new AppError('图书不存在', 404));
if (wrongRole) return next(new AppError('无权操作', 403));
```

---

## 八、本地开发

### 8.1 启动

```bash
npm install        # 首次拉代码后
npm start          # 启动服务（node src/server.js）
# 或
npm run dev        # nodemon 热重载
```

服务默认运行在 `http://localhost:3000`。首次启动会自动：
1. 在 `data/library.db` 建表
2. 插入默认馆员账号

### 8.2 默认管理员

| 用户名 | 密码 | 角色 |
|--------|------|------|
| `admin` | `admin123` | librarian |

### 8.3 测试

```bash
npm test           # 跑 test/api.test.js 端到端 API 测试（40+ 用例）
```

> 测试脚本走真实 HTTP 请求，跑之前确保服务已启动且端口与 `test/api.test.js` 里的 `BASE_URL` 一致。

### 8.4 环境变量（`.env`）

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `PORT` | `3000` | 监听端口 |
| `JWT_SECRET` | `library-secret-key-2024` | JWT 签名密钥，生产环境必须换 |
| `JWT_EXPIRES_IN` | `7d` | Token 有效期 |
| `DB_PATH` | `./data/library.db` | SQLite 文件路径 |
| `BCRYPT_SALT_ROUNDS` | `10` | 密码哈希轮数 |
| `MAX_BORROW_LIMIT` | `5` | 读者最大同时借阅数 |
| `BORROW_DAYS` | `30` | 单次借阅天数，续借也是加这么多天 |
| `OVERDUE_FINE_PER_DAY` | `0.5` | 逾期每天罚金（元） |

---

## 九、常见二次开发入口

- **加一个预约到期自动清理的定时任务** → 入口可以加在 `server.js`，模型已经有 `Reservation.cleanupExpired()`
- **新增图书分类表 / 标签系统** → 新建 `models/Category.js` + `routes/categories.js`，参照 `Book.js` 模式
- **加评论点赞** → 新建 `review_likes(user_id, review_id, created_at)`，`review_id` 外键安全，因为评论是软删不是硬删
- **收紧跨域策略** → `src/server.js` 里的 `cors()` 传 `{ origin: 'https://your-domain.com' }`
