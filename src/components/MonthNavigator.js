import React, { useState, useEffect, useRef } from 'react';

const MONTHS_ES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

function formatMonthYear(year, month) {
  const names = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  return `${names[month]} de ${year}`;
}

function PencilIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/>
    </svg>
  );
}

export default function MonthNavigator({
  year, month, minYear, minMonth,
  onPrev, onNext, onJump,
  isPastMonth, isEditMode, onEdit, onSave, onCancel,
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerYear, setPickerYear] = useState(year);
  const wrapperRef = useRef(null);

  // Close picker on outside click
  useEffect(() => {
    if (!pickerOpen) return;
    const handler = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setPickerOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [pickerOpen]);

  const now = new Date();
  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth();
  const atMinMonth = year === minYear && month === minMonth;

  const isCellDisabled = (y, m) => {
    if (y < minYear || (y === minYear && m < minMonth)) return true;
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
        <div className="month-nav-side month-nav-left" />
        <div className="month-nav-center">
          <button className="month-nav-btn" type="button" onClick={onPrev} disabled={atMinMonth}>‹</button>
          <button
            className={`month-label month-label-btn${isCurrentMonth ? ' current-month' : ''}`}
            type="button"
            onClick={() => { setPickerYear(year); setPickerOpen(o => !o); }}
          >
            {formatMonthYear(year, month)}
          </button>
          <button className="month-nav-btn" type="button" onClick={onNext}>›</button>
        </div>
        <div className="month-nav-side month-nav-right">
          {isPastMonth && !isEditMode && onEdit && (
            <button className="month-nav-edit-btn" type="button" onClick={onEdit} title="Editar mes">
              <PencilIcon />
            </button>
          )}
          {isPastMonth && isEditMode && (
            <div className="month-nav-edit-actions">
              <button className="month-nav-save-btn" type="button" onClick={onSave}>Guardar</button>
              <button className="month-nav-cancel-btn" type="button" onClick={onCancel}>Descartar</button>
            </div>
          )}
        </div>
      </div>

      {pickerOpen && (
        <div className="month-picker">
          <div className="month-picker-year-row">
            <button type="button" className="month-picker-year-btn"
              disabled={pickerYear <= minYear}
              onClick={() => setPickerYear(y => y - 1)}>‹</button>
            <span className="month-picker-year-label">{pickerYear}</span>
            <button type="button" className="month-picker-year-btn"
              disabled={pickerYear >= now.getFullYear() + 2}
              onClick={() => setPickerYear(y => y + 1)}>›</button>
          </div>
          <div className="month-picker-grid">
            {MONTHS_ES.map((label, m) => {
              const selected = pickerYear === year && m === month;
              const current = pickerYear === now.getFullYear() && m === now.getMonth();
              const disabled = isCellDisabled(pickerYear, m);
              const past = !selected && !current && isCellPast(pickerYear, m);
              return (
                <button key={m} type="button"
                  className={`month-picker-cell${selected && !current ? ' selected' : ''}${current ? ' current' : ''}${disabled ? ' disabled' : ''}${past ? ' past' : ''}`}
                  disabled={disabled}
                  onClick={() => {
                    onJump(pickerYear, m);
                    setPickerOpen(false);
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
