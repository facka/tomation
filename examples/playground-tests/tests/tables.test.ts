import { Test, AssertHasText } from '@tomationjs/dsl'
import Orders from '~/pom/tables.pom'

// Named columns keep the tests readable (1-based). Defined in the test file so
// the compiler resolves each member to its numeric literal at compile time.
const OrdersColumn = {
  OrderId: 1,
  Customer: 2,
  Total: 3,
  Status: 4,
} as const

Test('Read cells by explicit row and column', () => {
  // Row 1 is the header; row 2 is the first data row
  AssertHasText(Orders.table.cell(2, OrdersColumn.OrderId), '#1001')
  AssertHasText(Orders.table.cell(2, OrdersColumn.Customer), 'Ada Lovelace')
  AssertHasText(Orders.table.cell(2, OrdersColumn.Status), 'Shipped')
})

Test('Read the header row and the last data row', () => {
  // firstRow targets row 1 (the header), lastRow targets the final row
  AssertHasText(Orders.table.firstRow(OrdersColumn.Customer), 'Customer')
  AssertHasText(Orders.table.lastRow(OrdersColumn.Status), 'Cancelled')
})

Test('Read a total using a named column', () => {
  AssertHasText(Orders.table.cell(4, OrdersColumn.Total), '$254.75')
})
