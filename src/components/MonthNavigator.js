// frontend/src/components/MonthNavigator.js
import React, { useState, useEffect, useRef } from 'react';

const MONTHS_ES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

function formatMonthYear(year, month) {
  const date = new Date(year, month, 1);
  return date.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })
    .replace(/^\w/, c => c.toUpperCase());
}

export default function MonthNavigator({
  year, month, minYear, minMonth,
  onPrev, onNext, onJump,
  isPastMonth, isEditMode,
  onEdit, onSave, onCancel,
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerYear, setPickerYear] = useState(year);
  const wrapperRef = useRef(null);

  useEffect(() => {
    if (!pickerOpen) return;
    const handler = (e) => {
      if (!wrapperRef.current?.contains(e.target)) setPickerOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [pickerOpen]);

  const now = new Date();
  const atMinMonth = year === minYear && month === minMonth;
  const atMaxMonth = year === now.getFullYear() && month === now.getMonth();

  const isCellDisabled = (y, m) => {
    if (y < minYear || (y === minYear && m < minMonth)) return true;
    if (y > now.getFullYear() || (y === now.getFullYear() && m > now.getMonth())) return true;
    return false;
  };

  return (
    <div className="month-navigator" ref={wrapperRef}>
      <div className="month-nav-row">
        <button className="month-nav-btn" type="button" onClick={onPrev} disabled={atMinMonth}>‹</button>
        <button
          className="month-label month-label-btn"
          onClick={() => { setPickerYear(year); setPickerOpen(o => !o); }}
          type="button"
        >
          {formatMonthYear(year, month)}
        </button>
        <button className="month-nav-btn" type="button" onClick={onNext} disabled={atMaxMonth}>›</button>
        {isPastMonth && !isEditMode && onEdit && (
          <button className="month-edit-btn" onClick={onEdit} type="button">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" style={{ marginRight: 5, flexShrink: 0 }}>
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Editar mes
          </button>
        )}
      </div>

      {pickerOpen && (
        <div className="month-picker">
          <div className="month-picker-year-row">
            <button
              className="month-picker-year-btn"
              type="button"
              onClick={() => setPickerYear(y => y - 1)}
              disabled={pickerYear <= minYear}
            >‹</button>
            <span className="month-picker-year-label">{pickerYear}</span>
            <button
              className="month-picker-year-btn"
              type="button"
              onClick={() => setPickerYear(y => y + 1)}
              disabled={pickerYear >= now.getFullYear()}
            >›</button>
          </div>
          <div className="month-picker-grid">
            {MONTHS_ES.map((label, m) => {
              const disabled = isCellDisabled(pickerYear, m);
              const selected = pickerYear === year && m === month;
              return (
                <button
                  key={m}
                  type="button"
                  className={`month-picker-cell${selected ? ' selected' : ''}${disabled ? ' disabled' : ''}`}
                  disabled={disabled}
                  onClick={() => { onJump(pickerYear, m); setPickerOpen(false); }}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {isPastMonth && (
        <div className={`month-mode-banner${isEditMode ? ' edit' : ''}`}>
          {isEditMode ? (
            <>
              <span className="month-mode-banner-text">Editando mes pasado</span>
              <div className="month-mode-banner-actions">
                <button className="month-save-btn" type="button" onClick={onSave}>Guardar cambios</button>
                <button className="month-cancel-btn" type="button" onClick={onCancel}>Cancelar</button>
              </div>
            </>
          ) : (
            <span className="month-mode-banner-text">Mes en modo lectura — pulsa Editar para modificar</span>
          )}
        </div>
      )}
    </div>
  );
}
