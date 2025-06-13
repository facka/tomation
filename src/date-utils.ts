const formatDate = (date: Date) => {
  return date.toLocaleDateString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit' })
}

const setDateFromToday = (numberOfDays: number) => {
  const date = new Date()
  return formatDate(new Date(date.setDate(date.getDate() + numberOfDays)))
}

const setMonthFromToday = (numberOfMonths: number) => {
  const date = new Date()
  return formatDate(new Date(date.setMonth(date.getMonth() + numberOfMonths)))
}

const tomorrow = setDateFromToday(1)
const yesterday = setDateFromToday(-1)
const nextWeek = setDateFromToday(7)
const lastWeek = setDateFromToday(-7)
const nextMonth = setMonthFromToday(1)
const lastMonth = setMonthFromToday(-1)

const DateUtils = {
  formatDate,
  today: formatDate(new Date()),
  tomorrow,
  nextWeek,
  nextMonth,
  yesterday,
  lastWeek,
  lastMonth
}

export default DateUtils