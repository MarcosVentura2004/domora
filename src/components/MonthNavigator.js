import React, { useState, useEffect, useRef } from 'react';

const MONTHS_ES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

function formatMonthYear(year, month) {
  const names = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  return `${names[month]} de ${year}`;
}

export default function MonthNavigator({
  year, month, minYear, minMonth,
  onPrev, onNext, onJump,
  forcePickerOpen, onPickerClose,
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerYear, setPickerYear] = useState(year);
  const wrapperRef = useRef(null);

  // Open picker when parent requests it (e.g. from ⋮ menu)
  useEffect(() => {
    if (forcePickerOpen) {
      setPickerYear(year);
      setPickerOpen(true);
    }
  }, [forcePickerOpen]); // eslint-disable-line

  // Close picker on outside click
  useEffect(() => {
    if (!pickerOpen) return;
    const handler = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setPickerOpen(false);
        onPickerClose?.();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [pickerOpen]); // eslint-disable-line

  const now = new Date();
  const atMinMonth = year === minYear && month === minMonth;
  const atMaxMonth = year === now.getFullYear() && month === now.getMonth();

  const isCellDisabled = (y, m) => {
    if (y < minYear || (y === minYear && m < minMonth)) return true;
    if (y > now.getFullYear() || (y === now.getFullYear() && m > now.getMonth())) return true;
    return false;
  };

  const isCellPast = (y, m) => {
    if (y > now.getFullYear() || (y === now.getFullYear() && m >= now.getMonth())) return false;
    if (isCellDisabled(y, m)) return false;
    return true;
  };

  return (
    <div className="month-navigator" ref={wrapperRef}>
      <div className="month-nav-row">
        <button className="month-nav-btn" type="button" onClick={onPrev} disabled={atMinMonth}>‹</button>
        <button
          className="month-label month-label-btn"
          type="button"
          onClick={() => { setPickerYear(year); setPickerOpen(o => !o); }}
        >
          {formatMonthYear(year, month)}
        </button>
        <button className="month-nav-btn" type="button" onClick={onNext} disabled={atMaxMonth}>›</button>
      </div>

      {pickerOpen && (
        <div className="month-picker">
          <div className="month-picker-year-row">
            <button type="button" className="month-picker-year-btn"
              disabled={pickerYear <= minYear}
              onClick={() => setPickerYear(y => y - 1)}>‹</button>
            <span className="month-picker-year-label">{pickerYear}</span>
            <button type="button" className="month-picker-year-btn"
              disabled={pickerYear >= now.getFullYear()}
              onClick={() => setPickerYear(y => y + 1)}>›</button>
          </div>
          <div className="month-picker-grid">
            {MONTHS_ES.map((label, m) => {
              const selected = pickerYear === year && m === month;
              const disabled = isCellDisabled(pickerYear, m);
              const past = !selected && isCellPast(pickerYear, m);
              return (
                <button key={m} type="button"
                  className={`month-picker-cell${selected ? ' selected' : ''}${disabled ? ' disabled' : ''}${past ? ' past' : ''}`}
                  disabled={disabled}
                  onClick={() => {
                    onJump(pickerYear, m);
                    setPickerOpen(false);
                    onPickerClose?.();
                  }}>
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
