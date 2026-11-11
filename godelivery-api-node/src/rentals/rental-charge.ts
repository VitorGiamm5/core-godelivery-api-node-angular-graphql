export function calculateReturn(returned: Date, estimated: Date, planDays: number, dailyCost: number) {
  const differenceDays = (returned.getTime() - estimated.getTime()) / 86_400_000;
  const chargeableDays = Math.max(0, differenceDays < 0
    ? planDays - Math.ceil(-differenceDays)
    : planDays + Math.trunc(differenceDays));
  const value = differenceDays > 0
    ? Math.ceil(differenceDays) * 50
    : differenceDays < 0
      ? -Math.trunc(differenceDays) * dailyCost * (planDays === 7 ? 0.2 : 0.4)
      : 0;
  const rentalAmount = dailyCost * chargeableDays;
  return {
    message: differenceDays > 0 ? 'Returned after expected' : differenceDays < 0 ? 'Returned before expected' : 'return to base date accepted with success',
    value, chargeableDays, rentalAmount, totalCharge: rentalAmount + value,
  };
}
