function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function daysBetween(date1, date2) {
  const oneDay = 24 * 60 * 60 * 1000;
  const firstDate = new Date(date1);
  const secondDate = new Date(date2);
  return Math.round((secondDate - firstDate) / oneDay);
}

function formatDate(date) {
  return new Date(date).toISOString().split('T')[0];
}

function now() {
  return new Date().toISOString();
}

function isOverdue(dueDate) {
  return new Date(dueDate) < new Date();
}

module.exports = {
  addDays,
  daysBetween,
  formatDate,
  now,
  isOverdue
};
