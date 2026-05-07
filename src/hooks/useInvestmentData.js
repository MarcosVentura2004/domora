import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';

export const DEFAULT_INVESTMENT_DATA = {
  acquisitionType: 'compra',
  purchasePrice: '',
  downPayment: '',
  acquisitionCosts: '',
  mortgageEnabled: false,
  interestRate: '',
  rateType: 'fijo',
  loanYears: '',
  loanStartDate: '',
};

export function useInvestmentData(property) {
  const [investmentData, setInvestmentData] = useState(() =>
    property?.investmentData
      ? { ...DEFAULT_INVESTMENT_DATA, ...property.investmentData }
      : { ...DEFAULT_INVESTMENT_DATA }
  );
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [historyPayments, setHistoryPayments] = useState([]);

  useEffect(() => {
    setInvestmentData(
      property?.investmentData
        ? { ...DEFAULT_INVESTMENT_DATA, ...property.investmentData }
        : { ...DEFAULT_INVESTMENT_DATA }
    );
    setSaved(false);
    if (!property?.id) return;
    supabase
      .from('payments')
      .select('year, month, amount, status')
      .eq('property_id', String(property.id))
      .eq('status', 'confirmed')
      .then(({ data }) => { if (data) setHistoryPayments(data); });
  }, [property?.id]); // eslint-disable-line

  // save(onUpdate, mortgageCalc) — mortgageCalc is the result of computeMortgage(), or null
  const save = async (onUpdate, mortgageCalc) => {
    if (!property) return;
    setSaving(true);

    const isHerencia = investmentData.acquisitionType === 'herencia_donacion';
    const effectiveDownPayment = isHerencia ? 0 : (parseFloat(investmentData.downPayment) || 0);
    const loanCapital = Math.max(
      0,
      (parseFloat(investmentData.purchasePrice) || 0) - effectiveDownPayment
    );

    const dataToSave = {
      ...investmentData,
      downPayment: isHerencia ? '0' : investmentData.downPayment,
      loanCapital: String(loanCapital),
      monthlyMortgage: mortgageCalc
        ? String(mortgageCalc.monthlyPayment.toFixed(2))
        : '',
      monthlyAmortization: mortgageCalc
        ? String(mortgageCalc.monthlyAmortization.toFixed(2))
        : '',
    };

    const updatedProperty = { ...property, investmentData: dataToSave };

    await supabase
      .from('properties')
      .update({
        data: updatedProperty,
        updated_at: new Date().toISOString(),
        purchase_price: parseFloat(investmentData.purchasePrice) || null,
        acquisition_costs: parseFloat(investmentData.acquisitionCosts) || null,
        monthly_mortgage: mortgageCalc ? mortgageCalc.monthlyPayment : null,
        monthly_amortization: mortgageCalc ? mortgageCalc.monthlyAmortization : null,
      })
      .eq('id', property.id);

    setSaving(false);
    setSaved(true);
    if (onUpdate) onUpdate(updatedProperty);
  };

  return { investmentData, setInvestmentData, saving, saved, setSaved, historyPayments, save };
}
