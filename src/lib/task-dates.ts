function validDate(value: string | null) {
  return !value || (/^\d{4}-\d{2}-\d{2}$/.test(value)
    && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value);
}

export function validTaskDates(start: string | null, end: string | null) {
  return validDate(start) && validDate(end) && (!start || !!end) && (!start || !end || start <= end);
}
