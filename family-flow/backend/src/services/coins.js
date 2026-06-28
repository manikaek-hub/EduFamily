const db = require('../db/init');

/**
 * Ensure a coins_balance row exists for the member.
 */
function ensureBalance(memberId) {
  db.prepare('INSERT OR IGNORE INTO coins_balance (member_id, coins, total_earned) VALUES (?, 0, 0)').run(memberId);
}

/**
 * Get current coin balance for a member.
 * @returns {{ coins: number, totalEarned: number }}
 */
function getBalance(memberId) {
  ensureBalance(memberId);
  const row = db.prepare('SELECT coins, total_earned FROM coins_balance WHERE member_id = ?').get(memberId);
  return { coins: row.coins, totalEarned: row.total_earned };
}

/**
 * Award coins to a member (positive transaction).
 * @returns {{ coins: number, totalEarned: number }}
 */
function awardCoins(memberId, amount, reason, source, refId = null) {
  if (amount <= 0) throw new Error('Le montant doit être positif');

  ensureBalance(memberId);

  const award = db.transaction(() => {
    db.prepare(
      'INSERT INTO coins_transactions (member_id, amount, reason, source, ref_id) VALUES (?, ?, ?, ?, ?)'
    ).run(memberId, amount, reason, source, refId);

    db.prepare(`
      UPDATE coins_balance
      SET coins = coins + ?, total_earned = total_earned + ?, updated_at = datetime('now')
      WHERE member_id = ?
    `).run(amount, amount, memberId);

    return db.prepare('SELECT coins, total_earned FROM coins_balance WHERE member_id = ?').get(memberId);
  });

  const row = award();
  return { coins: row.coins, totalEarned: row.total_earned };
}

/**
 * Spend coins (negative transaction). Throws if insufficient balance.
 * @returns {{ coins: number, totalEarned: number }}
 */
function spendCoins(memberId, amount, reason, refId = null) {
  if (amount <= 0) throw new Error('Le montant doit être positif');

  ensureBalance(memberId);

  const spend = db.transaction(() => {
    const bal = db.prepare('SELECT coins FROM coins_balance WHERE member_id = ?').get(memberId);
    if (bal.coins < amount) {
      throw new Error(`Solde insuffisant : ${bal.coins} coins disponibles, ${amount} requis`);
    }

    db.prepare(
      'INSERT INTO coins_transactions (member_id, amount, reason, source, ref_id) VALUES (?, ?, ?, ?, ?)'
    ).run(memberId, -amount, reason, 'purchase', refId);

    db.prepare(`
      UPDATE coins_balance
      SET coins = coins - ?, updated_at = datetime('now')
      WHERE member_id = ?
    `).run(amount, memberId);

    return db.prepare('SELECT coins, total_earned FROM coins_balance WHERE member_id = ?').get(memberId);
  });

  const row = spend();
  return { coins: row.coins, totalEarned: row.total_earned };
}

/**
 * Get recent transactions for a member.
 * @returns {Array}
 */
function getTransactions(memberId, limit = 20) {
  return db.prepare(
    'SELECT * FROM coins_transactions WHERE member_id = ? ORDER BY created_at DESC LIMIT ?'
  ).all(memberId, limit);
}

module.exports = { getBalance, awardCoins, spendCoins, getTransactions };
