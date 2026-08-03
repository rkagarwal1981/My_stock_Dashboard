"""
Capital Analytics Service
─────────────────────────
Efficiency metrics, realized profit, and monthly/daily average buy/sell calculations.
"""

from datetime import datetime
from typing import List, Dict, Any, Optional
from sqlalchemy.orm import Session
from sqlalchemy import func

from models.transaction import Transaction
from services.lifo_engine import compute_lifo_settlement


BASELINE_DATE = datetime(2025, 1, 1)


def _get_monthly_buy_sell(
    db: Session,
    broker: Optional[str] = None,
) -> Dict[str, Dict[str, float]]:
    """
    Aggregate total monthly BUY and SELL values from the Transaction table.

    Returns: { 'YYYY-MM': { 'buy': float, 'sell': float }, ... }
    """
    query = db.query(
        func.strftime('%Y-%m', Transaction.transaction_date).label('month'),
        Transaction.buy_sell,
        func.sum(Transaction.quantity * Transaction.price).label('total_value'),
    ).filter(
        Transaction.transaction_date >= BASELINE_DATE
    ).group_by(
        func.strftime('%Y-%m', Transaction.transaction_date),
        Transaction.buy_sell,
    )

    from sqlalchemy import not_
    query = query.filter(
        not_(Transaction.script.ilike('%PE-EQ')),
        not_(Transaction.script.ilike('%CE-EQ')),
        not_(Transaction.script.ilike('%ETF-EQ')),
        not_(Transaction.script.ilike('%FUT')),
        not_(Transaction.script.ilike('%BEES-EQ')),
        not_(Transaction.script.ilike('SGB%'))
    )

    if broker and broker.lower() not in ("all", ""):
        query = query.filter(Transaction.broker.ilike(broker))

    rows = query.all()

    monthly: Dict[str, Dict[str, float]] = {}
    for row in rows:
        m = row.month
        if m not in monthly:
            monthly[m] = {"buy": 0.0, "sell": 0.0}
        bs = row.buy_sell.upper()
        if bs == "BUY":
            monthly[m]["buy"] += float(row.total_value or 0)
        elif bs == "SELL":
            monthly[m]["sell"] += float(row.total_value or 0)

    return monthly


def _get_monthly_active_days(
    db: Session,
    broker: Optional[str] = None,
) -> Dict[str, int]:
    """
    Get the count of active trading days (unique days with transactions) per month.
    """
    query = db.query(
        func.strftime('%Y-%m', Transaction.transaction_date).label('month'),
        func.count(func.distinct(func.strftime('%Y-%m-%d', Transaction.transaction_date))).label('days_count')
    ).filter(
        Transaction.transaction_date >= BASELINE_DATE
    ).group_by(
        func.strftime('%Y-%m', Transaction.transaction_date)
    )

    from sqlalchemy import not_
    query = query.filter(
        not_(Transaction.script.ilike('%PE-EQ')),
        not_(Transaction.script.ilike('%CE-EQ')),
        not_(Transaction.script.ilike('%ETF-EQ')),
        not_(Transaction.script.ilike('%FUT')),
        not_(Transaction.script.ilike('%BEES-EQ')),
        not_(Transaction.script.ilike('SGB%'))
    )

    if broker and broker.lower() not in ("all", ""):
        query = query.filter(Transaction.broker.ilike(broker))

    rows = query.all()
    return {row.month: int(row.days_count or 1) for row in rows}


def _get_monthly_realized_profit(
    db: Session,
    broker: Optional[str] = None,
) -> Dict[str, float]:
    """
    Compute monthly realized profit from LIFO settlement.
    Returns: { 'YYYY-MM': net_realized_pnl, ... }
    """
    query = db.query(Transaction)
    from sqlalchemy import not_
    query = query.filter(
        not_(Transaction.script.ilike('%PE-EQ')),
        not_(Transaction.script.ilike('%CE-EQ')),
        not_(Transaction.script.ilike('%ETF-EQ')),
        not_(Transaction.script.ilike('%FUT')),
        not_(Transaction.script.ilike('%BEES-EQ')),
        not_(Transaction.script.ilike('SGB%'))
    )
    if broker and broker.lower() not in ("all", ""):
        query = query.filter(Transaction.broker.ilike(broker))
    txs = query.all()

    settlement = compute_lifo_settlement(txs)

    month_profit: Dict[str, float] = {}
    for row in settlement:
        if row.get("pnl") is None or row.get("sell_date") is None:
            continue
        sd = row["sell_date"]
        if isinstance(sd, str):
            sd = datetime.fromisoformat(sd)
        month_key = sd.strftime("%Y-%m")
        month_profit[month_key] = month_profit.get(month_key, 0.0) + float(row["pnl"])

    return month_profit


def _generate_month_sequence(start_year: int = 2025, start_month: int = 1) -> List[str]:
    """Generate a sorted list of 'YYYY-MM' strings from the start date to the current month."""
    now = datetime.now()
    months = []
    y, m = start_year, start_month
    while (y, m) <= (now.year, now.month):
        months.append(f"{y:04d}-{m:02d}")
        m += 1
        if m > 12:
            m = 1
            y += 1
    return months


def compute_capital_efficiency(
    db: Session,
    broker: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """
    Core computation engine.

    For each month from Jan 2025 to present, compute:
    - Trading Efficiency %
    - Rotation Efficiency %
    - Realized Profit
    - Daily Average Buy Value (Avg. Buy)
    - Daily Average Sell Value (Avg. Sell)

    Returns list of dicts sorted by month ascending.
    """
    monthly_bs = _get_monthly_buy_sell(db, broker)
    monthly_profit = _get_monthly_realized_profit(db, broker)
    monthly_active_days = _get_monthly_active_days(db, broker)
    all_months = _generate_month_sequence()

    results = []

    for month in all_months:
        buys = monthly_bs.get(month, {}).get("buy", 0.0)
        sells = monthly_bs.get(month, {}).get("sell", 0.0)
        profit = monthly_profit.get(month, 0.0)
        active_days = monthly_active_days.get(month, 0)

        # Efficiency calculations (guarded against division by zero)
        trading_eff = (profit / sells * 100.0) if sells > 0 else 0.0
        rotation_eff = (profit / (buys + sells) * 100.0) if (buys + sells) > 0 else 0.0

        # Daily averages
        avg_buy = (buys / active_days) if active_days > 0 else 0.0
        avg_sell = (sells / active_days) if active_days > 0 else 0.0

        results.append({
            "month": month,
            "total_buys": round(buys, 2),
            "total_sells": round(sells, 2),
            "realized_profit": round(profit, 2),
            "trading_eff": round(trading_eff, 4),
            "rotation_eff": round(rotation_eff, 4),
            "avg_buy": round(avg_buy, 2),
            "avg_sell": round(avg_sell, 2),
        })

    return results
