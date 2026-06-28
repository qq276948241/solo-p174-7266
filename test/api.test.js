const http = require('http');

const BASE_URL = 'http://localhost:3000/api';

function request(path, method = 'GET', data = null, token = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(BASE_URL + path);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: method,
      headers: {
        'Content-Type': 'application/json'
      }
    };
    
    if (token) {
      options.headers['Authorization'] = `Bearer ${token}`;
    }
    
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        try {
          const parsed = body ? JSON.parse(body) : {};
          resolve({ status: res.statusCode, data: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, data: body });
        }
      });
    });
    
    req.on('error', reject);
    
    if (data) {
      req.write(JSON.stringify(data));
    }
    
    req.end();
  });
}

async function test(name, fn) {
  try {
    console.log(`\n=== 测试: ${name} ===`);
    const result = await fn();
    console.log(`✓ 成功: ${name}`);
    if (result && result.data) {
      console.log('  响应:', JSON.stringify(result.data).substring(0, 200));
    }
    return result;
  } catch (err) {
    console.log(`✗ 失败: ${name}`);
    console.log('  错误:', err.message);
    throw err;
  }
}

async function runTests() {
  console.log('====================================');
  console.log('  图书馆借阅系统 API 测试');
  console.log('====================================');

  let readerToken, librarianToken, testBookId, testBorrowId, testReservationId, testFineId;
  let reader2Token, testReviewId;

  try {
    await test('健康检查', async () => {
      return await request('/health');
    });

    await test('读者注册', async () => {
      const res = await request('/auth/register', 'POST', {
        username: 'testuser',
        password: '123456',
        name: '测试读者',
        email: 'test@example.com',
        phone: '13800138000'
      });
      if (res.status === 201) {
        readerToken = res.data.token;
      }
      return res;
    });

    await test('第二个读者注册', async () => {
      const res = await request('/auth/register', 'POST', {
        username: 'testuser2',
        password: '123456',
        name: '测试读者2',
        email: 'test2@example.com',
        phone: '13900139000'
      });
      if (res.status === 201) {
        reader2Token = res.data.token;
      }
      return res;
    });

    await test('馆员登录', async () => {
      const res = await request('/auth/login', 'POST', {
        username: 'admin',
        password: 'admin123'
      });
      if (res.status === 200) {
        librarianToken = res.data.token;
      }
      return res;
    });

    await test('获取当前用户信息', async () => {
      return await request('/auth/me', 'GET', null, readerToken);
    });

    await test('馆员新增图书1', async () => {
      const res = await request('/books', 'POST', {
        isbn: '9787111213826',
        barcode: 'LIB001',
        title: 'JavaScript高级程序设计',
        author: 'Nicholas C. Zakas',
        publisher: '机械工业出版社',
        publish_date: '2020-01-01',
        category: '计算机',
        location: 'A区-1架',
        description: 'JavaScript经典教材'
      }, librarianToken);
      if (res.status === 201) {
        testBookId = res.data.book.id;
      }
      return res;
    });

    await test('馆员新增图书2', async () => {
      return await request('/books', 'POST', {
        isbn: '9787115545189',
        barcode: 'LIB002',
        title: '深入理解计算机系统',
        author: 'Randal E. Bryant',
        publisher: '机械工业出版社',
        publish_date: '2021-01-01',
        category: '计算机',
        location: 'A区-2架',
        description: '计算机系统经典教材'
      }, librarianToken);
    });

    await test('图书搜索', async () => {
      return await request('/books?keyword=JavaScript&page=1&limit=10', 'GET', null, readerToken);
    });

    await test('获取图书详情', async () => {
      return await request(`/books/${testBookId}`, 'GET', null, readerToken);
    });

    await test('扫码借书 (按book_id)', async () => {
      const res = await request('/borrows/borrow', 'POST', {
        book_id: testBookId
      }, readerToken);
      if (res.status === 201) {
        testBorrowId = res.data.borrow.id;
      }
      return res;
    });

    await test('我的借阅列表', async () => {
      return await request('/borrows/my', 'GET', null, readerToken);
    });

    await test('我的当前借阅', async () => {
      return await request('/borrows/my/active', 'GET', null, readerToken);
    });

    await test('续借图书', async () => {
      return await request(`/borrows/renew/${testBorrowId}`, 'POST', null, readerToken);
    });

    await test('读者2预约图书1 (排队机制)', async () => {
      const res = await request('/reservations', 'POST', {
        book_id: testBookId
      }, reader2Token);
      if (res.status === 201) {
        testReservationId = res.data.reservation.id;
      }
      return res;
    });

    await test('我的预约列表', async () => {
      return await request('/reservations/my', 'GET', null, reader2Token);
    });

    await test('读者1还书 (触发通知下一位预约者)', async () => {
      const res = await request(`/borrows/return/${testBookId}`, 'POST', null, readerToken);
      if (res.data.borrow && res.data.borrow.fine) {
        testFineId = res.data.borrow.fine.id;
      }
      return res;
    });

    await test('读者2查询预约状态 (应该已通知)', async () => {
      return await request(`/reservations/${testReservationId}`, 'GET', null, reader2Token);
    });

    await test('读者2扫码借书 (按馆藏编号)', async () => {
      return await request('/borrows/borrow/barcode', 'POST', {
        barcode: 'LIB001'
      }, reader2Token);
    });

    await test('读者2还书 (使其有资格评论)', async () => {
      return await request('/borrows/return/barcode', 'POST', {
        barcode: 'LIB001'
      }, reader2Token);
    });

    await test('我的罚金', async () => {
      return await request('/fines/my', 'GET', null, readerToken);
    });

    await test('读者1发表评论 (5星)', async () => {
      const res = await request(`/books/${testBookId}/reviews`, 'POST', {
        rating: 5,
        content: '非常好的JavaScript入门教材，案例丰富，讲解透彻！'
      }, readerToken);
      if (res.status === 201) {
        testReviewId = res.data.review.id;
      }
      return res;
    });

    await test('读者2发表评论 (4星)', async () => {
      return await request(`/books/${testBookId}/reviews`, 'POST', {
        rating: 4,
        content: '整体不错，部分章节可以更深入一些。'
      }, reader2Token);
    });

    await test('未还书的读者不能评论 (400)', async () => {
      const res = await request('/books/2/reviews', 'POST', {
        rating: 3,
        content: '测试评论'
      }, readerToken);
      if (res.status !== 400) {
        throw new Error(`期望400，实际${res.status}`);
      }
      return res;
    });

    await test('重复评论被拒绝 (400)', async () => {
      const res = await request(`/books/${testBookId}/reviews`, 'POST', {
        rating: 3,
        content: '再次评论'
      }, readerToken);
      if (res.status !== 400) {
        throw new Error(`期望400，实际${res.status}`);
      }
      return res;
    });

    await test('评分超出范围被拒绝 (400)', async () => {
      const res = await request('/books/2/reviews', 'POST', {
        rating: 6,
        content: '评分异常'
      }, reader2Token);
      if (res.status !== 400) {
        throw new Error(`期望400，实际${res.status}`);
      }
      return res;
    });

    await test('获取图书评论列表 (含平均分和分布)', async () => {
      const res = await request(`/books/${testBookId}/reviews`, 'GET', null, readerToken);
      if (res.status === 200) {
        console.log(`  平均分: ${res.data.stats.average_rating}, 评论数: ${res.data.stats.total_count}`);
        console.log(`  分布: 5星=${res.data.stats.distribution['5']}, 4星=${res.data.stats.distribution['4']}`);
      }
      return res;
    });

    await test('读者2删读者1的评论被拒绝 (403)', async () => {
      const res = await request(`/books/${testBookId}/reviews/${testReviewId}`, 'DELETE', null, reader2Token);
      if (res.status !== 403) {
        throw new Error(`期望403，实际${res.status}`);
      }
      return res;
    });

    await test('馆员可以删除任何评论', async () => {
      return await request(`/books/${testBookId}/reviews/${testReviewId}`, 'DELETE', null, librarianToken);
    });

    await test('删除后评论数减少', async () => {
      const res = await request(`/books/${testBookId}/reviews`, 'GET', null, readerToken);
      console.log(`  当前评论数: ${res.data.stats.total_count}`);
      return res;
    });

    await test('馆员查看所有逾期记录', async () => {
      return await request('/admin/overdue', 'GET', null, librarianToken);
    });

    await test('馆员查看系统概览', async () => {
      return await request('/admin/overview', 'GET', null, librarianToken);
    });

    await test('馆员查看所有借阅记录', async () => {
      return await request('/admin/borrows', 'GET', null, librarianToken);
    });

    await test('馆员查看所有预约记录', async () => {
      return await request('/admin/reservations', 'GET', null, librarianToken);
    });

    await test('馆员查看所有罚金记录', async () => {
      return await request('/admin/fines', 'GET', null, librarianToken);
    });

    await test('馆员查看所有读者', async () => {
      return await request('/admin/users', 'GET', null, librarianToken);
    });

    await test('无token访问 (401)', async () => {
      const res = await request('/borrows/my', 'GET');
      if (res.status !== 401) {
        throw new Error(`期望401，实际${res.status}`);
      }
      return res;
    });

    await test('读者访问馆员接口 (403)', async () => {
      const res = await request('/admin/overview', 'GET', null, readerToken);
      if (res.status !== 403) {
        throw new Error(`期望403，实际${res.status}`);
      }
      return res;
    });

    await test('访问不存在的路由 (404)', async () => {
      const res = await request('/nonexistent', 'GET', null, readerToken);
      if (res.status !== 404) {
        throw new Error(`期望404，实际${res.status}`);
      }
      return res;
    });

    console.log('\n====================================');
    console.log('  ✓ 所有测试通过!');
    console.log('====================================');
    process.exit(0);

  } catch (err) {
    console.log('\n====================================');
    console.log('  ✗ 测试失败:', err.message);
    console.log('====================================');
    process.exit(1);
  }
}

setTimeout(runTests, 2000);
