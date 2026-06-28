const JOIN_FIELDS = {
  userBasic: 'u.name AS user_name, u.username',
  userContact: 'u.name AS user_name, u.username, u.phone, u.email',
  bookBasic: 'bk.title AS book_title, bk.isbn, bk.barcode, bk.author',
  bookWithStatus: 'bk.title AS book_title, bk.isbn, bk.barcode, bk.author, bk.status AS book_status',
  borrowBasic: 'b.borrow_date, b.due_date, b.return_date'
};

const joinUsers = (alias = 'u', onField = 'user_id', fields = 'basic') => {
  const fieldKey = fields === 'contact' ? 'userContact' : 'userBasic';
  return {
    join: `JOIN users ${alias} ON ${alias}.id = T.${onField}`,
    fields: JOIN_FIELDS[fieldKey].replace(/u\./g, `${alias}.`)
  };
};

const joinBooks = (alias = 'bk', onField = 'book_id', fields = 'basic') => {
  const fieldKey = fields === 'withStatus' ? 'bookWithStatus' : 'bookBasic';
  return {
    join: `JOIN books ${alias} ON ${alias}.id = T.${onField}`,
    fields: JOIN_FIELDS[fieldKey].replace(/bk\./g, `${alias}.`)
  };
};

const leftJoinBorrowsWithBooks = (borrowAlias = 'b', bookAlias = 'bk') => {
  return {
    join: [
      `LEFT JOIN borrows ${borrowAlias} ON ${borrowAlias}.id = T.borrow_id`,
      `LEFT JOIN books ${bookAlias} ON ${bookAlias}.id = ${borrowAlias}.book_id`
    ].join(' '),
    fields: [
      JOIN_FIELDS.borrowBasic.replace(/b\./g, `${borrowAlias}.`),
      JOIN_FIELDS.bookBasic.replace(/bk\./g, `${bookAlias}.`)
    ].join(', ')
  };
};

const buildReviewStats = (reviews) => {
  const total = reviews.length;
  if (total === 0) {
    return {
      total_count: 0,
      average_rating: 0,
      distribution: { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 }
    };
  }

  const distribution = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
  let sum = 0;
  let validCount = 0;
  reviews.forEach(r => {
    const rating = Number(r.rating);
    if (!Number.isNaN(rating) && rating >= 1 && rating <= 5) {
      sum += rating;
      validCount++;
      distribution[rating] = (distribution[rating] || 0) + 1;
    }
  });

  const avg = validCount > 0 ? sum / validCount : 0;
  const safeAvg = Number.isNaN(avg) || !Number.isFinite(avg) ? 0 : avg;

  return {
    total_count: total,
    average_rating: Math.round(safeAvg * 100) / 100,
    distribution
  };
};

module.exports = {
  JOIN_FIELDS,
  joinUsers,
  joinBooks,
  leftJoinBorrowsWithBooks,
  buildReviewStats
};
