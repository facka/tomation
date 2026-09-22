import { is, idIs } from '@tomationjs/dsl'

// Define the table once as a normal locator
const table = is.TABLE.where(idIs('orders')).as('Orders')

export default { table }
