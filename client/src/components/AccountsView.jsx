import React, { useMemo } from 'react';
import { computeStats, equitySeries, fmtUSD, fmtNum, accountIdsOf } from '../helpers.js';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import PropFirmsView, { statusColor, statusLabel } from './PropFirmsView.jsx';

const cls = (n) => (n > 0 ? 'pos' : n < 0 ? 'neg' : '');

// Manage prop firms/accounts and track performance per account.
export default function AccountsView({ trades = [], propfirms = [], onUpdate, notify }) {
  const rows = useMemo(() => {
    const out = [];
    for (const f of propfirms) {
      for (const a of (f.accounts || [])) {
        const accTrades = trades.filter((t) => accountIdsOf(t).includes(a.id));
        out.push({
          id: a.id, firm: f.name, type: a.type, name: a.name, balance: a.balance || 0,
          status: a.status || 'active',
          stats: computeStats(accTrades), equity: equitySeries(accTrades),
        });
      }
    }
    return out;
  }, [trades, propfirms]);

  const withTrades = rows.filter((r) => r.stats.count > 0);

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>Prop firms &amp; accounts</h2>
      <PropFirmsView propfirms={propfirms} onUpdate={onUpdate} notify={notify} />

      {rows.length > 0 && (
        <>
          <h2>All accounts</h2>
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="table-wrap">
              <table style={{ width: '100%' }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left' }}>Firm</th>
                    <th style={{ textAlign: 'left' }}>Type</th>
                    <th style={{ textAlign: 'left' }}>Account</th>
                    <th style={{ textAlign: 'left' }}>Status</th>
                    <th style={{ textAlign: 'right' }}>Balance</th>
                    <th style={{ textAlign: 'right' }}>Journal P&amp;L</th>
                    <th style={{ textAlign: 'right' }}>Trades</th>
                    <th style={{ textAlign: 'right' }}>Win %</th>
                    <th style={{ textAlign: 'right' }}>Avg R</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} style={r.status === 'blown' ? { opacity: 0.65 } : undefined}>
                      <td>{r.firm}</td>
                      <td>{r.type || '-'}</td>
                      <td>{r.name}</td>
                      <td style={{ color: statusColor(r.status), fontWeight: 600 }}>{statusLabel(r.status)}</td>
                      <td className="num" style={{ textAlign: 'right' }}>{fmtUSD(r.balance)}</td>
                      <td className={'num ' + cls(r.stats.totalPnl)} style={{ textAlign: 'right' }}>{r.stats.count ? fmtUSD(r.stats.totalPnl) : '-'}</td>
                      <td className="num" style={{ textAlign: 'right' }}>{r.stats.count}</td>
                      <td className="num" style={{ textAlign: 'right' }}>{r.stats.count ? r.stats.winRate.toFixed(0) + '%' : '-'}</td>
                      <td className="num" style={{ textAlign: 'right' }}>{r.stats.avgR == null ? '-' : fmtNum(r.stats.avgR)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="hint" style={{ marginTop: 8 }}>
              Balance is the value you set on the account (edit it above to match your platform's Net Liq). Journal P&amp;L comes from trades linked to the account.
            </div>
          </div>
        </>
      )}

      {withTrades.length > 0 && <h2>Equity curves</h2>}
      {withTrades.map((r) => (
        <div key={r.id} className="card" style={{ marginBottom: 16 }}>
          <h3 style={{ marginTop: 0 }}>
            {r.firm} — {r.name} {r.type ? `(${r.type})` : ''}{' '}
            <span style={{ color: statusColor(r.status), fontSize: 13, fontWeight: 600 }}>● {statusLabel(r.status)}</span>
          </h3>
          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginBottom: 12 }}>
            <div><span className="hint">Balance</span><br /><b>{fmtUSD(r.balance)}</b></div>
            <div><span className="hint">Journal P&amp;L</span><br /><b className={cls(r.stats.totalPnl)}>{fmtUSD(r.stats.totalPnl)}</b></div>
            <div><span className="hint">Trades</span><br /><b>{r.stats.count}</b></div>
            <div><span className="hint">Win rate</span><br /><b>{r.stats.winRate.toFixed(1)}%</b></div>
            <div><span className="hint">Avg R</span><br /><b>{r.stats.avgR == null ? '-' : fmtNum(r.stats.avgR)}</b></div>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={r.equity}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(128,128,128,0.2)" />
              <XAxis dataKey="i" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v) => fmtUSD(v)} labelFormatter={(i) => `Trade #${i}`} />
              <Line type="monotone" dataKey="equity" stroke="#3b82f6" dot={false} strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ))}

      {rows.length > 0 && withTrades.length === 0 && (
        <div className="hint">No trades linked to accounts yet — pick the account in the trade form ("Account (prop firm)") to start tracking per-account performance.</div>
      )}
    </div>
  );
}
