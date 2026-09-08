const crypto = require('crypto');

function uid(prefix) {
  return `${prefix}_${crypto.randomBytes(4).toString('hex')}`;
}

// Devuelve una fecha futura (no domingo) en formato YYYY-MM-DD
function futureWeekday(daysAhead = 4) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + daysAhead);
  while (d.getUTCDay() === 0) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

// Devuelve el próximo domingo futuro en formato YYYY-MM-DD
function futureSunday() {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 10);
  while (d.getUTCDay() !== 0) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

// Hoy en zona America/Bogota en formato YYYY-MM-DD
function todayBogota() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(new Date());
}

module.exports = { uid, futureWeekday, futureSunday, todayBogota };